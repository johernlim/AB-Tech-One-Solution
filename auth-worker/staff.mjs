import {readCategories, changeCategories} from './categories.mjs';
import {readOrderedCategories, saveCategoryOrder} from './category-order.mjs';
import {publishBulk} from './bulk.mjs';
import {readPwp, pwpCatalogue, publishPwp} from './pwp.mjs';
import {readPromotions, publishPromotions} from './promotions.mjs';
import {validPassword, passwordRequirement} from '../password-policy.js';
export {validPassword} from '../password-policy.js';
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const bytes = value => Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const equal = (a, b) => { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; };
export const normalizeUsername = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validUsername = value => /^[a-z0-9][a-z0-9_]{2,23}$/.test(value);
export async function passwordHash(password, salt, pepper) {
  // HMAC pepper stays outside D1. Web Crypto uses a separate random salt per account.
  const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const protectedPassword = await crypto.subtle.sign('HMAC', key, encoder.encode(password));
  const material = await crypto.subtle.importKey('raw', protectedPassword, 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: 100000}, material, 256));
}
export function staffStatus(env) {
  const missing = ['STAFF_DB', 'STAFF_INVITE_CODE', 'STAFF_PASSWORD_PEPPER', 'GITHUB_CATALOGUE_TOKEN'].filter(name => !env[name]);
  if (env.STAFF_INVITE_CODE && env.STAFF_INVITE_CODE.length < 16) missing.push('STAFF_INVITE_CODE (at least 16 characters)');
  if (env.STAFF_PASSWORD_PEPPER && env.STAFF_PASSWORD_PEPPER.length < 32) missing.push('STAFF_PASSWORD_PEPPER (at least 32 random characters)');
  const loginConfigured = Boolean(env.STAFF_DB && env.STAFF_PASSWORD_PEPPER?.length >= 32);
  const registrationConfigured = loginConfigured && Boolean(env.STAFF_INVITE_CODE?.length >= 16);
  return {configured: missing.length === 0, loginConfigured, registrationConfigured, missing};
}
function json(data, status = 200) { return Response.json(data, {status, headers: {'Cache-Control': 'no-store'}}); }
async function body(request, limit = 10000) {
  const reader = request.body?.getReader();
  if (!reader || !request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('JSON required');
  let size = 0; const chunks = [];
  while (true) {
    const {value, done} = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) {await reader.cancel(); throw new Error('Request too large');}
    chunks.push(value);
  }
  const combined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {combined.set(chunk, offset); offset += chunk.length;}
  return JSON.parse(new TextDecoder().decode(combined));
}
export async function reserveAttempt(env, key, maximum, seconds = 900) {
  const now = Math.floor(Date.now() / 1000);
  // Reserve before password hashing so parallel requests cannot bypass the limit.
  const row = await env.STAFF_DB.prepare('INSERT INTO staff_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END WHERE expires_at<=? OR count<? RETURNING expires_at').bind(key, now + seconds, now, now, now, maximum).first();
  return row ? {key, expiresAt: row.expires_at} : null;
}
export async function releaseAttempts(env, attempts) {
  // Release only this request's slots, preserving other failures and newer windows.
  await env.STAFF_DB.batch(attempts.map(({key, expiresAt}) => env.STAFF_DB.prepare('UPDATE staff_attempts SET count=MAX(0,count-1) WHERE key=? AND expires_at=?').bind(key, expiresAt)));
}
async function session(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  return env.STAFF_DB.prepare('SELECT u.id,u.username FROM staff_sessions s JOIN staff_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token), Math.floor(Date.now() / 1000)).first();
}
function github(env, path, options = {}) {
  return fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/contents/' + path, {...options, headers: {Authorization: 'Bearer ' + env.GITHUB_CATALOGUE_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'AB-Tech-Staff', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'}});
}
const encodeContent = text => {
  const value = encoder.encode(text), chunks = [];
  for (let offset = 0; offset < value.length; offset += 16384) chunks.push(String.fromCharCode(...value.subarray(offset, offset + 16384)));
  return btoa(chunks.join(''));
};
const decodeContent = value => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), character => character.charCodeAt(0)));
export function validateProducts(products, category) {
  if (!Array.isArray(products) || products.length > 250) return false;
  const ids = new Set();
  const image = value => typeof value === 'string' && /^assets\/(products|uploads)\/[a-zA-Z0-9_. -]+$/.test(value) && !value.includes('..');
  return products.every(p => {
    if (!p || typeof p !== 'object' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id || '') || ids.has(p.id)) return false;
    ids.add(p.id);
    return p.category === category && ['name', 'description', 'installation', 'availability'].every(field => typeof p[field] === 'string' && p[field].trim() && p[field].length <= 5000) &&
      image(p.image) && Array.isArray(p.gallery || []) && (p.gallery || []).length <= 12 && (p.gallery || []).every(image) &&
      ['fixed', 'from', 'quote'].includes(p.price_mode) && Number.isFinite(p.price) && p.price >= 0 && p.price <= 10000000 &&
      typeof p.published === 'boolean' && typeof p.example === 'boolean' && (p.new_arrival === undefined || typeof p.new_arrival === 'boolean') && Array.isArray(p.specifications || []) && (p.specifications || []).length <= 50 && (p.specifications || []).every(value => typeof value === 'string' && value.length <= 500);
  });
}
export async function handleStaff(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin !== env.ALLOWED_ORIGIN) return json({error: 'This request must come from the staff website.'}, 403);
  const cors = {'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', Vary: 'Origin'};
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  const respond = async () => {
    if (url.pathname === '/staff/status' && request.method === 'GET') {
      const status = staffStatus(env);
      if (status.loginConfigured) {
        const row = await env.STAFF_DB.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('staff_users','staff_sessions','staff_attempts')").first();
        if (row.count !== 3) {status.configured = false; status.loginConfigured = false; status.registrationConfigured = false; status.missing.push('STAFF_DB schema');}
      }
      return json({...status, categoryManagement: true, categoryVisibility: true, categoryIconUploads: true, bulkProducts: true, combinedProducts: true, pwpManagement: true, promotionManagement: true});
    }
    const readiness = staffStatus(env);
    if (!readiness.loginConfigured) return json({error: 'Login is temporarily unavailable. Please contact the owner and try again shortly.'}, 503);
    if (url.pathname === '/staff/register' && !readiness.registrationConfigured) return json({error: 'Account creation is temporarily unavailable. The owner needs to restore the invitation code.'}, 503);
    if (['/staff/register', '/staff/login'].includes(url.pathname) && request.method === 'POST') {
      const registering = url.pathname === '/staff/register';
      const scope = registering ? 'register' : 'login';
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipAttempt = await reserveAttempt(env, scope + ':ip:' + await digest(ip), 20);
      if (!ipAttempt) return json({error: 'Too many attempts. Please try again in 15 minutes.'}, 429);
      const data = await body(request);
      const username = normalizeUsername(data.username);
      if (!validUsername(username)) return json({error: 'Username must be 3–24 letters, numbers or underscores, starting with a letter or number.'}, 400);
      if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) return json({error: 'Password must contain 8–128 characters.'}, 400);
      const userAttempt = await reserveAttempt(env, scope + ':user:' + username, 10);
      if (!userAttempt) return json({error: 'Too many attempts. Please try again in 15 minutes.'}, 429);
      if (registering) {
        if (!validPassword(data.password)) return json({error: passwordRequirement}, 400);
        if (typeof data.invitation !== 'string' || data.invitation.length > 200 || !equal(await digest(data.invitation), await digest(env.STAFF_INVITE_CODE))) return json({error: 'The invitation code is incorrect. Ask the owner for a valid code.'}, 403);
        if (data.password !== data.confirmPassword) return json({error: 'The passwords do not match.'}, 400);
        const salt = random();
        const hash = await passwordHash(data.password, salt, env.STAFF_PASSWORD_PEPPER);
        const result = await env.STAFF_DB.prepare('INSERT INTO staff_users (id,username,salt,password_hash,created_at) VALUES (?,?,?,?,?) ON CONFLICT(username) DO NOTHING').bind(crypto.randomUUID(), username, salt, hash, Date.now()).run();
        if (!result.meta.changes) return json({error: 'That username is already taken. Choose another username.'}, 409);
        return json({message: 'Account created. You can now log in.'}, 201);
      }
      let authenticated = false;
      try {
        const user = await env.STAFF_DB.prepare('SELECT * FROM staff_users WHERE username=?').bind(username).first();
        const hash = await passwordHash(data.password, user?.salt || '00'.repeat(32), env.STAFF_PASSWORD_PEPPER);
        if (!user || !equal(hash, user.password_hash)) return json({error: 'Username or password is incorrect.'}, 401);
        authenticated = true;
        const token = random();
        await env.STAFF_DB.batch([
          env.STAFF_DB.prepare('DELETE FROM staff_sessions WHERE expires_at<=?').bind(Math.floor(Date.now() / 1000)),
          env.STAFF_DB.prepare('INSERT INTO staff_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token), user.id, Math.floor(Date.now() / 1000) + 28800)
        ]);
        return json({token, username: user.username});
      } finally {
        if (authenticated) await releaseAttempts(env, [ipAttempt, userAttempt]);
      }
    }
    const user = await session(request, env);
    if (!user) return json({error: 'Please log in again.'}, 401);
    if (url.pathname === '/staff/logout' && request.method === 'POST') {
      await env.STAFF_DB.prepare('DELETE FROM staff_sessions WHERE token_hash=?').bind(await digest(request.headers.get('Authorization').slice(7))).run();
      return json({message: 'Logged out.'});
    }
    if (url.pathname === '/staff/me' && request.method === 'GET') return json({username: user.username});
    if (!env.GITHUB_CATALOGUE_TOKEN) return json({error: 'Publishing is temporarily unavailable. Please contact the owner.'}, 503);
    if (url.pathname === '/staff/promotions' && request.method === 'GET') return json({...await readPromotions(env), products:await pwpCatalogue(env)});
    if (url.pathname === '/staff/promotions' && request.method === 'PUT') return publishPromotions(env,user,await body(request,750000));
    if (url.pathname === '/staff/pwp' && request.method === 'GET') return json({...await readPwp(env), products: await pwpCatalogue(env)});
    if (url.pathname === '/staff/pwp' && request.method === 'PUT') return publishPwp(env, user, await body(request, 750000));
    if (url.pathname === '/staff/categories' && request.method === 'GET') return json(await readOrderedCategories(env));
    if (url.pathname === '/staff/bulk-products' && request.method === 'POST') return publishBulk(env,user,await body(request,2000000),validateProducts);
    if (url.pathname === '/staff/categories' && request.method === 'POST') return changeCategories(env, user, 'POST', null, await body(request));
    if (url.pathname === '/staff/categories' && request.method === 'PATCH') return saveCategoryOrder(env, await body(request));
    const categorySlug = url.pathname.match(/^\/staff\/categories\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)?.[1];
    if (categorySlug && request.method === 'PATCH') return changeCategories(env, user, 'PATCH', categorySlug, await body(request));
    if (categorySlug && request.method === 'DELETE') return changeCategories(env, user, 'DELETE', categorySlug, await body(request));
    const category = categorySlug ? (await readCategories(env)).categories.find(category => category.slug === categorySlug) : null;
    if (category && request.method === 'GET') {
      const response = await github(env, 'data/categories/' + category.slug + '.json?ref=main');
      if (!response.ok) return json({error: 'Could not load products from GitHub.'}, 502);
      const file = await response.json();
      return json({sha: file.sha, products: JSON.parse(decodeContent(file.content)).products});
    }
    if (category && request.method === 'PUT') {
      const data = await body(request, 750000);
      if (!/^[a-f0-9]{40}$/.test(data.sha || '') || !validateProducts(data.products, category.name)) return json({error: 'Check the product fields, unique product IDs and image paths before publishing.'}, 400);
      const response = await github(env, 'data/categories/' + category.slug + '.json', {method: 'PUT', body: JSON.stringify({message: 'Update ' + category.name + ' products by ' + user.username, branch: 'main', sha: data.sha, content: encodeContent(JSON.stringify({products: data.products}, null, 2) + '\n')})});
      if ([409, 422].includes(response.status)) return json({error: 'These products changed since you opened them. Reload this category before publishing.'}, 409);
      if (!response.ok) return json({error: 'GitHub could not publish these changes. Please try again.'}, 502);
      const result = await response.json();
      return json({sha: result.content.sha, message: 'Published to GitHub. The website will update after deployment.'});
    }
    if (url.pathname === '/staff/upload' && request.method === 'POST') {
      const data = await body(request, 1400000);
      const allowed = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'};
      if (!allowed[data.type] || typeof data.content !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.content)) return json({error: 'Upload a JPG, PNG or WebP image.'}, 400);
      const binary = atob(data.content);
      if (binary.length >= 1000000) return json({error: 'The image must be smaller than 1 MB.'}, 400);
      const png = binary.startsWith('\x89PNG\r\n\x1a\n'), jpg = binary.startsWith('\xff\xd8\xff'), webp = binary.startsWith('RIFF') && binary.slice(8, 12) === 'WEBP';
      if (!(data.type === 'image/png' && png || data.type === 'image/jpeg' && jpg || data.type === 'image/webp' && webp)) return json({error: 'The file does not match its image type.'}, 400);
      const path = 'assets/uploads/' + crypto.randomUUID() + '.' + allowed[data.type];
      const response = await github(env, path, {method: 'PUT', body: JSON.stringify({message: 'Upload product photo by ' + user.username, branch: 'main', content: data.content})});
      if (!response.ok) return json({error: 'The image could not be uploaded.'}, 502);
      return json({path}, 201);
    }
    return json({error: 'Not found.'}, 404);
  };
  let result;
  try { result = await respond(); } catch { result = json({error: 'The staff service could not complete this request. Please try again.'}, 500); }
  const headers = new Headers(result.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(result.body, {status: result.status, headers});
}
