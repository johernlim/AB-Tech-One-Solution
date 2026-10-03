import {validPassword, passwordRequirement} from './password-policy.js';
const root = new URL('.', import.meta.url), sessionKey = 'abtech-customer-session:' + root.pathname;
let customer = null, base, waiters = [], trigger, busy = false;
export const getCustomer = () => customer;
const modal = document.createElement('dialog');
modal.className = 'customer-dialog'; modal.setAttribute('aria-labelledby', 'customer-title');
modal.innerHTML = `<div class="cart-heading"><div><span class="eyebrow">Customer account</span><h2 id="customer-title">Welcome to AB Tech</h2></div><button type="button" class="cart-close customer-close" aria-label="Close account window">×</button></div><p id="customer-context">Browse freely. Sign in to save products to your cart.</p><div id="customer-forms"><div class="customer-tabs" role="tablist" aria-label="Customer account options"><button type="button" id="customer-login-tab" role="tab" aria-selected="true" aria-controls="customer-login-form">Login</button><button type="button" id="customer-register-tab" role="tab" aria-selected="false" aria-controls="customer-register-form" tabindex="-1">Create account</button></div><form id="customer-login-form" role="tabpanel" aria-labelledby="customer-login-tab"><label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9][A-Za-z0-9_]{2,23}"></label><label>Password<input name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128"></label><button class="button customer-submit">Login</button></form><form id="customer-register-form" role="tabpanel" aria-labelledby="customer-register-tab" hidden><label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9][A-Za-z0-9_]{2,23}" placeholder="Choose a username"></label><p class="customer-help">3–24 letters, numbers or underscores.</p><label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="At least 8 characters, a number and a symbol"></label><p class="customer-help">Use 8–128 characters, including a number and a special symbol.</p><label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><button class="button customer-submit">Create account</button></form></div><div id="customer-signed-in" hidden><p id="customer-username"></p><button type="button" class="button secondary" id="customer-logout">Log out</button></div><p id="customer-message" role="status" aria-live="polite"></p>`;
document.body.append(modal);
const $ = id => modal.querySelector('#' + id);
function message(text, error = false) {const element = $('customer-message'); element.textContent = text; element.dataset.error = String(error);}
function setCustomer(value) {
  customer = value;
  try {if (value) sessionStorage.setItem(sessionKey, JSON.stringify({token: value.token, username: value.username})); else sessionStorage.removeItem(sessionKey);} catch {}
  document.querySelectorAll('[data-customer-account]').forEach(button => {button.querySelector('span').textContent = value ? value.username : 'Login'; button.setAttribute('aria-label', value ? 'Account for ' + value.username : 'Customer login or create account');});
  window.dispatchEvent(new CustomEvent('customer-change', {detail: value}));
}
async function send(path, options = {}, token = customer?.token) {
  if (!base) {
    const response = await fetch(new URL('admin/settings.json', root), {cache: 'no-store', signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Customer login could not connect. Please try again.');
    base = (await response.json()).auth_base_url;
  }
  const response = await fetch(new URL('/customer/' + path, base), {...options, cache: 'no-store', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, signal: AbortSignal.timeout(20000)});
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !['login', 'register'].includes(path)) setCustomer(null);
    const error = new Error(result.error || 'Please try again.'); error.status = response.status; throw error;
  }
  return result;
}
export const customerRequest = send;
export const customerReady = (async () => {
  let saved;
  try {saved = JSON.parse(sessionStorage.getItem(sessionKey));} catch {}
  if (saved && /^[a-f0-9]{64}$/.test(saved.token)) {
    try {const result = await send('me', {}, saved.token); setCustomer({...result, token: saved.token});}
    catch (error) {if (error.status === 401) setCustomer(null);}
  }
  return customer;
})();
function tab(register) {
  $('customer-login-form').hidden = register; $('customer-register-form').hidden = !register;
  for (const [id, active] of [['customer-login-tab', !register], ['customer-register-tab', register]]) {$(id).setAttribute('aria-selected', String(active)); $(id).tabIndex = active ? 0 : -1;}
  message('');
}
function openAccount(productName) {
  trigger = document.activeElement;
  $('customer-forms').hidden = Boolean(customer); $('customer-signed-in').hidden = !customer;
  $('customer-username').textContent = customer ? 'Signed in as ' + customer.username : '';
  $('customer-context').textContent = productName ? `Login or create an account to add ${productName}. We’ll add it automatically when you’re signed in.` : 'Browse freely. Sign in to save products to your cart.';
  message(''); if (!modal.open) modal.showModal();
}
export async function requireCustomer(productName) {
  await customerReady;
  if (customer) return customer;
  openAccount(productName);
  return new Promise(resolve => waiters.push(resolve));
}
document.querySelectorAll('[data-customer-account]').forEach(button => button.addEventListener('click', async () => {await customerReady; openAccount();}));
$('customer-login-tab').addEventListener('click', () => {if (!busy) tab(false);});
$('customer-register-tab').addEventListener('click', () => {if (!busy) tab(true);});
modal.querySelectorAll('[role="tab"]').forEach(button => button.addEventListener('keydown', event => {
  if (!busy && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {event.preventDefault(); const register = $('customer-register-form').hidden; tab(register); $(register ? 'customer-register-tab' : 'customer-login-tab').focus();}
}));
const registerForm = $('customer-register-form');
registerForm.elements.password.addEventListener('input', () => {registerForm.elements.password.setCustomValidity(validPassword(registerForm.elements.password.value) ? '' : passwordRequirement); registerForm.elements.confirmPassword.setCustomValidity('');});
registerForm.elements.confirmPassword.addEventListener('input', () => registerForm.elements.confirmPassword.setCustomValidity(''));
for (const [id, register] of [['customer-login-form', false], ['customer-register-form', true]]) $(id).addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const form = event.currentTarget;
  if (register && form.elements.password.value !== form.elements.confirmPassword.value) {form.elements.confirmPassword.setCustomValidity('The passwords do not match.'); form.elements.confirmPassword.reportValidity(); return;}
  busy = true; modal.querySelectorAll('.customer-submit, [role="tab"]').forEach(button => button.disabled = true);
  message(register ? 'Creating your account…' : 'Signing in…');
  try {
    const result = await send(register ? 'register' : 'login', {method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form)))});
    setCustomer(result); form.reset();
    const pending = waiters; waiters = []; pending.forEach(resolve => resolve(customer));
    busy = false; modal.close();
  } catch (error) {message(error.message || 'Could not connect. Please try again.', true);}
  finally {busy = false; modal.querySelectorAll('.customer-submit, [role="tab"]').forEach(button => button.disabled = false);}
});
$('customer-logout').addEventListener('click', async () => {
  if (busy) return; busy = true; $('customer-logout').disabled = true;
  try {await send('logout', {method: 'POST'}); setCustomer(null); busy = false; modal.close();}
  catch (error) {message(error.message || 'Could not log out. Please try again.', true);}
  finally {busy = false; $('customer-logout').disabled = false;}
});
modal.querySelector('.customer-close').addEventListener('click', () => {if (!busy) modal.close();});
modal.addEventListener('cancel', event => {if (busy) event.preventDefault();});
modal.addEventListener('close', () => {const pending = waiters; waiters = []; pending.forEach(resolve => resolve(null)); trigger?.focus();});
