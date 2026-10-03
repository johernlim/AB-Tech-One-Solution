import {setupCheckout} from './checkout.js?v=checkout-1';
import {loadCategories} from './category-store.js';
import {customerReady, getCustomer, requireCustomer, customerRequest} from './customer-account.js?v=checkout-1';

const root = new URL('.', import.meta.url);
const money = new Intl.NumberFormat('en-MY', {style: 'currency', currency: 'MYR'});
const keyOf = product => product.category + ':' + product.id;
let items = [], version = 0, catalogue, pending, trigger, saving = false, mutation = Promise.resolve();
const pageCart = document.querySelector('[data-cart-page]');
const cart = pageCart || document.createElement('dialog');
const visible = () => Boolean(pageCart || cart.open);
cart.className = pageCart ? 'cart-dialog cart-page-panel' : 'cart-dialog';
cart.setAttribute('aria-labelledby', 'cart-title');
cart.innerHTML = `<div class="cart-heading"><div><span class="eyebrow">Your selection</span><h2 id="cart-title">Shopping cart</h2></div><button type="button" class="cart-close" aria-label="Close cart">×</button></div><p class="cart-status" role="status"></p><div class="cart-items"></div><div class="cart-summary"><div><span id="cart-total-label">Total</span><strong id="cart-total">RM 0.00</strong></div><p class="cart-price-note"></p><p>Product prices only. Delivery and installation are confirmed separately.</p></div><div class="cart-actions"><button type="button" class="button secondary cart-continue">Continue shopping</button><a class="button cart-view" href="cart.html">View cart</a><button type="button" class="cart-clear">Clear cart</button></div>`;
if (pageCart) {const heading = cart.querySelector('#cart-title'), title = document.createElement('h1'); title.id = heading.id; title.textContent = heading.textContent; heading.replaceWith(title);}
if (!pageCart) document.body.append(cart);
else {cart.querySelector('.cart-close').hidden = true; cart.querySelector('.cart-view').hidden = true;}
const checkoutView = pageCart ? setupCheckout(cart, () => ({items, version, saving, unavailable: items.some(item => !catalogue?.has(keyOf(item))), total: cart.querySelector('#cart-total').textContent, totalLabel: cart.querySelector('#cart-total-label').textContent, note: cart.querySelector('.cart-price-note').textContent})) : null;
const toast = document.createElement('p');
toast.className = 'cart-toast'; toast.setAttribute('role', 'status');
document.body.append(toast);
let toastTimer;

function say(text) {
  toast.textContent = text; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}
function receiveCart(data) {items = data?.items || []; version = data?.version || 0; updateCount(); if (visible() && catalogue) render();}
window.addEventListener('customer-change', event => receiveCart(event.detail));
const ready = customerReady.then(receiveCart);
async function refreshCart() {if (getCustomer()) receiveCart(await customerRequest('cart')); else receiveCart(null);}
function save(transform) {
  const operation = mutation.then(async () => {
    if (!getCustomer()) {say('Please log in to use your cart.'); return false;}
    saving = true; checkoutView?.update();
    cart.querySelectorAll('.cart-items button, .cart-items input, .cart-clear').forEach(control => control.disabled = true);
    const owner = getCustomer().token;
    try {
      const next = transform(items);
      const result = await customerRequest('cart', {method: 'PUT', body: JSON.stringify({version, items: next})});
      if (owner === getCustomer()?.token) receiveCart(result);
      return true;
    } catch (error) {
      if (error.status === 409) {try {await refreshCart();} catch {}}
      say(error.message || 'Unable to save your cart. Please try again.'); return false;
    } finally {saving = false; if (visible() && catalogue) render();}
  });
  mutation = operation.catch(() => {}); return operation;
}
function updateCount() {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('[data-cart-open]').forEach(button => {
    button.querySelector('[data-cart-count]').textContent = count;
    button.setAttribute('aria-label', `View cart, ${count} item${count === 1 ? '' : 's'}`);
  });
}
function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
async function loadCatalogue() {
  if (catalogue) return catalogue;
  if (!pending) pending = loadCategories().then(productCategories => Promise.all(productCategories.map(async ({name, slug}) => {
    const response = await fetch(new URL('data/categories/' + slug + '.json', root), {cache: 'no-store'});
    if (!response.ok) throw new Error('Unable to load cart prices. Please try again.');
    const data = await response.json();
    return data.products.filter(p => p.published === true).map(p => ({...p, category: name}));
  }))).then(groups => catalogue = new Map(groups.flat().map(p => [keyOf(p), p]))).finally(() => pending = null);
  return pending;
}
function render() {
  const container = cart.querySelector('.cart-items'); container.replaceChildren();
  let total = 0, estimated = false, quotes = false, examples = false;
  if (!items.length) {
    const empty = node('div', 'cart-empty');
    empty.append(node('h3', '', 'Your cart is empty'), node('p', '', getCustomer() ? 'Browse the catalogue and add products you like.' : 'Browse products freely. Login or create an account when you add an item.'));
    const browse = node('a', 'button', 'Browse products'); browse.href = new URL('catalogue.html?view=all', root).href;
    empty.append(browse); container.append(empty);
  }
  items.forEach(item => {
    const product = catalogue?.get(keyOf(item));
    const available = Boolean(product);
    const row = node('article', 'cart-item');
    const copy = node('div', 'cart-item-copy');
    copy.append(node('span', 'product-category', item.category), node('h3', '', product?.name || item.id));
    if (product) {
      const image = node('img');
      const path = String(product.image || '');
      image.src = new URL(/^assets\/[a-zA-Z0-9_./ -]+$/.test(path) && !path.split('/').includes('..') ? path : 'assets/products/cctv.svg', root).href;
      image.alt = ''; row.append(image);
    }
    const priced = available && product.price_mode !== 'quote' && Number.isFinite(product.price) && product.price >= 0;
    const cents = priced ? Math.round(product.price * 100) : 0;
    total += cents * item.quantity;
    if (available) {estimated ||= product.price_mode === 'from'; quotes ||= !priced; examples ||= product.example;}
    const unitPrice = !available ? 'No longer available — remove this item' : !priced ? 'Price to be quoted' : (product.price_mode === 'from' ? 'From ' : '') + money.format(cents / 100) + ' each';
    copy.append(node('p', '', unitPrice));
    if (product && (product.new_arrival ?? product.example)) copy.append(node('span', 'sample-badge', 'NEW ARRIVAL'));
    const controls = node('div', 'cart-quantity');
    const minus = node('button', '', '−'), plus = node('button', '', '+'), input = node('input');
    minus.type = plus.type = 'button';
    minus.setAttribute('aria-label', 'Decrease quantity of ' + (product?.name || item.id));
    plus.setAttribute('aria-label', 'Increase quantity of ' + (product?.name || item.id));
    input.type = 'number'; input.min = 1; input.max = 999; input.step = 1; input.value = item.quantity;
    input.setAttribute('aria-label', 'Quantity of ' + (product?.name || item.id));
    minus.disabled = !available || item.quantity === 1; plus.disabled = !available || item.quantity === 999; input.disabled = !available;
    const change = async quantity => {
      if (saving) return;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {input.value = item.quantity; say('Choose a quantity from 1 to 999.'); return;}
      await save(current => current.map(i => keyOf(i) === keyOf(item) ? {...i, quantity} : i));
      const replacement = [...cart.querySelectorAll('.cart-item')][items.findIndex(i => keyOf(i) === keyOf(item))];
      replacement?.querySelector('input').focus();
    };
    minus.addEventListener('click', () => change(item.quantity - 1));
    plus.addEventListener('click', () => change(item.quantity + 1));
    input.addEventListener('change', () => change(Number(input.value)));
    controls.append(minus, input, plus); copy.append(controls);
    const end = node('div', 'cart-item-end');
    end.append(node('strong', '', !available ? 'Unavailable' : !priced ? 'Quote needed' : (product.price_mode === 'from' ? 'From ' : '') + money.format(cents * item.quantity / 100)));
    const remove = node('button', 'cart-remove', 'Remove'); remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove ' + (product?.name || item.id));
    remove.addEventListener('click', async () => {if (saving) return; await save(current => current.filter(i => keyOf(i) !== keyOf(item))); cart.querySelector(pageCart ? '.cart-continue' : '.cart-close').focus();});
    end.append(remove); row.append(copy, end); container.append(row);
  });
  cart.querySelector('#cart-total-label').textContent = estimated || quotes || examples ? 'Estimated total' : 'Total';
  cart.querySelector('#cart-total').textContent = money.format(total / 100);
  cart.querySelector('.cart-price-note').textContent = [quotes ? 'Quote-only items are excluded from this total.' : '', estimated ? '“From” prices are starting prices.' : '', examples ? 'Example products have illustrative prices. Contact us to confirm actual pricing.' : ''].filter(Boolean).join(' ');
  cart.querySelector('.cart-clear').hidden = !items.length;
  cart.querySelector('.cart-clear').disabled = saving;
  checkoutView?.update();
}
export async function addToCart(product) {
  try {
    await ready;
    if (!await requireCustomer(product.name)) return;
    await loadCatalogue();
    if (!catalogue.has(keyOf(product))) throw new Error('This product is no longer available.');
    const saved = await save(current => {
      const existing = current.find(item => keyOf(item) === keyOf(product));
      if (existing?.quantity === 999) throw new Error('Maximum quantity is 999.');
      if (existing) return current.map(item => keyOf(item) === keyOf(product) ? {...item, quantity: item.quantity + 1} : item);
      if (current.length >= 200) throw new Error('Your cart is full. Remove an item first.');
      return [...current, {id: product.id, category: product.category, quantity: 1}];
    });
    if (saved) say(product.name + ' added to cart.');
  } catch (error) {say(error.message || 'Unable to add this product. Please try again.');}
}
async function openCart(button) {
  if (button) checkoutView?.close();
  trigger = button; if (!pageCart && !cart.open) cart.showModal();
  cart.querySelector('.cart-status').textContent = 'Loading your cart…';
  cart.querySelector('.cart-items').replaceChildren(); cart.querySelector('.cart-summary').hidden = true; cart.querySelector('.cart-clear').hidden = true;
  try {await ready; await mutation; await refreshCart(); catalogue = null; await loadCatalogue(); cart.querySelector('.cart-status').textContent = ''; render(); cart.querySelector('.cart-summary').hidden = false;}
  catch {cart.querySelector('.cart-status').textContent = pageCart ? 'Unable to load your cart. Refresh this page to try again. Your saved items are kept.' : 'Unable to load your cart. Close it and try again. Your saved items are kept.';}
}
document.querySelectorAll('[data-cart-open]').forEach(button => button.addEventListener('click', () => openCart(button)));
if (pageCart) openCart();
cart.querySelectorAll('.cart-close, .cart-continue').forEach(button => button.addEventListener('click', () => {if (pageCart) location.href = new URL('catalogue.html?view=all', root).href; else cart.close();}));
cart.querySelector('.cart-clear').addEventListener('click', async () => {if (saving) return; await save(() => []); cart.querySelector(pageCart ? '.cart-continue' : '.cart-close').focus();});
cart.addEventListener('close', () => trigger?.focus());
updateCount();
