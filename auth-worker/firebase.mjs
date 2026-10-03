// Only customer authentication goes to Firebase; profiles, carts and orders stay in D1.
export const firebaseConfigured = env => Boolean(env.FIREBASE_WEB_API_KEY && env.FIREBASE_PROJECT_ID);
export class FirebaseError extends Error {
  constructor(code) {super(code); this.code = code;}
}
async function call(env, method, data) {
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:' + method + '?key=' + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(10000)});
  const result = await response.json();
  if (!response.ok) throw new FirebaseError(result.error?.message?.split(' : ')[0] || 'UNAVAILABLE');
  return result;
}
export async function firebaseLogin(env, email, password) {
  return call(env, 'signInWithPassword', {email, password, returnSecureToken: true});
}
export async function firebaseCreate(env, email, password) {
  return call(env, 'signUp', {email, password, returnSecureToken: true});
}
export async function firebaseEnsure(env, email, password) {
  try {return await firebaseCreate(env, email, password);}
  catch (error) {if (error.code !== 'EMAIL_EXISTS') throw error; return firebaseLogin(env, email, password);}
}
export const firebaseResetEmail = (env, email) => call(env, 'sendOobCode', {requestType: 'PASSWORD_RESET', email});
export async function firebaseRefresh(env, refreshToken) {
  const response = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: refreshToken}).toString(), signal: AbortSignal.timeout(10000)});
  const result = await response.json();
  if (!response.ok) throw new FirebaseError(result.error?.message || 'UNAVAILABLE');
  return {idToken: result.id_token, refreshToken: result.refresh_token, localId: result.user_id};
}
export function firebaseClaims(env, token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload));
    if (claims.aud !== env.FIREBASE_PROJECT_ID || claims.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID || !claims.sub || !Number.isInteger(claims.auth_time) || claims.exp <= Date.now() / 1000) return null;
    return claims;
  } catch {return null;}
}
// Called only for tokens returned directly by Firebase's HTTPS login API and kept
// inside an encrypted server session. No client-supplied JWT is trusted here.
export async function firebaseSessionUser(env, token, uid) {
  const claims = firebaseClaims(env, token);
  if (!claims || claims.sub !== uid) return null;
  try {
    const result = await call(env, 'lookup', {idToken: token}), user = result.users?.[0];
    if (!user || user.disabled || user.localId !== uid || Number(user.validSince || 0) > claims.auth_time) return null;
    return user;
  } catch (error) {
    if (['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND'].includes(error.code)) return null;
    throw error;
  }
}
async function sessionKey(env) {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('firebase-session:' + env.STAFF_PASSWORD_PEPPER));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const hex = value => Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join('');
export async function sealFirebaseToken(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await sessionKey(env), new TextEncoder().encode(token));
  return hex(iv) + hex(encrypted);
}
export async function openFirebaseToken(env, value) {
  try {
    if (!/^[a-f0-9]+$/.test(value || '') || value.length < 56 || value.length % 2) return null;
    const bytes = Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));
    return new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12)}, await sessionKey(env), bytes.slice(12)));
  } catch {return null;}
}
