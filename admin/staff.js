import {productCategories} from '../product-categories.js';
const $ = id => document.getElementById(id);
let base, token, username, selected = productCategories[0], products = [], sha, editing = -1, busy = false;
function notice(id, text, error = false) { $(id).textContent = text; $(id).dataset.error = String(error); }
async function api(path, options = {}) {
  const response = await fetch(new URL('/staff/' + path, base), {...options, cache: 'no-store', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, signal: AbortSignal.timeout(20000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
  return result;
}
function tab(register) {
  $('register-form').hidden = !register; $('login-form').hidden = register;
  for (const [id, active] of [['register-tab', register], ['login-tab', !register]]) {
    $(id).setAttribute('aria-selected', String(active)); $(id).tabIndex = active ? 0 : -1;
  }
  notice('account-message', '');
}
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function imageURL(path) { return new URL('../' + (/^assets\/(products|uploads)\/[a-zA-Z0-9_. -]+$/.test(path || '') && !path.includes('..') ? path : 'assets/products/cctv.svg'), location.href).href; }
function render() {
  $('staff-products').replaceChildren();
  if (!products.length) $('staff-products').append(node('p', 'No products yet. Add the first product in this category.'));
  products.forEach((product, index) => {
    const card = node('article', undefined, 'staff-product');
    const image = node('img'); image.src = imageURL(product.image); image.alt = product.name;
    const copy = node('div', undefined, 'staff-product-copy');
    const cost = product.price_mode === 'quote' ? 'Request a quote' : (product.price_mode === 'from' ? 'From ' : '') + new Intl.NumberFormat('en-MY', {style: 'currency', currency: 'MYR'}).format(product.price);
    copy.append(node('h3', product.name), node('p', cost), node('p', (product.published ? 'Visible' : 'Hidden') + (product.example ? ' · Example product' : '')));
    const actions = node('div', undefined, 'staff-product-actions');
    const edit = node('button', 'Edit product'); edit.type = 'button'; edit.addEventListener('click', () => editProduct(index));
    const remove = node('button', 'Delete'); remove.type = 'button'; remove.addEventListener('click', async () => {
      if (busy || !confirm('Delete ' + product.name + ' and publish this change?')) return;
      busy = true; remove.disabled = true;
      try { await publish(products.filter((_, item) => item !== index)); } catch (error) { notice('staff-workspace-message', error.message, true); } finally {busy = false; remove.disabled = false;}
    });
    actions.append(edit, remove); copy.append(actions); card.append(image, copy); $('staff-products').append(card);
  });
}
async function loadCategory(category) {
  if (busy) return;
  busy = true; $('add-staff-product').disabled = true;
  notice('staff-workspace-message', 'Loading products…');
  try {
    const data = await api('categories/' + category.slug);
    selected = category; products = data.products; sha = data.sha;
    $('staff-category-title').textContent = category.name;
    $('staff-categories').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.slug === category.slug)));
    notice('staff-workspace-message', ''); render();
  } catch (error) { notice('staff-workspace-message', error.message, true); }
  finally {busy = false; $('add-staff-product').disabled = !sha;}
}
async function workspace() {
  $('admin-home').hidden = true; $('staff-workspace').hidden = false;
  $('signed-in-as').textContent = 'Signed in as ' + username;
  $('staff-categories').replaceChildren(...productCategories.map(category => {
    const button = node('button'); button.type = 'button'; button.dataset.slug = category.slug; button.setAttribute('aria-pressed', 'false');
    const icon = node('img'); icon.src = new URL('../assets/category-icons/' + category.slug + '.svg', location.href).href; icon.alt = '';
    button.append(icon, node('span', category.name)); button.addEventListener('click', () => loadCategory(category)); return button;
  }));
  await loadCategory(productCategories[0]);
}
async function publish(nextProducts) {
  const result = await api('categories/' + selected.slug, {method: 'PUT', body: JSON.stringify({sha, products: nextProducts})});
  sha = result.sha; products = nextProducts; render(); notice('staff-workspace-message', result.message);
}
function editProduct(index) {
  if (busy || !sha) return;
  editing = index;
  const product = products[index] || {id: '', name: '', description: '', image: '', gallery: [], price_mode: 'fixed', price: 0, specifications: [], installation: 'Installation quoted separately.', availability: 'Contact us to confirm availability', published: false, example: true};
  const form = $('staff-product-form'); form.reset();
  for (const field of ['id', 'name', 'description', 'image', 'price_mode', 'price', 'installation', 'availability']) form.elements[field].value = product[field];
  for (const field of ['specifications', 'gallery']) form.elements[field].value = (product[field] || []).join('\n');
  for (const field of ['published', 'example']) form.elements[field].checked = product[field];
  $('staff-product-title').textContent = index < 0 ? 'Add product' : 'Edit product';
  $('product-category-note').textContent = selected.name + ' · This product belongs to the selected category.';
  notice('staff-product-message', ''); $('staff-product-dialog').showModal();
}
async function upload(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 500000) throw new Error('Choose a JPG, PNG or WebP image smaller than 500 KB.');
  const data = await new Promise((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file);});
  return (await api('upload', {method: 'POST', body: JSON.stringify({type: file.type, content: data})})).path;
}
async function initialize() {
  if (new URLSearchParams(location.search).get('demo') === '1') return;
  $('login-tab').addEventListener('click', () => tab(false)); $('register-tab').addEventListener('click', () => tab(true));
  document.querySelectorAll('.account-tabs button').forEach(button => button.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {event.preventDefault(); const register = $('register-form').hidden; tab(register); $(register ? 'register-tab' : 'login-tab').focus();}
  }));
  document.querySelectorAll('.show-password').forEach(button => button.addEventListener('click', () => {
    const input = $(button.dataset.for), show = input.type === 'password'; input.type = show ? 'text' : 'password'; button.textContent = show ? 'Hide' : 'Show'; button.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); button.setAttribute('aria-pressed', String(show));
  }));
  $('confirm-password').addEventListener('input', () => $('confirm-password').setCustomValidity(''));
  $('register-password').addEventListener('input', () => $('confirm-password').setCustomValidity(''));
  for (const [id, register] of [['login-form', false], ['register-form', true]]) $(id).addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    if (register && $('register-password').value !== $('confirm-password').value) { $('confirm-password').setCustomValidity('The passwords do not match.'); $('confirm-password').reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    busy = true; const button = $(register ? 'staff-register' : 'staff-login'); button.disabled = true;
    notice('account-message', register ? 'Creating your account…' : 'Signing in…');
    try {
      const result = await api(register ? 'register' : 'login', {method: 'POST', body: JSON.stringify(data)});
      if (register) {form.reset(); tab(false); $('login-username').value = data.username.trim().toLowerCase(); notice('account-message', result.message);}
      else {token = result.token; username = result.username; form.reset(); busy = false; await workspace();}
    } catch (error) {notice('account-message', error.message, true);}
    finally {busy = false; button.disabled = false;}
  });
  $('staff-logout').addEventListener('click', async () => {
    if (busy) return;
    busy = true; $('staff-logout').disabled = true;
    try {await api('logout', {method: 'POST'});} catch {} finally {
      token = null; products = []; sha = null; $('staff-products').replaceChildren(); $('staff-product-dialog').close(); $('staff-product-form').reset(); $('staff-workspace').hidden = true; $('admin-home').hidden = false; busy = false; $('staff-logout').disabled = false; notice('account-message', 'You have logged out.');
    }
  });
  $('add-staff-product').addEventListener('click', () => editProduct(-1));
  for (const id of ['close-staff-product', 'cancel-staff-product']) $(id).addEventListener('click', () => {if (!busy) $('staff-product-dialog').close();});
  $('staff-product-dialog').addEventListener('cancel', event => {if (busy) event.preventDefault();});
  for (const [id, gallery] of [['staff-photo', false], ['staff-gallery', true]]) $(id).addEventListener('change', async () => {
    if (busy) return;
    busy = true; $('publish-staff-product').disabled = true; notice('staff-product-message', 'Uploading photo…');
    try {
      const form = $('staff-product-form');
      for (const file of $(id).files) {
        const path = await upload(file);
        if (gallery) form.elements.gallery.value = [form.elements.gallery.value.trim(), path].filter(Boolean).join('\n');
        else form.elements.image.value = path;
      }
      notice('staff-product-message', 'Photo uploaded. Save the product to display it in the catalogue.');
    } catch (error) {notice('staff-product-message', error.message, true);}
    finally {busy = false; $('publish-staff-product').disabled = false; $(id).value = '';}
  });
  $('staff-product-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    const product = {...products[editing], ...Object.fromEntries(['id', 'name', 'description', 'image', 'price_mode', 'installation', 'availability'].map(field => [field, String(data.get(field)).trim()])), price: Number(data.get('price')), category: selected.name, published: form.elements.published.checked, example: form.elements.example.checked};
    for (const field of ['specifications', 'gallery']) product[field] = String(data.get(field)).split('\n').map(value => value.trim()).filter(Boolean);
    if (products.some((existing, index) => index !== editing && existing.id === product.id)) {notice('staff-product-message', 'That product ID is already used in this category.', true); return;}
    const next = [...products]; if (editing < 0) next.push(product); else next[editing] = product;
    busy = true; $('publish-staff-product').disabled = true; notice('staff-product-message', 'Publishing…');
    try {await publish(next); $('staff-product-dialog').close();} catch (error) {notice('staff-product-message', error.message, true);} finally {busy = false; $('publish-staff-product').disabled = false;}
  });
  try {
    const response = await fetch('settings.json', {cache: 'no-store'}); if (!response.ok) throw new Error();
    const settings = await response.json(); base = settings.auth_base_url;
    const status = await api('status');
    if (status.configured) {$('staff-login').disabled = false; $('staff-register').disabled = false; $('staff-setup-status').textContent = 'Account creation requires an invitation code from the owner.';}
    else $('staff-setup-status').textContent = 'Staff accounts need a one-time owner setup. Existing owners can use GitHub below.';
  } catch {$('staff-setup-status').textContent = 'Staff login is temporarily unavailable. Existing owners can use GitHub below.';}
}
initialize();
