import {getCustomer, requireCustomer} from './customer-account.js?v=checkout-2';
import {gmailError, validContact, contactError} from './customer-validation.js';
import {shippingInputs, addressKeys, addressFieldsError} from './shipping-address.js';

export function setupCheckout(cart, readCart) {
  const review = document.createElement('div'); review.className = 'cart-review';
  for (const element of [...cart.children].slice(1)) review.append(element);
  cart.append(review);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'button cart-checkout'; button.textContent = 'Checkout'; button.hidden = true;
  review.querySelector('.cart-actions').insertBefore(button, review.querySelector('.cart-clear'));
  const checkout = document.createElement('section'); checkout.hidden = true; checkout.className = 'checkout-details';
  checkout.innerHTML = `<nav class="checkout-steps" aria-label="Checkout progress"><button type="button" class="checkout-back checkout-step completed" aria-label="Back to cart"><span class="checkout-step-marker" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 12 4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="checkout-step-copy"><span>Cart</span><small>Completed</small></span></button><span class="checkout-step-connector" aria-hidden="true"></span><span class="checkout-step current" aria-current="step"><span class="checkout-step-marker" aria-hidden="true">2</span><span class="checkout-step-copy"><span>Order details</span><small>Current step</small></span></span></nav><h2>Order details</h2><form id="checkout-form"><label>Name<input name="fullName" autocomplete="shipping name" required maxlength="120"></label><div class="shipping-row checkout-contact"><label>Mobile No.<input name="contactNo" type="tel" autocomplete="shipping tel-national" inputmode="numeric" required maxlength="11"></label><label>Email<input name="email" type="email" autocomplete="shipping email" required maxlength="254"></label></div><label>Order instructions / Alternative contact<textarea name="instructions" rows="2" maxlength="1000" placeholder="Delivery instructions or an alternative contact (optional)"></textarea></label>${shippingInputs}<div class="checkout-total"><span>Order total</span><strong></strong></div><p class="checkout-price-note"></p><p class="customer-help">Delivery and installation are confirmed separately. Online payment will be connected later.</p><p class="checkout-message" role="status" aria-live="polite"></p><button class="button customer-submit checkout-submit">Checkout</button></form>`;
  cart.append(checkout);
  const form = checkout.querySelector('form'), status = checkout.querySelector('.checkout-message');
  let busy = false, owner;
  function back() {if (busy) return; checkout.hidden = true; review.hidden = false; button.focus();}
  function showError(error, field) {if (field && form.elements[field]) {const input = form.elements[field]; input.setCustomValidity(error); input.reportValidity(); status.textContent = '';} else status.textContent = error;}
  for (const input of form.elements) for (const type of ['input', 'change']) input.addEventListener(type, () => {for (const element of form.elements) element.setCustomValidity?.(''); status.textContent = '';});
  checkout.querySelector('.checkout-back').addEventListener('click', back);
  button.addEventListener('click', async () => {
    if (busy || !await requireCustomer()) return;
    const current = readCart(); if (!current.items.length) return;
    const user = getCustomer(); owner = user.token; form.reset(); for (const input of form.elements) input.setCustomValidity?.(''); status.textContent = '';
    for (const key of ['fullName', 'contactNo', 'email']) form.elements[key].value = user[key] || '';
    const address = user.shippingAddressFields || {street: user.shippingAddress || '', country: 'Malaysia'};
    for (const key of addressKeys) {form.elements[key].value = address[key] || (key === 'country' ? 'Malaysia' : ''); form.elements[key].setCustomValidity('');}
    checkout.querySelector('.checkout-total span').textContent = current.totalLabel === 'Estimated total' ? 'Estimated total' : 'Order total';
    checkout.querySelector('.checkout-total strong').textContent = current.total;
    checkout.querySelector('.checkout-price-note').textContent = current.note;
    checkout.querySelector('.checkout-submit').textContent = 'Checkout — ' + current.total;
    review.hidden = true; checkout.hidden = false; form.elements.fullName.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    if (owner !== getCustomer()?.token) {back(); return;}
    const data = Object.fromEntries(new FormData(form));
    if (!data.fullName.trim() || /[\x00-\x1f\x7f]/.test(data.fullName)) return showError('Please enter your name.', 'fullName');
    const emailError = gmailError(data.email); if (emailError) return showError(emailError, 'email');
    if (!validContact(data.contactNo)) return showError(contactError, 'contactNo');
    const invalid = addressFieldsError(data); if (invalid) return showError(invalid.error, invalid.field);
    status.textContent = 'Your details are ready. Online payment is not connected yet. Your cart has been kept.';
  });
  window.addEventListener('customer-change', () => {if (getCustomer()?.token !== owner && !checkout.hidden) {checkout.hidden = true; review.hidden = false; form.reset();}});
  return {close: back, update() {const current = readCart(); button.hidden = !current.items.length; button.disabled = current.saving || current.unavailable;}};
}
