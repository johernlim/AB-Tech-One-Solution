import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleStaff, passwordHash, validateProducts, validPassword} from '../auth-worker/staff.mjs';
const origin = 'https://ab-tech-one-solution.pages.dev';
const password = 'Camera1!';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile(new URL('../auth-worker/staff-schema.sql', import.meta.url), 'utf8'));
const db = {prepare(sql) {
  let parameters = [];
  const query = {bind(...args) {parameters = args; return query;}, async first() {return sqlite.prepare(sql).get(...parameters) || null;}, async run() {const result = sqlite.prepare(sql).run(...parameters); return {meta: {changes: Number(result.changes)}};}};
  return query;
}, async batch(queries) {return Promise.all(queries.map(query => query.run()));}};
const env = {ALLOWED_ORIGIN: origin, GITHUB_REPO: 'johernlim/AB-Tech-One-Solution', STAFF_DB: db, STAFF_INVITE_CODE: 'invitation-code-for-trusted-staff', STAFF_PASSWORD_PEPPER: 'a-test-only-password-pepper-of-32-characters', GITHUB_CATALOGUE_TOKEN: 'private-github-token'};
const request = (path, method = 'GET', data, token, source = origin) => new Request('https://auth.workers.dev/staff/' + path, {method, headers: {Origin: source, 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1', ...(token ? {Authorization: 'Bearer ' + token} : {})}, ...(data ? {body: JSON.stringify(data)} : {})});
const account = {username: 'Test_Staff', password, confirmPassword: password, invitation: env.STAFF_INVITE_CODE};
const registry = JSON.parse(await readFile(new URL('../data/categories.json', import.meta.url), 'utf8'));
const registryResponse = () => Response.json({sha: 'd'.repeat(40), content: Buffer.from(JSON.stringify(registry)).toString('base64')});
test.beforeEach(() => sqlite.exec('DELETE FROM staff_attempts'));

test('Registration requires eight characters, a number and a special symbol', async () => {
  assert.equal(validPassword('Camera1!'), true);
  assert.equal(validPassword('Camera1_'), true);
  for (const value of ['Short1!', 'Password!', 'Password1', 'Password1 ', 'a'.repeat(127) + '1!']) {
    assert.equal(validPassword(value), false);
    assert.equal((await handleStaff(request('register', 'POST', {...account, password: value, confirmPassword: value}), env)).status, 400);
  }
});

test('Staff registration, uniqueness, private passwords and session revocation', async () => {
  assert.equal((await handleStaff(request('register', 'POST', {...account, invitation: 'wrong'}), env)).status, 403);
  assert.equal((await handleStaff(request('register', 'POST', {...account, confirmPassword: 'different'}), env)).status, 400);
  assert.equal((await handleStaff(request('register', 'POST', account), env)).status, 201);
  assert.equal((await handleStaff(request('register', 'POST', {...account, username: 'TEST_STAFF'}), env)).status, 409);
  const user = sqlite.prepare('SELECT * FROM staff_users').get();
  assert.equal(user.username, 'test_staff'); assert.notEqual(user.password_hash, password); assert.equal(user.password_hash.length, 64);
  assert.notEqual(await passwordHash(password, '01'.repeat(32), env.STAFF_PASSWORD_PEPPER), user.password_hash);
  assert.equal((await handleStaff(request('login', 'POST', {...account, password: 'this password is incorrect'}), env)).status, 401);
  const login = await handleStaff(request('login', 'POST', account), env);
  assert.equal(login.status, 200); const {token} = await login.json(); assert.match(token, /^[a-f0-9]{64}$/);
  const session = sqlite.prepare('SELECT * FROM staff_sessions').get(); assert.notEqual(session.token_hash, token);
  assert.equal((await handleStaff(request('me', 'GET', undefined, token), env)).status, 200);
  assert.equal((await handleStaff(request('me', 'GET', undefined, token, 'https://evil.example'), env)).status, 403);
  assert.equal((await handleStaff(request('logout', 'POST', undefined, token), env)).status, 200);
  assert.equal((await handleStaff(request('me', 'GET', undefined, token), env)).status, 401);
});
test('Unauthenticated publishing is blocked and missing setup is reported', async () => {
  assert.equal((await handleStaff(request('categories/cctv', 'PUT', {products: []}), env)).status, 401);
  const status = await handleStaff(request('status'), {...env, STAFF_DB: undefined});
  assert.equal((await status.json()).configured, false);
  assert.equal((await handleStaff(request('status'), env)).headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await handleStaff(request('login', 'OPTIONS'), env)).status, 204);
});
test('Existing accounts can log in and log out when invitations are missing', async () => {
  const withoutInvitation = {...env, STAFF_INVITE_CODE: undefined};
  const status = await (await handleStaff(request('status'), withoutInvitation)).json();
  assert.equal(status.configured, false);
  assert.equal(status.loginConfigured, true);
  assert.equal(status.registrationConfigured, false);
  const login = await handleStaff(request('login', 'POST', account), withoutInvitation);
  assert.equal(login.status, 200);
  const {token} = await login.json();
  assert.equal((await handleStaff(request('me', 'GET', undefined, token), withoutInvitation)).status, 200);
  assert.equal((await handleStaff(request('register', 'POST', account), withoutInvitation)).status, 503);
  assert.equal((await handleStaff(request('logout', 'POST', undefined, token), withoutInvitation)).status, 200);
});
test('Product validation rejects foreign images, duplicate IDs and wrong categories', async () => {
  const {products} = JSON.parse(await readFile(new URL('../data/categories/cctv.json', import.meta.url), 'utf8'));
  assert.equal(validateProducts(products, 'CCTV Systems'), true);
  assert.equal(validateProducts([], 'CCTV Systems'), true);
  assert.equal(validateProducts([products[0], products[0]], 'CCTV Systems'), false);
  assert.equal(validateProducts([{...products[0], image: 'https://evil.example/photo.svg'}], 'CCTV Systems'), false);
  assert.equal(validateProducts(products, 'Alarm Systems'), false);
});
test('Publishing uses the private GitHub token and rejects stale edits', async () => {
  const login = await handleStaff(request('login', 'POST', account), env); const {token} = await login.json();
  const original = globalThis.fetch;
  try {
    let call;
    globalThis.fetch = async (url, options) => {if (url.includes('/contents/data/categories.json?')) return registryResponse(); call = {url, options}; return Response.json({content: {sha: 'b'.repeat(40)}});};
    const {products} = JSON.parse(await readFile(new URL('../data/categories/cctv.json', import.meta.url), 'utf8'));
    const response = await handleStaff(request('categories/cctv', 'PUT', {sha: 'a'.repeat(40), products}, token), env);
    assert.equal(response.status, 200);
    assert.ok(call.url.endsWith('/contents/data/categories/cctv.json'));
    assert.equal(call.options.headers.Authorization, 'Bearer private-github-token');
    assert.equal(JSON.parse(call.options.body).sha, 'a'.repeat(40));
    assert.ok(!(await response.text()).includes(env.GITHUB_CATALOGUE_TOKEN));
    globalThis.fetch = async url => url.includes('/contents/data/categories.json?') ? registryResponse() : new Response('', {status: 409});
    assert.equal((await handleStaff(request('categories/cctv', 'PUT', {sha: 'a'.repeat(40), products}, token), env)).status, 409);
    assert.equal((await handleStaff(request('categories/not-a-category', 'PUT', {products}, token), env)).status, 404);
  } finally {globalThis.fetch = original;}
});
test('Expired sessions are rejected', async () => {
  const login = await handleStaff(request('login', 'POST', account), env); assert.equal(login.status, 200); const {token} = await login.json();
  sqlite.exec('UPDATE staff_sessions SET expires_at=0');
  assert.equal((await handleStaff(request('me', 'GET', undefined, token), env)).status, 401);
});

test('Repeated successful staff logins on office Wi-Fi do not consume the failure allowance', async () => {
  const colleague = {...account, username: 'office_colleague'};
  assert.equal((await handleStaff(request('register', 'POST', colleague), env)).status, 201);
  for (let i = 0; i < 32; i++) {
    const response = await handleStaff(request('login', 'POST', i % 2 ? colleague : account), env);
    assert.equal(response.status, 200);
    const {token} = await response.json();
    assert.equal((await handleStaff(request('logout', 'POST', undefined, token), env)).status, 200);
  }
  assert.equal(sqlite.prepare("SELECT SUM(count) AS count FROM staff_attempts WHERE key LIKE 'login:%'").get().count, 0);
});

test('Successful logins preserve failures; blocked login does not block an existing editing session', async () => {
  const wrong = {...account, password: 'Incorrect1!'};
  for (let i = 0; i < 3; i++) assert.equal((await handleStaff(request('login', 'POST', wrong), env)).status, 401);
  const login = await handleStaff(request('login', 'POST', account), env);
  assert.equal(login.status, 200); const {token} = await login.json();
  assert.equal(sqlite.prepare("SELECT count FROM staff_attempts WHERE key='login:user:test_staff'").get().count, 3);
  assert.equal(sqlite.prepare("SELECT count FROM staff_attempts WHERE key LIKE 'login:ip:%'").get().count, 3);
  for (let i = 3; i < 10; i++) assert.equal((await handleStaff(request('login', 'POST', wrong), env)).status, 401);
  assert.equal((await handleStaff(request('login', 'POST', account), env)).status, 429);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => url.includes('/contents/data/categories.json?') ? registryResponse() : Response.json({content: {sha: 'c'.repeat(40)}});
    const {products} = JSON.parse(await readFile(new URL('../data/categories/cctv.json', import.meta.url), 'utf8'));
    assert.equal((await handleStaff(request('categories/cctv', 'PUT', {sha: 'b'.repeat(40), products}, token), env)).status, 200);
  } finally {globalThis.fetch = original;}
  sqlite.exec('UPDATE staff_attempts SET expires_at=0');
  assert.equal((await handleStaff(request('login', 'POST', account), env)).status, 200);
});

test('Parallel incorrect passwords cannot bypass the username allowance', async () => {
  const responses = await Promise.all(Array.from({length: 25}, () => handleStaff(request('login', 'POST', {...account, password: 'Incorrect1!'}), env)));
  assert.equal(responses.filter(response => response.status === 401).length, 10);
  assert.equal(responses.filter(response => response.status === 429).length, 15);
  assert.equal(sqlite.prepare("SELECT count FROM staff_attempts WHERE key='login:user:test_staff'").get().count, 10);
});

test('Office IP allowance still limits failures spread across different usernames', async () => {
  for (let i = 0; i < 20; i++) {
    assert.equal((await handleStaff(request('login', 'POST', {username: 'unknown_' + i, password: 'Incorrect1!'}), env)).status, 401);
  }
  assert.equal((await handleStaff(request('login', 'POST', account), env)).status, 429);
});

test('Registration throttling and old combined counters do not block staff login', async () => {
  const invalid = {...account, invitation: 'wrong'};
  for (let i = 0; i < 10; i++) assert.equal((await handleStaff(request('register', 'POST', invalid), env)).status, 403);
  assert.equal((await handleStaff(request('register', 'POST', invalid), env)).status, 429);
  sqlite.prepare('INSERT INTO staff_attempts (key,count,expires_at) VALUES (?,?,?)').run('user:test_staff', 99, Math.floor(Date.now() / 1000) + 900);
  assert.equal((await handleStaff(request('login', 'POST', account), env)).status, 200);
});
