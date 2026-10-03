import {validPassword, passwordRequirement} from './password-policy.js';
import {normalizeGmail, gmailError, validContact, contactError, today} from './customer-validation.js';
const root = new URL('.', import.meta.url), sessionKey = 'abtech-customer-session:' + root.pathname;
let customer = null, base, waiters = [], trigger, busy = false;
export const getCustomer = () => customer;
const gmailInput = `<label>Gmail<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="yourname@gmail.com"></label>`;
const profileInputs = () => `${gmailInput}<label>Full Name<input name="fullName" autocomplete="name" required maxlength="120"></label><label>Contact No<input name="contactNo" type="tel" inputmode="numeric" autocomplete="tel-national" required maxlength="11" placeholder="0123456789 or 01112345678"></label><p class="customer-help">011: 11 digits. Other 01 prefixes: 10 digits.</p><div class="customer-profile-row"><label>Date of Birth<input name="dateOfBirth" type="date" autocomplete="bday" min="1900-01-01" max="${today()}" required></label><label>Gender<select name="gender" required><option value="">Choose gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label></div>`;
const passwordInput = (newPassword = false) => `<label>Password<input name="password" type="password" autocomplete="${newPassword ? 'new-password' : 'current-password'}" required minlength="${newPassword ? 8 : 6}" maxlength="${newPassword ? 128 : 4096}"></label>`;
const modal = document.createElement('dialog');
modal.className = 'customer-dialog'; modal.setAttribute('aria-labelledby', 'customer-title');
modal.innerHTML = `<div class="cart-heading"><div><span class="eyebrow">Customer account</span><h2 id="customer-title">Welcome to AB Tech</h2></div><button type="button" class="cart-close customer-close" aria-label="Close account window">×</button></div><p id="customer-context">Browse freely. Sign in to save products to your cart.</p><div id="customer-forms"><div class="customer-tabs" role="tablist" aria-label="Customer account options"><button type="button" id="customer-login-tab" role="tab" aria-selected="true" aria-controls="customer-login-form">Login</button><button type="button" id="customer-register-tab" role="tab" aria-selected="false" aria-controls="customer-register-form" tabindex="-1">Create account</button></div><form id="customer-login-form" role="tabpanel" aria-labelledby="customer-login-tab">${gmailInput}${passwordInput()}<button class="button customer-submit">Login</button><div class="customer-form-links"><button type="button" data-account-view="forgot">Reset password</button><button type="button" data-account-view="link">Link an existing username account</button></div></form><form id="customer-register-form" role="tabpanel" aria-labelledby="customer-register-tab" hidden>${profileInputs()}${passwordInput(true)}<p class="customer-help">${passwordRequirement}</p><label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><button class="button customer-submit">Create account</button></form><form id="customer-forgot-form" hidden><h3>Reset password</h3><p class="customer-help">Enter the Gmail used for your account to receive a password reset link.</p>${gmailInput}<button class="button customer-submit">Send reset email</button><div class="customer-form-links"><button type="button" data-account-view="login">Back to login</button></div></form><form id="customer-link-form" hidden><h3>Link your existing account</h3><p class="customer-help">Enter your old username and password, then add your Gmail and details. Your saved cart will stay with your account.</p><label>Existing username<input name="username" autocomplete="username" required minlength="3" maxlength="24"></label>${passwordInput()}${profileInputs()}<button class="button customer-submit">Link Gmail and log in</button><div class="customer-form-links"><button type="button" data-account-view="login">Back to login</button></div></form></div><div id="customer-signed-in" hidden><p id="customer-username"></p><div class="customer-form-links"><button type="button" id="customer-link-current" data-account-view="link" hidden>Link Gmail to this account</button></div><button type="button" class="button secondary" id="customer-logout">Log out</button></div><p id="customer-message" role="status" aria-live="polite"></p>`;
document.body.append(modal);
const $ = id => modal.querySelector('#' + id);
function message(text, error = false) {const element = $('customer-message'); element.textContent = text; element.dataset.error = String(error);}
function setCustomer(value) {
  customer = value;
  try {if (value) sessionStorage.setItem(sessionKey, JSON.stringify({token: value.token})); else sessionStorage.removeItem(sessionKey);} catch {}
  const name = value?.fullName || value?.email || value?.username;
  document.querySelectorAll('[data-customer-account]').forEach(button => {button.querySelector('span').textContent = value ? name : 'Login'; button.setAttribute('aria-label', value ? 'Account for ' + name : 'Customer login or create account');});
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
    if (response.status === 401 && !['login', 'register', 'link-account'].includes(path)) setCustomer(null);
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
function view(name) {
  for (const kind of ['login', 'register', 'forgot', 'link']) $('customer-' + kind + '-form').hidden = name !== kind;
  modal.querySelector('.customer-tabs').hidden = !['login', 'register'].includes(name);
  for (const [id, active] of [['customer-login-tab', name === 'login'], ['customer-register-tab', name === 'register']]) {$(id).setAttribute('aria-selected', String(active)); $(id).tabIndex = active ? 0 : -1;}
  message('');
}
function openAccount(productName) {
  trigger = document.activeElement;
  $('customer-forms').hidden = Boolean(customer); $('customer-signed-in').hidden = !customer;
  $('customer-username').textContent = customer ? 'Signed in as ' + (customer.email || customer.username) : '';
  $('customer-link-current').hidden = !customer || Boolean(customer.email);
  $('customer-context').textContent = productName ? `Login or create an account to add ${productName}. We’ll add it automatically when you’re signed in.` : 'Browse freely. Sign in to save products to your cart.';
  view('login'); if (!modal.open) modal.showModal();
}
export async function requireCustomer(productName) {
  await customerReady;
  if (customer) return customer;
  openAccount(productName);
  return new Promise(resolve => waiters.push(resolve));
}
document.querySelectorAll('[data-customer-account]').forEach(button => button.addEventListener('click', async () => {await customerReady; openAccount();}));
$('customer-login-tab').addEventListener('click', () => {if (!busy) view('login');});
$('customer-register-tab').addEventListener('click', () => {if (!busy) view('register');});
modal.querySelectorAll('[data-account-view]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  const email = $('customer-login-form').elements.email.value;
  $('customer-forms').hidden = false; $('customer-signed-in').hidden = true;
  view(button.dataset.accountView);
  if (button.dataset.accountView === 'forgot') {const input = $('customer-forgot-form').elements.email; input.value = email; input.setCustomValidity(gmailError(input.value));}
  if (button.dataset.accountView === 'link' && customer) $('customer-link-form').elements.username.value = customer.username;
}));
modal.querySelectorAll('[role="tab"]').forEach(button => button.addEventListener('keydown', event => {
  if (!busy && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {event.preventDefault(); const register = $('customer-register-form').hidden; view(register ? 'register' : 'login'); $(register ? 'customer-register-tab' : 'customer-login-tab').focus();}
}));
modal.querySelectorAll('[name="email"]').forEach(input => {
  const validate = () => input.setCustomValidity(gmailError(input.value));
  input.addEventListener('input', validate); input.addEventListener('blur', () => {input.value = normalizeGmail(input.value); validate();});
});
modal.querySelectorAll('[name="contactNo"]').forEach(input => {
  const clean = () => {
  const digits = input.value.replace(/\D/g, '');
  input.maxLength = digits.startsWith('01') && digits.length >= 3 && !digits.startsWith('011') ? 10 : 11;
  input.value = digits.slice(0, input.maxLength);
  input.setCustomValidity(input.value && !validContact(input.value) ? contactError : '');
  };
  input.addEventListener('input', clean);
  input.addEventListener('paste', event => {
    if (!event.clipboardData) return;
    event.preventDefault();
    const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
    const value = input.value.slice(0, start) + digits + input.value.slice(end);
    input.maxLength = value.startsWith('01') && value.length >= 3 && !value.startsWith('011') ? 10 : 11;
    input.value = value.slice(0, input.maxLength); clean();
  });
});
const registerForm = $('customer-register-form');
registerForm.elements.password.addEventListener('input', () => {registerForm.elements.password.setCustomValidity(validPassword(registerForm.elements.password.value) ? '' : passwordRequirement); registerForm.elements.confirmPassword.setCustomValidity('');});
registerForm.elements.confirmPassword.addEventListener('input', () => registerForm.elements.confirmPassword.setCustomValidity(''));
for (const [kind, path] of [['login', 'login'], ['register', 'register'], ['link', 'link-account'], ['forgot', 'forgot-password']]) $('customer-' + kind + '-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const form = event.currentTarget;
  if (kind === 'register' && form.elements.password.value !== form.elements.confirmPassword.value) {form.elements.confirmPassword.setCustomValidity('The passwords do not match.'); form.elements.confirmPassword.reportValidity(); return;}
  busy = true; modal.querySelectorAll('button').forEach(button => button.disabled = true);
  message(kind === 'forgot' ? 'Requesting your reset email…' : kind === 'register' ? 'Creating your account…' : 'Signing in…');
  try {
    const fields = Object.fromEntries(new FormData(form)); fields.email = normalizeGmail(fields.email);
    const result = await send(path, {method: 'POST', body: JSON.stringify(fields)});
    if (kind === 'forgot') {message(result.message); return;}
    setCustomer(result); form.reset();
    const pending = waiters; waiters = []; pending.forEach(resolve => resolve(customer));
    busy = false; modal.close();
  } catch (error) {message(error.message || 'Could not connect. Please try again.', true);}
  finally {busy = false; modal.querySelectorAll('button').forEach(button => button.disabled = false);}
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
