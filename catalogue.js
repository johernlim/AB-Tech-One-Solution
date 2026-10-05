'use strict';
import {loadCategories, renderCategoryCards, currentCategoryName} from './category-store.js?v=no-category-labels-1';
import {applyCategoryOrder, loadLiveCategoryOrder} from './category-order.js';
import {paginateProducts, paginationMarkup} from './catalogue-pagination.js';
import {addToCart} from './cart.js?v=category-icons-1';
import {loadPromotions,promotionFor} from './promotions.js?v=promotion-prices-1';

import {loadPwpOffers, activeOffer, productKey, PWP_CATEGORY} from './pwp.js?v=pwp-no-dates-1';

const hasPwp = product => pwpOffers.some(offer => activeOffer(offer) && offer.qualifiers.includes(productKey(product)));
const snapshot = JSON.parse(document.getElementById('catalogue-snapshot')?.textContent || 'null');
const [promotions, pwpOffers, productCategories] = snapshot ? [snapshot.promotions, snapshot.offers, applyCategoryOrder(snapshot.categories, await loadLiveCategoryOrder())] : await Promise.all([
  loadPromotions().catch(() => []),
  loadPwpOffers().catch(() => []),
  loadCategories().catch(() => {document.getElementById('load-error').hidden = false; return [];})
]);
renderCategoryCards(document.querySelector('.catalogue-categories'), productCategories);
const categories = productCategories.map(category => category.name);
const money = new Intl.NumberFormat('en-MY', {style: 'currency', currency: 'MYR', minimumFractionDigits: 0, maximumFractionDigits: 2});
const promotionMoney = new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR',minimumFractionDigits:2,maximumFractionDigits:2});
const params = new URLSearchParams(location.search);
if (params.has('category')) params.set('category', currentCategoryName(params.get('category'), productCategories));
const hasCategory = categories.includes(params.get('category'));
document.getElementById('category-home-back').hidden = !hasCategory;
const selectedCategory = hasCategory ? params.get('category') : null;
const browsingProducts = hasCategory || params.get('view') === 'all';
if (params.has('category') && !hasCategory) document.getElementById('catalogue-page-description').textContent = 'That category is no longer available. Browse our current categories below.';
let category = hasCategory ? params.get('category') : 'All products';
let products = [];
let currentPage = new URLSearchParams(location.search).get('page') || 1;
const pagination = document.getElementById('product-pagination');
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
  const offer=promotionFor(product,promotions);
  return offer?promotionMoney.format(offer.price):(product.price_mode === 'from' ? 'From ' : '') + money.format(product.price);
}
function priceContent(container,product){
  const offer=promotionFor(product,promotions);container.replaceChildren();
  if(offer){const original=element('div','promotion-original');original.append(element('del','',promotionMoney.format(product.price)),element('span','promotion-badge',offer.label));container.append(original);}
  container.append(element('span','',price(product)));
  if(offer){container.append(element('small','promotion-saving','Save '+promotionMoney.format(product.price-offer.price)),element('small','promotion-period',offer.start+' – '+offer.end));}
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
      currentPage = 1;
      const url = new URL(location.href);
      url.searchParams.delete('page');
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
  let badge = document.getElementById('detail-pwp-badge');
  if (!badge) {badge = element('p', 'pwp-badge'); badge.id = 'detail-pwp-badge'; document.getElementById('detail-name').after(badge);}
  badge.hidden = !hasPwp(product) && product.category !== PWP_CATEGORY;
  badge.textContent = product.category === PWP_CATEGORY ? 'PWP add-on · Unlock special prices with qualifying products in your cart.' : 'PWP offer available · Choose your discounted add-ons in the cart.';
  document.getElementById('detail-category').textContent = product.category;
  priceContent(document.getElementById('detail-price'),product);
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
function card(product, index) {
  const article = element('article', 'product-card');
  const photo = element('button', 'product-image-button'); photo.type = 'button';
  photo.setAttribute('aria-label', 'View ' + product.name);
  const img = element('img'); img.src = imagePath(product.image); img.alt = product.name + (product.example ? ' — example illustration' : '');
  img.width = 640; img.height = 440; img.loading = index < 3 ? 'eager' : 'lazy';
  photo.append(img);
  if (product.new_arrival ?? product.example) photo.append(element('span', 'sample-badge', 'NEW ARRIVAL'));
  if (hasPwp(product) || product.category === PWP_CATEGORY) {
    const badge = element('span', 'product-pwp-badge', 'PWP');
    badge.setAttribute('aria-label', product.category === PWP_CATEGORY ? 'Purchase with Purchase add-on' : 'Purchase with Purchase offer available');
    photo.append(badge);
  }
  const copy = element('div', 'product-card-copy');
  copy.append(element('span', 'product-category', product.category));
  const heading = element('h3'); const name = element('button', 'product-title-button', product.name); name.type = 'button'; heading.append(name);
  const bottom = element('div', 'product-card-bottom');
  const cost = element('div', 'product-price', price(product));
  priceContent(cost,product);
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
  document.getElementById('category-enquiry').href = category === 'All products' ? 'index.html#contact' : 'index.html?service=' + encodeURIComponent(category) + '#contact';
  const query = search.value.trim().toLowerCase();
  const visible = products.filter(p => (category === 'All products' || p.category === category) && `${p.name} ${p.description} ${p.category} ${(p.specifications || []).join(' ')}`.toLowerCase().includes(query));
  if (sort.value === 'name') visible.sort((a,b) => a.name.localeCompare(b.name));
  if (sort.value.startsWith('price-')) visible.sort((a,b) => {
    if (a.price_mode === 'quote' && b.price_mode === 'quote') return 0;
    if (a.price_mode === 'quote') return 1;
    if (b.price_mode === 'quote') return -1;
    const aPrice=promotionFor(a,promotions)?.price??a.price,bPrice=promotionFor(b,promotions)?.price??b.price;
    return sort.value === 'price-low' ? aPrice - bPrice : bPrice - aPrice;
  });
  document.getElementById('category-title').textContent = category;
  document.getElementById('catalogue-page-title').textContent = category;
  document.title = category + ' | AB Tech One Solution';
  const categoryCard = [...document.querySelectorAll('.catalogue-categories .service-card')].find(card => card.querySelector('h3').textContent === category);
  document.getElementById('catalogue-page-description').textContent = categoryCard ? categoryCard.querySelector('p').textContent : 'Explore all our products, or choose a category below.';
  document.getElementById('total-count').textContent = products.filter(p => category === 'All products' || p.category === category).length;
  const paged = paginateProducts(visible, currentPage); currentPage = paged.page;
  document.getElementById('result-count').textContent = visible.length ? `Showing ${paged.start + 1}–${paged.start + paged.products.length} of ${visible.length} product${visible.length === 1 ? '' : 's'}` : '0 products';
  grid.replaceChildren(...paged.products.map(card));
  pagination.innerHTML = paginationMarkup(paged.page, paged.pages, page => {
    const url = new URL(location.href); url.searchParams.set('page', page); return url.pathname + url.search;
  });
  pagination.hidden = paged.pages <= 1;
  document.getElementById('empty-state').hidden = visible.length > 0;
}
function resetPage() {
  currentPage = 1;
  const url = new URL(location.href); url.searchParams.delete('page'); history.replaceState(null, '', url);
}
search.addEventListener('input', () => {resetPage(); render();});
sort.addEventListener('change', () => {resetPage(); render();});
pagination.addEventListener('click', event => {
  const link = event.target.closest('a[data-page]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); currentPage = Number(link.dataset.page);
  const url = new URL(location.href); url.searchParams.set('page', currentPage); history.replaceState(null, '', url);
  render();
  const heading = document.querySelector('.results-heading');
  heading.querySelector('h2').tabIndex = -1; heading.querySelector('h2').focus({preventScroll:true});
  heading.scrollIntoView({block:'start'});
});
document.getElementById('reset-filters').addEventListener('click', () => {
  search.value = ''; category = selectedCategory || 'All products'; sort.value = 'featured';
  resetPage();
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
if (!browsingProducts) {
  document.getElementById('catalogue-page-title').textContent = 'OUR PRODUCTS & SERVICES';
  document.getElementById('total-count').textContent = categories.length;
  document.getElementById('count-label').textContent = 'categories to explore';
}
if (hasCategory) {
  document.querySelector('.sort-field').hidden = true;
  search.placeholder = 'Search ' + selectedCategory + ' products…';
  document.querySelector('#empty-state p').textContent = 'Try another keyword to search this category.';
  document.getElementById('reset-filters').textContent = 'Clear search';
}
if (browsingProducts) {
document.getElementById('count-label').textContent = 'products to explore';
filters();
(snapshot ? Promise.resolve([snapshot.products]) : Promise.all(productCategories.filter(item => !hasCategory || item.name === selectedCategory).map(async ({name, slug}) => {
  const response = await fetch('data/categories/' + slug + '.json');
  if (!response.ok) throw new Error('Catalogue unavailable');
  const data = await response.json();
  return data.products.filter(p => p.published === true).map(p => ({...p, category: name}));
}))).then(groups => {
  products = groups.flat();
  document.getElementById('total-count').textContent = products.length;
  grid.setAttribute('aria-busy', 'false'); render();
}).catch(() => {
  grid.setAttribute('aria-busy', 'false');
  document.getElementById('result-count').textContent = 'Unable to load products';
  document.getElementById('load-error').hidden = false;
});

}
