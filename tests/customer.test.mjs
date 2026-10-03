import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleCustomer, validCart} from '../auth-worker/customer.mjs';
import {handleStaff} from '../auth-worker/staff.mjs';
import {passwordHash} from '../auth-worker/staff.mjs';
import {validGmail, validContact, validBirthDate} from '../customer-validation.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile(new URL('../auth-worker/staff-schema.sql', import.meta.url), 'utf8'));
const db = {prepare(sql) {let values = []; const query = {bind(...args) {values = args; return query;}, async all() {return {results: sqlite.prepare(sql).all(...values)};}, async first() {return sqlite.prepare(sql).get(...values) || null;}, async run() {const result = sqlite.prepare(sql).run(...values); return {meta: {changes: Number(result.changes)}};}}; return query;}, async batch(queries) {return Promise.all(queries.map(q => q.run()));}};
const origin = 'https://ab-tech-one-solution.pages.dev';
const env = {ALLOWED_ORIGIN: origin, STAFF_DB: db, STAFF_PASSWORD_PEPPER: 'p'.repeat(40)};
const account = {email: 'customer.one@gmail.com', fullName: 'Customer One', contactNo: '01112345678', dateOfBirth: '1995-01-01', gender: 'female', password: 'Camera1!', confirmPassword: 'Camera1!'};
const request = (path, method = 'GET', data, token, source = origin) => new Request('https://auth.test/customer/' + path, {method, headers: {Origin: source, 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1', ...(token ? {Authorization: 'Bearer ' + token} : {})}, ...(data ? {body: JSON.stringify(data)} : {})});
const register = async email => (await handleCustomer(request('register', 'POST', {...account, email}), env)).json();
test.beforeEach(() => sqlite.exec('DELETE FROM staff_attempts'));
test('Customer schema initializes and public signup hashes passwords and logs the new customer in', async () => {
  assert.equal((await handleCustomer(request('status'), env)).status, 200);
  for (const data of [{...account, password: 'weakpass', confirmPassword: 'weakpass'}, {...account, confirmPassword: 'Different1!'}]) assert.equal((await handleCustomer(request('register', 'POST', data), env)).status, 400);
  const result = await register(account.email);
  assert.match(result.token, /^[a-f0-9]{64}$/); assert.equal(result.username, 'customerone@gmail.com'); assert.deepEqual(result.items, []);
  const stored = sqlite.prepare('SELECT * FROM customer_users').get(); assert.notEqual(stored.password_hash, account.password);
  assert.notEqual(sqlite.prepare('SELECT token_hash FROM customer_sessions').get().token_hash, result.token);
  assert.equal((await handleCustomer(request('register', 'POST', {...account, email: 'CUSTOMER.ONE@GMAIL.COM'}), env)).status, 409);
});
test('Cart writes require a customer session and preserve only safe product references and quantities', async () => {
  assert.equal((await handleCustomer(request('cart', 'PUT', {items: [], version: 0}), env)).status, 401);
  const {token} = await (await handleCustomer(request('login', 'POST', account), env)).json();
  const item = {id: 'camera', category: 'CCTV Systems', quantity: 2, price: 0};
  const response = await handleCustomer(request('cart', 'PUT', {items: [item], version: 0}, token), env);
  assert.equal(response.status, 200); const result = await response.json();
  assert.deepEqual(result.items, [{id: 'camera', category: 'CCTV Systems', quantity: 2}]); assert.equal(result.version, 1);
  assert.equal((await handleCustomer(request('cart', 'PUT', {items: [], version: 0}, token), env)).status, 409);
  assert.equal((await handleCustomer(request('cart', 'PUT', {items: [{...item, quantity: 0}], version: 1}, token), env)).status, 400);
  assert.deepEqual((await (await handleCustomer(request('cart', 'GET', undefined, token), env)).json()).items, result.items);
});
test('Customer carts are private per account and remain after logout/login; customer sessions cannot edit staff products', async () => {
  const first = await (await handleCustomer(request('login', 'POST', account), env)).json();
  const second = await register('customer.two@gmail.com'); assert.deepEqual(second.items, []);
  assert.equal((await handleCustomer(request('cart', 'GET', undefined, first.token, 'https://evil.example'), env)).status, 403);
  const staffRequest = new Request('https://auth.test/staff/categories', {headers: {Origin: origin, Authorization: 'Bearer ' + first.token}});
  assert.equal((await handleStaff(staffRequest, env)).status, 401);
  assert.equal((await handleCustomer(request('logout', 'POST', undefined, first.token), env)).status, 200);
  assert.equal((await handleCustomer(request('me', 'GET', undefined, first.token), env)).status, 401);
  assert.equal((await handleCustomer(request('login', 'POST', {...account, password: 'Wrong123!'}), env)).status, 401);
  const again = await (await handleCustomer(request('login', 'POST', account), env)).json();
  assert.equal(again.items[0].quantity, 2);
  sqlite.exec('UPDATE customer_sessions SET expires_at=0');
  assert.equal((await handleCustomer(request('me', 'GET', undefined, again.token), env)).status, 401);
});
test('Cart limits, duplicate references and traversal IDs are rejected', () => {
  const item = {id: 'safe-id', category: 'Category', quantity: 1};
  assert.equal(validCart([item]), true);
  for (const items of [[item, item], [{...item, id: '../x'}], [{...item, quantity: 1000}], [{...item, quantity: 1.5}], [{...item, category: ''}], Array(201).fill(item)]) assert.equal(validCart(items), false);
});
test('Public customer login is throttled and staff tokens cannot authenticate as customers', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await handleCustomer(request('login', 'POST', {...account, password: 'Wrong123!'}), env)).status, 401);
  assert.equal((await handleCustomer(request('login', 'POST', account), env)).status, 429);
  const staffOnlyToken = 'c'.repeat(64);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(staffOnlyToken))).toString('hex');
  sqlite.prepare('INSERT INTO staff_users (id,username,salt,password_hash,created_at) VALUES (?,?,?,?,?)').run('staff', 'staff_only', 'a'.repeat(64), 'b'.repeat(64), Date.now());
  sqlite.prepare('INSERT INTO staff_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash, 'staff', Math.floor(Date.now()/1000)+1000);
  assert.equal((await handleCustomer(request('cart', 'GET', undefined, staffOnlyToken), env)).status, 401);
});

test('Gmail typos, dot aliases, mobile lengths and invalid profile details are validated on the server', async () => {
  for (const value of ['person123@gmail.com', ' Person.123@GMAIL.COM ']) assert.equal(validGmail(value), true);
  for (const value of ['person123@gmial.com', 'person123@gmail.co', 'person123@outlook.com', 'person..123@gmail.com', 'short@gmail.com', 'person+123@gmail.com']) assert.equal(validGmail(value), false);
  for (const value of ['01112345678', '0101234567', '0121234567', '0191234567']) assert.equal(validContact(value), true);
  for (const value of ['0111234567', '01212345678', '0211234567', '01234567a9', '+60121234567']) assert.equal(validContact(value), false);
  for (const value of ['2999-01-01', '2025-02-29', '1995-13-01', '1899-01-01']) assert.equal(validBirthDate(value), false);
  assert.equal(validBirthDate('2000-02-29'), true);
  for (const patch of [{email: 'person123@gmial.com'}, {fullName: ''}, {contactNo: '01212345678'}, {dateOfBirth: '2999-01-01'}, {gender: ''}]) assert.equal((await handleCustomer(request('register', 'POST', {...account, ...patch}), env)).status, 400);
  assert.equal((await handleCustomer(request('register', 'POST', {...account, email: 'customerone@gmail.com'}), env)).status, 409);
  assert.equal((await handleCustomer(request('login', 'POST', {...account, email: 'CUSTOMERONE@GMAIL.COM'}), env)).status, 200);
});

test('Existing username customers can link Gmail without losing their original account or cart', async () => {
  const salt = 'b'.repeat(64), hash = await passwordHash(account.password, salt, 'customer:' + env.STAFF_PASSWORD_PEPPER);
  sqlite.prepare('INSERT INTO customer_users (id,username,salt,password_hash,created_at,cart_json,cart_version) VALUES (?,?,?,?,?,?,?)').run('legacy', 'old_customer', salt, hash, Date.now(), '[{"id":"camera","category":"CCTV Systems","quantity":3}]', 5);
  const data = {...account, username: 'OLD_CUSTOMER', email: 'legacy.customer@gmail.com'};
  assert.equal((await handleCustomer(request('link-account', 'POST', {...data, password: 'Wrong123!'}), env)).status, 401);
  const response = await handleCustomer(request('link-account', 'POST', data), env); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.email, data.email); assert.equal(result.items[0].quantity, 3); assert.equal(result.version, 5);
  assert.equal(sqlite.prepare('SELECT id FROM customer_users WHERE email_key=?').get('legacycustomer@gmail.com').id, 'legacy');
  assert.equal((await handleCustomer(request('login', 'POST', data), env)).status, 200);
  assert.equal((await handleCustomer(request('link-account', 'POST', data), env)).status, 409);
});

test('Password reset validates Gmail and reports an unconfigured sender honestly', async () => {
  assert.equal((await handleCustomer(request('forgot-password', 'POST', {email: 'customer.one@gmial.com'}), env)).status, 400);
  const response = await handleCustomer(request('forgot-password', 'POST', {email: account.email}), env);
  assert.equal(response.status, 503); assert.match((await response.json()).error, /not connected/);
});

test('Reset emails use the registered Gmail, hashed expiring tokens and cannot reveal whether an account exists', async () => {
  const emails = [], emailEnv = {...env, RESET_EMAIL_FROM: 'noreply@abtech.test', RESET_EMAIL: {async send(message) {emails.push(message); return {messageId: 'mock'};}}};
  const signedIn = await (await handleCustomer(request('login', 'POST', account), env)).json();
  const response = await handleCustomer(request('forgot-password', 'POST', {email: 'customerone@gmail.com'}), emailEnv);
  assert.equal(response.status, 200); const known = await response.json();
  const unknown = await (await handleCustomer(request('forgot-password', 'POST', {email: 'unknown.person@gmail.com'}), emailEnv)).json();
  assert.deepEqual(unknown, known); assert.equal(emails.length, 1); assert.equal(emails[0].to, account.email);
  const token = emails[0].text.match(/#token=([a-f0-9]{64})/)[1];
  assert.equal(JSON.stringify(known).includes(token), false);
  const stored = sqlite.prepare('SELECT * FROM customer_password_resets').get(); assert.notEqual(stored.token_hash, token); assert.ok(stored.expires_at > Date.now() / 1000);
  const reset = {token, password: 'Updated1!', confirmPassword: 'Updated1!'};
  assert.equal((await handleCustomer(request('reset-password', 'POST', {...reset, confirmPassword: 'Different1!'}), env)).status, 400);
  assert.equal((await handleCustomer(request('reset-password', 'POST', reset), env)).status, 200);
  assert.equal((await handleCustomer(request('reset-password', 'POST', reset), env)).status, 400);
  assert.equal((await handleCustomer(request('me', 'GET', undefined, signedIn.token), env)).status, 401);
  assert.equal((await handleCustomer(request('login', 'POST', account), env)).status, 401);
  const loggedIn = await handleCustomer(request('login', 'POST', {...account, password: reset.password}), env); assert.equal(loggedIn.status, 200);
  assert.equal((await loggedIn.json()).items[0].quantity, 2);
  await handleCustomer(request('forgot-password', 'POST', {email: account.email}), emailEnv);
  const expiredToken = emails.at(-1).text.match(/#token=([a-f0-9]{64})/)[1]; sqlite.exec('UPDATE customer_password_resets SET expires_at=0');
  assert.equal((await handleCustomer(request('reset-password', 'POST', {...reset, token: expiredToken}), env)).status, 400);
});

test('Email sending failures delete unusable tokens and reset requests are throttled', async () => {
  const emailEnv = {...env, RESET_EMAIL_FROM: 'noreply@abtech.test', RESET_EMAIL: {async send() {throw new Error('Sender unavailable');}}};
  assert.equal((await handleCustomer(request('forgot-password', 'POST', {email: account.email}), emailEnv)).status, 502);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM customer_password_resets').get().count, 0);
  for (let i = 0; i < 2; i++) assert.equal((await handleCustomer(request('forgot-password', 'POST', {email: account.email}), emailEnv)).status, 502);
  assert.equal((await handleCustomer(request('forgot-password', 'POST', {email: account.email}), emailEnv)).status, 429);
});
