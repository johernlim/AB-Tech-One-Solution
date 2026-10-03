import {loadCategories} from './category-store.js';

const root = new URL('.', import.meta.url);
const storageKey = 'abtech-cart-v1:' + root.pathname;
const money = new Intl.NumberFormat('en-MY', {style: 'currency', currency: 'MYR'});
const keyOf = product => product.category + ':' + product.id;
let items = readCart(), catalogue, pending, trigger;
const cart = document.createElement('dialog');
cart.className = 'cart-dialog';
cart.setAttribute('aria-labelledby', 'cart-title');
cart.innerHTML = `<div class="cart-heading"><div><span class="eyebrow">Your selection</span><h2 id="cart-title">Shopping cart</h2></div><button type="button" class="cart-close" aria-label="Close cart">×</button></div><p class="cart-status" role="status"></p><div class="cart-items"></div><div class="cart-summary"><div><span id="cart-total-label">Total</span><strong id="cart-total">RM 0.00</strong></div><p class="cart-price-note"></p><p>Product prices only. Delivery and installation are confirmed separately.</p></div><div class="cart-actions"><button type="button" class="button secondary cart-continue">Continue shopping</button><button type="button" class="cart-clear">Clear cart</button></div>`;
document.body.append(cart);
const toast = document.createElement('p');
toast.className = 'cart-toast'; toast.setAttribute('role', 'status');
document.body.append(toast);
let toastTimer;

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!Array.isArray(saved)) return [];
    const unique = new Map();
    saved.slice(0, 200).forEach(item => {
      if (typeof item?.id === 'string' && item.id.length <= 80 && typeof item.category === 'string' && item.category.length <= 80 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 999) {
        unique.set(keyOf(item), {id: item.id, category: item.category, quantity: item.quantity});
      }
    });
    return [...unique.values()];
  } catch { return []; }
}
function say(text) {
  toast.textContent = text; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}
function save() {
  try {localStorage.setItem(storageKey, JSON.stringify(items));}
  catch {say('Your cart works in this tab, but this browser could not save it.');}
  updateCount();
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
    empty.append(node('h3', '', 'Your cart is empty'), node('p', '', 'Browse the catalogue and add products you like.'));
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
    if (product?.example) copy.append(node('span', 'sample-badge', 'EXAMPLE · Illustrative price'));
    const controls = node('div', 'cart-quantity');
    const minus = node('button', '', '−'), plus = node('button', '', '+'), input = node('input');
    minus.type = plus.type = 'button';
    minus.setAttribute('aria-label', 'Decrease quantity of ' + (product?.name || item.id));
    plus.setAttribute('aria-label', 'Increase quantity of ' + (product?.name || item.id));
    input.type = 'number'; input.min = 1; input.max = 999; input.step = 1; input.value = item.quantity;
    input.setAttribute('aria-label', 'Quantity of ' + (product?.name || item.id));
    minus.disabled = !available || item.quantity === 1; plus.disabled = !available || item.quantity === 999; input.disabled = !available;
    const change = quantity => {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {input.value = item.quantity; say('Choose a quantity from 1 to 999.'); return;}
      item.quantity = quantity; save(); render();
      const replacement = [...cart.querySelectorAll('.cart-item')][items.indexOf(item)];
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
    remove.addEventListener('click', () => {items = items.filter(i => i !== item); save(); render(); cart.querySelector('.cart-close').focus();});
    end.append(remove); row.append(copy, end); container.append(row);
  });
  cart.querySelector('#cart-total-label').textContent = estimated || quotes || examples ? 'Estimated total' : 'Total';
  cart.querySelector('#cart-total').textContent = money.format(total / 100);
  cart.querySelector('.cart-price-note').textContent = [quotes ? 'Quote-only items are excluded from this total.' : '', estimated ? '“From” prices are starting prices.' : '', examples ? 'Example products have illustrative prices. Contact us to confirm actual pricing.' : ''].filter(Boolean).join(' ');
  cart.querySelector('.cart-clear').hidden = !items.length;
}
export async function addToCart(product) {
  try {
    await loadCatalogue();
    if (!catalogue.has(keyOf(product))) throw new Error('This product is no longer available.');
    const existing = items.find(item => keyOf(item) === keyOf(product));
    if (existing?.quantity === 999) {say('Maximum quantity is 999.'); return;}
    if (existing) existing.quantity++;
    else if (items.length < 200) items.push({id: product.id, category: product.category, quantity: 1});
    else {say('Your cart is full. Remove an item first.'); return;}
    save(); say(product.name + ' added to cart.');
    if (cart.open) render();
  } catch (error) {say(error.message || 'Unable to add this product. Please try again.');}
}
document.querySelectorAll('[data-cart-open]').forEach(button => button.addEventListener('click', async () => {
  trigger = button; cart.showModal();
  cart.querySelector('.cart-status').textContent = 'Loading your cart…';
  cart.querySelector('.cart-items').replaceChildren(); cart.querySelector('.cart-summary').hidden = true; cart.querySelector('.cart-clear').hidden = true;
  try {catalogue = null; await loadCatalogue(); cart.querySelector('.cart-status').textContent = ''; render(); cart.querySelector('.cart-summary').hidden = false;}
  catch {cart.querySelector('.cart-status').textContent = 'Unable to load your cart. Close it and try again. Your saved items are kept.';}
}));
cart.querySelectorAll('.cart-close, .cart-continue').forEach(button => button.addEventListener('click', () => cart.close()));
cart.querySelector('.cart-clear').addEventListener('click', () => {items = []; save(); render(); cart.querySelector('.cart-close').focus();});
cart.addEventListener('close', () => trigger?.focus());
window.addEventListener('storage', event => {if (event.key === storageKey || event.key === null) {items = readCart(); updateCount(); if (cart.open && catalogue) render();}});
updateCount();
