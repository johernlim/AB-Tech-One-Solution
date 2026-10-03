import {passwordHash, normalizeUsername, validUsername, reserveAttempt, releaseAttempts} from './staff.mjs';
import {validPassword, passwordRequirement} from '../password-policy.js';
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const equal = (a, b) => {if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0;};
const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
const schemas = [
  'CREATE TABLE IF NOT EXISTS customer_users (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,cart_json TEXT NOT NULL DEFAULT \'[]\',cart_version INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS customer_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS customer_sessions_expiry ON customer_sessions(expires_at)'
];
let initializedDb, initializing;
async function initialize(db) {
  if (initializedDb === db) return;
  if (!initializing) initializing = db.batch(schemas.map(sql => db.prepare(sql))).then(() => {initializedDb = db;}).finally(() => initializing = null);
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
  return env.STAFF_DB.prepare('SELECT u.* FROM customer_sessions s JOIN customer_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token), Math.floor(Date.now() / 1000)).first();
}
async function signIn(user, env) {
  const token = random();
  await env.STAFF_DB.batch([
    env.STAFF_DB.prepare('DELETE FROM customer_sessions WHERE expires_at<=?').bind(Math.floor(Date.now() / 1000)),
    env.STAFF_DB.prepare('INSERT INTO customer_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token), user.id, Math.floor(Date.now() / 1000) + 28800)
  ]);
  return json({token, username: user.username, ...cartOf(user)});
}
export async function handleCustomer(request, env) {
  if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return json({error: 'Use the customer website for this request.'}, 403);
  const cors = {'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', Vary: 'Origin'};
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  const path = new URL(request.url).pathname;
  const respond = async () => {
    if (!env.STAFF_DB || !env.STAFF_PASSWORD_PEPPER || env.STAFF_PASSWORD_PEPPER.length < 32) return json({error: 'Customer accounts are temporarily unavailable. Please try again shortly.'}, 503);
    await initialize(env.STAFF_DB);
    if (path === '/customer/status' && request.method === 'GET') return json({configured: true, customerAccounts: true});
    if (['/customer/register', '/customer/login'].includes(path) && request.method === 'POST') {
      const registering = path.endsWith('/register'), scope = registering ? 'customer-register' : 'customer-login';
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipAttempt = await reserveAttempt(env, scope + ':ip:' + await digest(ip), 20);
      if (!ipAttempt) return json({error: 'Too many attempts. Please try again in 15 minutes.'}, 429);
      const data = await body(request), username = normalizeUsername(data.username);
      if (!validUsername(username)) return json({error: 'Choose a username with 3–24 letters, numbers or underscores.'}, 400);
      if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) return json({error: 'Password must contain 8–128 characters.'}, 400);
      const userAttempt = await reserveAttempt(env, scope + ':user:' + username, 10);
      if (!userAttempt) return json({error: 'Too many attempts. Please try again in 15 minutes.'}, 429);
      let authenticated = false;
      try {
        if (registering) {
          if (!validPassword(data.password)) return json({error: passwordRequirement}, 400);
          if (data.password !== data.confirmPassword) return json({error: 'The passwords do not match.'}, 400);
          const salt = random(), hash = await passwordHash(data.password, salt, 'customer:' + env.STAFF_PASSWORD_PEPPER);
          const id = crypto.randomUUID();
          const result = await env.STAFF_DB.prepare('INSERT INTO customer_users (id,username,salt,password_hash,created_at) VALUES (?,?,?,?,?) ON CONFLICT(username) DO NOTHING').bind(id, username, salt, hash, Date.now()).run();
          if (!result.meta.changes) return json({error: 'That username is already taken. Choose another username.'}, 409);
          authenticated = true;
          return signIn({id, username, cart_json: '[]', cart_version: 0}, env);
        }
        const user = await env.STAFF_DB.prepare('SELECT * FROM customer_users WHERE username=?').bind(username).first();
        const hash = await passwordHash(data.password, user?.salt || '00'.repeat(32), 'customer:' + env.STAFF_PASSWORD_PEPPER);
        if (!user || !equal(hash, user.password_hash)) return json({error: 'Username or password is incorrect.'}, 401);
        authenticated = true; return signIn(user, env);
      } finally {if (authenticated && !registering) await releaseAttempts(env, [ipAttempt, userAttempt]);}
    }
    const user = await userFor(request, env);
    if (!user) return json({error: 'Please log in to use your cart.'}, 401);
    if (path === '/customer/me' && request.method === 'GET') return json({username: user.username, ...cartOf(user)});
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
