import {passwordHash, normalizeUsername, validUsername, reserveAttempt, releaseAttempts} from './staff.mjs';
import {validPassword, passwordRequirement} from '../password-policy.js';
import {normalizeGmail, validGmail, gmailKey, gmailError, profileError} from '../customer-validation.js';
import {firebaseConfigured, firebaseLogin, firebaseEnsure, firebaseResetEmail, firebaseRefresh, firebaseClaims, firebaseSessionUser, sealFirebaseToken, openFirebaseToken} from './firebase.mjs';
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const equal = (a, b) => {if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0;};
const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
const schemas = [
  'CREATE TABLE IF NOT EXISTS customer_users (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,cart_json TEXT NOT NULL DEFAULT \'[]\',cart_version INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS customer_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS customer_sessions_expiry ON customer_sessions(expires_at)',
  'CREATE TABLE IF NOT EXISTS customer_password_resets (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,used_at INTEGER)'
];
let initializedDb, initializing;
async function initialize(db) {
  if (initializedDb === db) return;
  if (!initializing) initializing = (async () => {
    await db.batch(schemas.map(sql => db.prepare(sql)));
    const columns = ['email', 'email_key', 'full_name', 'contact_no', 'date_of_birth', 'gender', 'firebase_uid', 'shipping_address'];
    const existing = new Set((await db.prepare('PRAGMA table_info(customer_users)').all()).results.map(column => column.name));
    for (const column of columns) if (!existing.has(column)) {
      try {await db.prepare('ALTER TABLE customer_users ADD COLUMN ' + column + ' TEXT').run();}
      catch (error) {const current = await db.prepare('PRAGMA table_info(customer_users)').all(); if (!current.results.some(c => c.name === column)) throw error;}
    }
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS customer_email_key ON customer_users(email_key) WHERE email_key IS NOT NULL').run();
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS customer_firebase_uid ON customer_users(firebase_uid) WHERE firebase_uid IS NOT NULL').run();
    const sessions = await db.prepare('PRAGMA table_info(customer_sessions)').all();
    if (!sessions.results.some(c => c.name === 'firebase_token')) {
      try {await db.prepare('ALTER TABLE customer_sessions ADD COLUMN firebase_token TEXT').run();}
      catch (error) {if (!(await db.prepare('PRAGMA table_info(customer_sessions)').all()).results.some(c => c.name === 'firebase_token')) throw error;}
    }
    initializedDb = db;
  })().finally(() => initializing = null);
  await initializing;
}
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('JSON required');
  const reader = request.body?.getReader(); if (!reader) throw new Error('JSON required');
  const chunks = []; let size = 0;
  while (true) {const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 60000) {await reader.cancel(); throw new Error('Request too large');} chunks.push(value);}
  const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) {data.set(chunk, offset); offset += chunk.length;}
  return JSON.parse(new TextDecoder().decode(data));
}
export function validCart(items) {
  if (!Array.isArray(items) || items.length > 200) return false;
  const keys = new Set();
  return items.every(item => {
    if (!item || typeof item.id !== 'string' || item.id.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || typeof item.category !== 'string' || !item.category.trim() || item.category.length > 80 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return false;
    const key = item.category + ':' + item.id; if (keys.has(key)) return false; keys.add(key); return true;
  });
}
const cartOf = user => ({items: JSON.parse(user.cart_json), version: user.cart_version});
async function userFor(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const user = await env.STAFF_DB.prepare('SELECT u.*,s.firebase_token FROM customer_sessions s JOIN customer_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token), Math.floor(Date.now() / 1000)).first();
  if (user?.firebase_uid) {
    if (!firebaseConfigured(env)) return null;
    let credentials;
    try {credentials = JSON.parse(await openFirebaseToken(env, user.firebase_token));} catch {return null;}
    if (!credentials?.idToken || !credentials.refreshToken) return null;
    if (!firebaseClaims(env, credentials.idToken)) {
      try {credentials = await firebaseRefresh(env, credentials.refreshToken);}
      catch (error) {if (['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_DISABLED', 'USER_NOT_FOUND'].includes(error.code)) return null; throw error;}
      if (!firebaseClaims(env, credentials.idToken) || credentials.localId !== user.firebase_uid) return null;
      await env.STAFF_DB.prepare('UPDATE customer_sessions SET firebase_token=? WHERE token_hash=?').bind(await sealFirebaseToken(env, JSON.stringify(credentials)), await digest(token)).run();
    }
    if (!await firebaseSessionUser(env, credentials.idToken, user.firebase_uid)) return null;
  }
  return user;
}
async function linkFirebase(user, result, env) {
  const claims = firebaseClaims(env, result.idToken);
  if (!claims || claims.sub !== result.localId || user.firebase_uid && user.firebase_uid !== result.localId) throw new Error('Firebase account mismatch');
  if (!user.firebase_uid) {
    const update = await env.STAFF_DB.prepare('UPDATE customer_users SET firebase_uid=?,salt=?,password_hash=? WHERE id=? AND firebase_uid IS NULL').bind(result.localId, random(), random(), user.id).run();
    if (!update.meta.changes) {
      const current = await env.STAFF_DB.prepare('SELECT firebase_uid FROM customer_users WHERE id=?').bind(user.id).first();
      if (current?.firebase_uid !== result.localId) throw new Error('Firebase account mismatch');
    }
    user.firebase_uid = result.localId;
    await env.STAFF_DB.prepare('DELETE FROM customer_sessions WHERE user_id=? AND firebase_token IS NULL').bind(user.id).run();
    await env.STAFF_DB.prepare('DELETE FROM customer_password_resets WHERE user_id=?').bind(user.id).run();
  }
  if (!result.refreshToken) throw new Error('Firebase refresh token missing');
  return result;
}
const profileOf = user => ({username: user.username, email: user.email || null, fullName: user.full_name || null, contactNo: user.contact_no || null, dateOfBirth: user.date_of_birth || null, gender: user.gender || null, shippingAddress: user.shipping_address || ''});
async function signIn(user, env, firebaseToken = null) {
  const token = random();
  await env.STAFF_DB.batch([
    env.STAFF_DB.prepare('DELETE FROM customer_sessions WHERE expires_at<=?').bind(Math.floor(Date.now() / 1000)),
    env.STAFF_DB.prepare('INSERT INTO customer_sessions (token_hash,user_id,expires_at,firebase_token) VALUES (?,?,?,?)').bind(await digest(token), user.id, Math.floor(Date.now() / 1000) + 28800, firebaseToken ? await sealFirebaseToken(env, JSON.stringify(firebaseToken)) : null)
  ]);
  return json({token, ...profileOf(user), ...cartOf(user)});
}
export async function handleCustomer(request, env) {
  if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return json({error: 'Use the customer website for this request.'}, 403);
  const cors = {'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', Vary: 'Origin'};
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  const path = new URL(request.url).pathname;
  const respond = async () => {
    if (!env.STAFF_DB || !env.STAFF_PASSWORD_PEPPER || env.STAFF_PASSWORD_PEPPER.length < 32) return json({error: 'Customer accounts are temporarily unavailable. Please try again shortly.'}, 503);
    await initialize(env.STAFF_DB);
    if (path === '/customer/status' && request.method === 'GET') return json({configured: true, customerAccounts: true, gmailAccounts: true, firebaseAuthentication: firebaseConfigured(env), resetEmailConfigured: firebaseConfigured(env) || Boolean(env.RESET_EMAIL?.send && env.RESET_EMAIL_FROM)});
    if (path === '/customer/forgot-password' && request.method === 'POST') {
      const data = await body(request), email = normalizeGmail(data.email);
      if (!validGmail(email)) return json({error: gmailError(email) || 'Enter your Gmail address.'}, 400);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!await reserveAttempt(env, 'customer-reset:ip:' + await digest(ip), 5) || !await reserveAttempt(env, 'customer-reset:email:' + gmailKey(email), 3)) return json({error: 'Too many reset requests. Please try again in 15 minutes.'}, 429);
      const user = await env.STAFF_DB.prepare('SELECT * FROM customer_users WHERE email_key=?').bind(gmailKey(email)).first();
      if (firebaseConfigured(env)) {
        if (user?.firebase_uid) {
          try {await firebaseResetEmail(env, user.email_key);}
          catch (error) {if (error.code !== 'EMAIL_NOT_FOUND') return json({error: 'Could not send the reset email. Please try again shortly.'}, 502);}
        }
        return json({message: 'If this Gmail is registered and connected, a password reset link will be sent. Existing accounts must log in once to connect. Please check your inbox and spam folder.'});
      }
      if (!env.RESET_EMAIL?.send || !env.RESET_EMAIL_FROM) return json({error: 'Password reset email is not connected yet. Please contact our team.'}, 503);
      if (user) {
        const token = random(), now = Math.floor(Date.now() / 1000), tokenHash = await digest(token);
        await env.STAFF_DB.prepare('DELETE FROM customer_password_resets WHERE expires_at<=? OR used_at IS NOT NULL').bind(now).run();
        await env.STAFF_DB.prepare('INSERT INTO customer_password_resets (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(tokenHash, user.id, now + 1800).run();
        const link = new URL('/reset-password.html', env.ALLOWED_ORIGIN); link.hash = 'token=' + token;
        try {await env.RESET_EMAIL.send({from: env.RESET_EMAIL_FROM, to: user.email, subject: 'Reset your AB Tech One Solution password', text: `A password reset was requested for your AB Tech One Solution account.\n\nChoose a new password here:\n${link.href}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, you can ignore this email.`});}
        catch {await env.STAFF_DB.prepare('DELETE FROM customer_password_resets WHERE token_hash=?').bind(tokenHash).run(); return json({error: 'Could not send the reset email. Please try again shortly.'}, 502);}
      }
      return json({message: 'If this Gmail is registered, a password reset link will be sent to it. Please check your inbox and spam folder.'});
    }
    if (path === '/customer/reset-password' && request.method === 'POST') {
      const data = await body(request), now = Math.floor(Date.now() / 1000);
      if (!/^[a-f0-9]{64}$/.test(data.token || '') || !validPassword(data.password) || data.password !== data.confirmPassword) return json({error: 'Check the reset link and enter matching passwords. ' + passwordRequirement}, 400);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!await reserveAttempt(env, 'customer-reset-complete:ip:' + await digest(ip), 10)) return json({error: 'Too many attempts. Please try again in 15 minutes.'}, 429);
      const tokenHash = await digest(data.token);
      const reset = await env.STAFF_DB.prepare('SELECT * FROM customer_password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(tokenHash, now).first();
      if (!reset) return json({error: 'This reset link is invalid or expired. Request a new one.'}, 400);
      const resetUser = await env.STAFF_DB.prepare('SELECT firebase_uid FROM customer_users WHERE id=?').bind(reset.user_id).first();
      if (resetUser?.firebase_uid) return json({error: 'Use a new Firebase reset email for this account.'}, 400);
      const salt = random(), hash = await passwordHash(data.password, salt, 'customer:' + env.STAFF_PASSWORD_PEPPER);
      const results = await env.STAFF_DB.batch([
        env.STAFF_DB.prepare('UPDATE customer_users SET salt=?,password_hash=? WHERE id=? AND EXISTS (SELECT 1 FROM customer_password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?)').bind(salt, hash, reset.user_id, tokenHash, now),
        env.STAFF_DB.prepare('DELETE FROM customer_sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM customer_password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?)').bind(reset.user_id, tokenHash, now),
        env.STAFF_DB.prepare('UPDATE customer_password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL AND EXISTS (SELECT 1 FROM customer_password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?)').bind(now, reset.user_id, tokenHash, now)
      ]);
      if (!results[0].meta.changes) return json({error: 'This reset link has already been used. Request a new one.'}, 400);
      return json({message: 'Password reset successfully. Log in with your Gmail and new password.'});
    }
    if (['/customer/register', '/customer/login', '/customer/link-account'].includes(path) && request.method === 'POST') {
      const linking = path.endsWith('/link-account');
      const registering = path.endsWith('/register'), scope = registering ? 'customer-register' : 'customer-login';
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipAttempt = await reserveAttempt(env, scope + ':ip:' + await digest(ip), 20);
      if (!ipAttempt) return json({error: 'Too many attempts. Please try again in 15 minutes.'}, 429);
      const data = await body(request), email = normalizeGmail(data.email), username = normalizeUsername(data.username);
      if (!validGmail(email)) return json({error: gmailError(email) || 'Enter your Gmail address.'}, 400);
      if ((registering || linking) && profileError(data)) return json({error: profileError(data)}, 400);
      if (linking && !validUsername(username)) return json({error: 'Enter your existing username.'}, 400);
      const firebasePassword = firebaseConfigured(env) && !registering && !linking;
      if (typeof data.password !== 'string' || data.password.length < (firebasePassword ? 6 : 8) || data.password.length > (firebasePassword ? 4096 : 128)) return json({error: firebasePassword ? 'Enter your password (6–4096 characters).' : 'Password must contain 8–128 characters.'}, 400);
      const userAttempt = await reserveAttempt(env, scope + ':user:' + (linking ? username : gmailKey(email)), 10);
      if (!userAttempt) return json({error: 'Too many attempts. Please try again in 15 minutes.'}, 429);
      let authenticated = false;
      try {
        if (registering) {
          if (!validPassword(data.password)) return json({error: passwordRequirement}, 400);
          if (data.password !== data.confirmPassword) return json({error: 'The passwords do not match.'}, 400);
          const salt = random(), hash = await passwordHash(data.password, salt, 'customer:' + env.STAFF_PASSWORD_PEPPER);
          const id = crypto.randomUUID();
          const result = await env.STAFF_DB.prepare('INSERT INTO customer_users (id,username,salt,password_hash,created_at,email,email_key,full_name,contact_no,date_of_birth,gender) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(id, gmailKey(email), salt, hash, Date.now(), email, gmailKey(email), data.fullName.trim(), data.contactNo, data.dateOfBirth, data.gender).run();
          if (!result.meta.changes) return json({error: 'This Gmail already has an account. Please log in or reset your password.'}, 409);
          authenticated = true;
          const user = {id, username: gmailKey(email), email, email_key: gmailKey(email), full_name: data.fullName.trim(), contact_no: data.contactNo, date_of_birth: data.dateOfBirth, gender: data.gender, cart_json: '[]', cart_version: 0};
          const firebaseToken = firebaseConfigured(env) ? await linkFirebase(user, await firebaseEnsure(env, user.email_key, data.password), env) : null;
          return signIn(user, env, firebaseToken);
        }
        const user = linking ? await env.STAFF_DB.prepare('SELECT * FROM customer_users WHERE username=?').bind(username).first() : await env.STAFF_DB.prepare('SELECT * FROM customer_users WHERE email_key=?').bind(gmailKey(email)).first();
        let firebaseToken = null;
        if (user?.firebase_uid) {
          if (!firebaseConfigured(env)) return json({error: 'Account login is temporarily unavailable. Please try again shortly.'}, 503);
          try {firebaseToken = await linkFirebase(user, await firebaseLogin(env, user.email_key, data.password), env);}
          catch (error) {return json({error: ['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'USER_DISABLED'].includes(error.code) ? 'Gmail or password is incorrect.' : 'Could not connect to account login. Please try again.'}, ['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'USER_DISABLED'].includes(error.code) ? 401 : 502);}
        } else {
          const hash = await passwordHash(data.password, user?.salt || '00'.repeat(32), 'customer:' + env.STAFF_PASSWORD_PEPPER);
          if (!user || !equal(hash, user.password_hash)) return json({error: linking ? 'Existing username or password is incorrect.' : 'Gmail or password is incorrect.'}, 401);
        }
        if (linking) {
          if (user.email_key) return json({error: 'This account already uses Gmail. Please use the Login tab.'}, 409);
          if (await env.STAFF_DB.prepare('SELECT id FROM customer_users WHERE email_key=?').bind(gmailKey(email)).first()) return json({error: 'This Gmail is already linked to an account.'}, 409);
          try {
            const update = await env.STAFF_DB.prepare('UPDATE customer_users SET email=?,email_key=?,full_name=?,contact_no=?,date_of_birth=?,gender=? WHERE id=? AND email_key IS NULL').bind(email, gmailKey(email), data.fullName.trim(), data.contactNo, data.dateOfBirth, data.gender, user.id).run();
            if (!update.meta.changes) return json({error: 'This account was updated. Please log in with Gmail.'}, 409);
          } catch {return json({error: 'This Gmail is already linked to an account.'}, 409);}
          user.email = email; user.email_key = gmailKey(email); user.full_name = data.fullName.trim(); user.contact_no = data.contactNo; user.date_of_birth = data.dateOfBirth; user.gender = data.gender;
        }
        if (firebaseConfigured(env) && !firebaseToken) firebaseToken = await linkFirebase(user, await firebaseEnsure(env, user.email_key, data.password), env);
        authenticated = true; return signIn(user, env, firebaseToken);
      } finally {if (authenticated && !registering) await releaseAttempts(env, [ipAttempt, userAttempt]);}
    }
    const user = await userFor(request, env);
    if (!user) return json({error: 'Please log in to use your cart.'}, 401);
    if (path === '/customer/me' && request.method === 'GET') return json({...profileOf(user), ...cartOf(user)});
    if (path === '/customer/profile' && request.method === 'PUT') {
      const data = await body(request);
      if (typeof data.shippingAddress !== 'string' || data.shippingAddress.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data.shippingAddress)) return json({error: 'Enter a shipping address of up to 1,000 characters.'}, 400);
      const address = data.shippingAddress.replace(/\r\n?/g, '\n').trim();
      await env.STAFF_DB.prepare('UPDATE customer_users SET shipping_address=? WHERE id=?').bind(address, user.id).run();
      return json({...profileOf({...user, shipping_address: address}), message: 'Shipping address saved.'});
    }
    if (path === '/customer/logout' && request.method === 'POST') {
      await env.STAFF_DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await digest(request.headers.get('Authorization').slice(7))).run();
      return json({message: 'Logged out.'});
    }
    if (path === '/customer/cart' && request.method === 'GET') return json(cartOf(user));
    if (path === '/customer/cart' && request.method === 'PUT') {
      const data = await body(request);
      if (!validCart(data.items) || !Number.isInteger(data.version) || data.version < 0) return json({error: 'Check your cart items and quantities.'}, 400);
      const items = data.items.map(({id, category, quantity}) => ({id, category, quantity}));
      const result = await env.STAFF_DB.prepare('UPDATE customer_users SET cart_json=?,cart_version=cart_version+1 WHERE id=? AND cart_version=? RETURNING cart_version').bind(JSON.stringify(items), user.id, data.version).first();
      if (!result) return json({error: 'Your cart changed in another tab. Please try again.'}, 409);
      return json({items, version: result.cart_version});
    }
    return json({error: 'Not found.'}, 404);
  };
  let result;
  try {result = await respond();} catch {result = json({error: 'Could not complete this request. Please try again.'}, 500);}
  const headers = new Headers(result.headers); for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(result.body, {status: result.status, headers});
}
