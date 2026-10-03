'use strict';
import {loadCategories, renderCategoryCards} from './category-store.js';
import {addToCart} from './cart.js?v=gmail-profile-1';
const productCategories = await loadCategories().catch(() => {document.getElementById('load-error').hidden = false; return [];});
renderCategoryCards(document.querySelector('.catalogue-categories'), productCategories);
const categories = productCategories.map(category => category.name);
const money = new Intl.NumberFormat('en-MY', {style: 'currency', currency: 'MYR', minimumFractionDigits: 0, maximumFractionDigits: 2});
const params = new URLSearchParams(location.search);
const hasCategory = categories.includes(params.get('category'));
const selectedCategory = hasCategory ? params.get('category') : null;
const browsingProducts = hasCategory || params.get('view') === 'all';
if (params.has('category') && !hasCategory) document.getElementById('catalogue-page-description').textContent = 'That category is no longer available. Browse our current categories below.';
let category = hasCategory ? params.get('category') : 'All products';
let products = [];
const grid = document.getElementById('products');
const search = document.getElementById('search');
const sort = document.getElementById('sort');
const dialog = document.getElementById('product-dialog');
let activeProductButton;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function price(product) {
  if (product.price_mode === 'quote') return 'Request a quote';
  return (product.price_mode === 'from' ? 'From ' : '') + money.format(product.price);
}
function imagePath(path) {
  // Uploaded media stays within this site; reject script URLs and foreign paths.
  const clean = String(path || '').replace(/^\/+/, '');
  if (!/^assets\/[a-zA-Z0-9_./ -]+$/.test(clean) || clean.split('/').includes('..')) return 'assets/products/cctv.svg';
  return clean;
}
function filters() {
  const nav = document.getElementById('category-filters');
  nav.replaceChildren();
  nav.hidden = hasCategory;
  if (hasCategory) return;
  ['All products', ...categories].forEach(name => {
    const button = element('button', '', name);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(name === category));
    button.addEventListener('click', () => {
      category = name;
      const url = new URL(location.href);
      if (category === 'All products') { url.searchParams.delete('category'); url.searchParams.set('view', 'all'); }
      else { url.searchParams.set('category', category); url.searchParams.delete('view'); }
      history.replaceState(null, '', url);
      filters(); render();
    });
    nav.append(button);
  });
}
function showDetails(product, button) {
  activeProductButton = button;
  document.getElementById('detail-add-cart').onclick = () => addToCart(product);
  document.getElementById('detail-name').textContent = product.name;
  document.getElementById('detail-category').textContent = product.category;
  document.getElementById('detail-price').textContent = price(product);
  document.getElementById('detail-description').textContent = product.description;
  document.getElementById('detail-installation').textContent = product.installation;
  document.getElementById('detail-availability').textContent = product.availability;
  document.getElementById('detail-example').hidden = !(product.new_arrival ?? product.example);
  document.getElementById('detail-example-note').hidden = !product.example;
  document.getElementById('detail-specs').replaceChildren(...(product.specifications || []).map(text => element('li', '', text)));
  const image = document.getElementById('detail-image');
  image.src = imagePath(product.image); image.alt = product.name + (product.example ? ' — example illustration' : '');
  const gallery = document.getElementById('detail-gallery');
  gallery.replaceChildren();
  [product.image, ...(product.gallery || [])].forEach((path, index) => {
    const thumbnail = element('button'); thumbnail.type = 'button';
    thumbnail.setAttribute('aria-label', 'View product image ' + (index + 1));
    thumbnail.setAttribute('aria-pressed', String(index === 0));
    const img = element('img'); img.src = imagePath(path); img.alt = '';
    thumbnail.append(img);
    thumbnail.addEventListener('click', () => {
      image.src = imagePath(path);
      gallery.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === thumbnail)));
    });
    gallery.append(thumbnail);
  });
  gallery.hidden = gallery.children.length < 2;
  const subject = 'Product enquiry: ' + product.name;
  const body = `Hello AB Tech One Solution,\n\nI would like to enquire about ${product.name}.\nCategory: ${product.category}\n${product.example ? 'I saw this example in your catalogue. Please confirm actual products and prices.' : 'Listed price: ' + price(product)}\n\nPlease advise availability and installation options.\n\nMy name:\nMy phone:\nMy location:`;
  document.getElementById('detail-enquire').href = `mailto:abtechonesolution@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  dialog.showModal();
  document.getElementById('close-dialog').focus();
}
function card(product) {
  const article = element('article', 'product-card');
  const photo = element('button', 'product-image-button'); photo.type = 'button';
  photo.setAttribute('aria-label', 'View ' + product.name);
  const img = element('img'); img.src = imagePath(product.image); img.alt = product.name + (product.example ? ' — example illustration' : '');
  img.width = 640; img.height = 440; img.loading = 'lazy';
  photo.append(img);
  if (product.new_arrival ?? product.example) photo.append(element('span', 'sample-badge', 'NEW ARRIVAL'));
  const copy = element('div', 'product-card-copy');
  copy.append(element('span', 'product-category', product.category));
  const heading = element('h3'); const name = element('button', 'product-title-button', product.name); name.type = 'button'; heading.append(name);
  const bottom = element('div', 'product-card-bottom');
  const cost = element('div', 'product-price', price(product));
  cost.append(element('small', '', product.example ? 'Illustrative price' : product.availability));
  const model = element('p', 'product-model', product.description);
  copy.append(heading, model);
  const details = element('button', '', 'View details ↗'); details.type = 'button';
  bottom.append(cost, details); copy.append(bottom); article.append(photo, copy);
  const add = element('button', 'button product-add-cart', 'Add to cart'); add.type = 'button';
  add.setAttribute('aria-label', 'Add ' + product.name + ' to cart');
  add.addEventListener('click', async () => {add.disabled = true; try {await addToCart(product);} finally {add.disabled = false;}});
  copy.append(add);
  [photo, name, details].forEach(button => button.addEventListener('click', () => showDetails(product, button)));
  return article;
}
function render() {
  const query = search.value.trim().toLowerCase();
  const visible = products.filter(p => (category === 'All products' || p.category === category) && `${p.name} ${p.description} ${p.category} ${(p.specifications || []).join(' ')}`.toLowerCase().includes(query));
  if (sort.value === 'name') visible.sort((a,b) => a.name.localeCompare(b.name));
  if (sort.value.startsWith('price-')) visible.sort((a,b) => {
    if (a.price_mode === 'quote' && b.price_mode === 'quote') return 0;
    if (a.price_mode === 'quote') return 1;
    if (b.price_mode === 'quote') return -1;
    return sort.value === 'price-low' ? a.price - b.price : b.price - a.price;
  });
  document.getElementById('category-title').textContent = category;
  document.getElementById('catalogue-page-title').textContent = category;
  document.title = category + ' | AB Tech One Solution';
  const categoryCard = [...document.querySelectorAll('.catalogue-categories .service-card')].find(card => card.querySelector('h3').textContent === category);
  document.getElementById('catalogue-page-description').textContent = categoryCard ? categoryCard.querySelector('p').textContent : 'Explore all our products, or choose a category below.';
  document.getElementById('total-count').textContent = products.filter(p => category === 'All products' || p.category === category).length;
  document.getElementById('result-count').textContent = `${visible.length} product${visible.length === 1 ? '' : 's'}`;
  grid.replaceChildren(...visible.map(card));
  document.getElementById('empty-state').hidden = visible.length > 0;
}
search.addEventListener('input', render); sort.addEventListener('change', render);
document.getElementById('reset-filters').addEventListener('click', () => {
  search.value = ''; category = selectedCategory || 'All products'; sort.value = 'featured';
  if (!hasCategory) {
    const url = new URL(location.href); url.searchParams.delete('category'); url.searchParams.set('view', 'all'); history.replaceState(null, '', url);
  }
  filters(); render();
});
document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
dialog.addEventListener('close', () => activeProductButton?.focus());
document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('category-landing').hidden = browsingProducts;
document.getElementById('product-browser').hidden = !browsingProducts;
if (hasCategory) {
  document.querySelector('.sort-field').hidden = true;
  search.placeholder = 'Search ' + selectedCategory + ' products…';
  document.querySelector('#empty-state p').textContent = 'Try another keyword to search this category.';
  document.getElementById('reset-filters').textContent = 'Clear search';
}
if (browsingProducts) {
document.getElementById('count-label').textContent = 'products to explore';
filters();
Promise.all(productCategories.filter(item => !hasCategory || item.name === selectedCategory).map(async ({name, slug}) => {
  const response = await fetch('data/categories/' + slug + '.json');
  if (!response.ok) throw new Error('Catalogue unavailable');
  const data = await response.json();
  return data.products.filter(p => p.published === true).map(p => ({...p, category: name}));
})).then(groups => {
  products = groups.flat();
  document.getElementById('total-count').textContent = products.length;
  grid.setAttribute('aria-busy', 'false'); render();
}).catch(() => {
  grid.setAttribute('aria-busy', 'false');
  document.getElementById('result-count').textContent = 'Unable to load products';
  document.getElementById('load-error').hidden = false;
});

}
