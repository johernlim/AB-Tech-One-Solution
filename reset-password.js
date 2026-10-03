import {validPassword, passwordRequirement} from './password-policy.js';
let token;
const form = document.querySelector('#reset-password-form'), message = document.querySelector('#reset-message');
function readLink() {
  token = new URLSearchParams(location.hash.slice(1)).get('token');
  // Remove the private token from the address bar and browser history.
  history.replaceState(null, '', location.pathname + location.search);
  form.reset(); form.hidden = !/^[a-f0-9]{64}$/.test(token || '');
  message.textContent = form.hidden ? 'This reset link is invalid. Open Login and request a new password reset email.' : '';
}
readLink(); window.addEventListener('hashchange', readLink);
form.elements.password.addEventListener('input', () => {form.elements.password.setCustomValidity(validPassword(form.elements.password.value) ? '' : passwordRequirement); form.elements.confirmPassword.setCustomValidity('');});
form.elements.confirmPassword.addEventListener('input', () => form.elements.confirmPassword.setCustomValidity(''));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (form.elements.password.value !== form.elements.confirmPassword.value) {form.elements.confirmPassword.setCustomValidity('The passwords do not match.'); form.elements.confirmPassword.reportValidity(); return;}
  const button = form.querySelector('button'); if (button.disabled) return; button.disabled = true;
  message.textContent = 'Saving your new password…';
  try {
    const settings = await fetch('admin/settings.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
    if (!settings.ok) throw new Error('Could not connect. Please try again.');
    const base = (await settings.json()).auth_base_url;
    const response = await fetch(new URL('/customer/reset-password', base), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token, ...Object.fromEntries(new FormData(form))}), signal: AbortSignal.timeout(20000)});
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not reset your password. Please try again.');
    // All server sessions were revoked; remove the stale session in this tab too.
    try {sessionStorage.removeItem('abtech-customer-session:' + new URL('.', import.meta.url).pathname);} catch {}
    form.reset(); form.hidden = true; message.textContent = result.message;
  } catch (error) {message.textContent = error.message || 'Could not connect. Please try again.';}
  finally {button.disabled = false;}
});
