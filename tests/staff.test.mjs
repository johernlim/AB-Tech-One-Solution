import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleStaff, passwordHash, validateProducts} from '../auth-worker/staff.mjs';
const origin = 'https://ab-tech-one-solution.pages.dev';
const password = 'a long staff passphrase 123';
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
    globalThis.fetch = async (url, options) => {call = {url, options}; return Response.json({content: {sha: 'b'.repeat(40)}});};
    const {products} = JSON.parse(await readFile(new URL('../data/categories/cctv.json', import.meta.url), 'utf8'));
    const response = await handleStaff(request('categories/cctv', 'PUT', {sha: 'a'.repeat(40), products}, token), env);
    assert.equal(response.status, 200);
    assert.ok(call.url.endsWith('/contents/data/categories/cctv.json'));
    assert.equal(call.options.headers.Authorization, 'Bearer private-github-token');
    assert.equal(JSON.parse(call.options.body).sha, 'a'.repeat(40));
    assert.ok(!(await response.text()).includes(env.GITHUB_CATALOGUE_TOKEN));
    globalThis.fetch = async () => new Response('', {status: 409});
    assert.equal((await handleStaff(request('categories/cctv', 'PUT', {sha: 'a'.repeat(40), products}, token), env)).status, 409);
    assert.equal((await handleStaff(request('categories/not-a-category', 'PUT', {products}, token), env)).status, 404);
  } finally {globalThis.fetch = original;}
});
test('Expired sessions and repeated login attempts are rejected', async () => {
  const login = await handleStaff(request('login', 'POST', account), env); const {token} = await login.json();
  sqlite.exec('UPDATE staff_sessions SET expires_at=0');
  assert.equal((await handleStaff(request('me', 'GET', undefined, token), env)).status, 401);
  let response;
  for (let i = 0; i < 21; i++) response = await handleStaff(request('login', 'POST', account), env);
  assert.equal(response.status, 429);
});
