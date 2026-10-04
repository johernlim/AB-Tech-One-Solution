import {promotionFor} from './promotions.js';
import {activeOffer, productKey, PWP_CATEGORY} from './pwp.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR',minimumFractionDigits:0,maximumFractionDigits:2});
const exact = new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR',minimumFractionDigits:2,maximumFractionDigits:2});
function imagePath(path) {const clean=String(path||'').replace(/^\/+/, '');return /^assets\/[a-zA-Z0-9_./ -]+$/.test(clean)&&!clean.split('/').includes('..')?clean:'assets/products/cctv.svg';}
export function productMarkup(product,index,promotions,offers,now=new Date()) {
  const offer=promotionFor(product,promotions,now);
  const price=offer?exact.format(offer.price):product.price_mode==='quote'?'Request a quote':(product.price_mode==='from'?'From ':'')+money.format(product.price);
  const pwp=product.category===PWP_CATEGORY||offers.some(o=>activeOffer(o)&&o.qualifiers.includes(productKey(product)));
  return `<article class="product-card"><button type="button" class="product-image-button" aria-label="View ${escape(product.name)}"><img src="${escape(imagePath(product.image))}" alt="${escape(product.name)}" width="640" height="440" loading="${index<3?'eager':'lazy'}">${(product.new_arrival??product.example)?'<span class="sample-badge">NEW ARRIVAL</span>':''}${pwp?'<span class="product-pwp-badge">PWP</span>':''}</button><div class="product-card-copy"><span class="product-category">${escape(product.category)}</span><h3><button type="button" class="product-title-button">${escape(product.name)}</button></h3><p class="product-model">${escape(product.description)}</p><div class="product-card-bottom"><div class="product-price">${offer?`<div class="promotion-original"><del>${exact.format(product.price)}</del><span class="promotion-badge">${escape(offer.label)}</span></div>`:''}<span>${escape(price)}</span>${offer?`<small class="promotion-saving">Save ${exact.format(product.price-offer.price)}</small><small class="promotion-period">${escape(offer.start)} – ${escape(offer.end)}</small>`:''}<small>${escape(product.example?'Illustrative price':product.availability)}</small></div><button type="button">View details ↗</button></div><button type="button" class="button product-add-cart" aria-label="Add ${escape(product.name)} to cart">Add to cart</button></div></article>`;
}
export function renderCatalogue(template,snapshot,selected,now=new Date()) {
  const title=selected?.name||'All products', products=snapshot.products;
  const content=(id,text)=>{const re=new RegExp('(<([a-z0-9]+)[^>]* id="'+id+'"[^>]*>)[\\s\\S]*?(</\\2>)');template=template.replace(re,(_,open,tag,close)=>open+escape(text)+close);};
  template=template.replace('<html lang="en">','<html lang="en" data-server-catalogue="true">');
  template=template.replace('<title>Product Catalogue | AB Tech One Solution</title>',`<title>${escape(title)} | AB Tech One Solution</title>`);
  content('catalogue-page-title',title);content('category-title',title);content('catalogue-page-description',selected?.description||'Explore all our products, or choose a category below.');
  content('total-count',products.length);content('count-label','products to explore');content('result-count',`${products.length} product${products.length===1?'':'s'}`);
  template=template.replace('<div id="category-landing">','<div id="category-landing" hidden>').replace('<div id="product-browser" hidden>','<div id="product-browser">');
  template=template.replace('<div id="products" class="products-grid" aria-busy="true"></div>',`<div id="products" class="products-grid" aria-busy="false">${products.map((p,i)=>productMarkup(p,i,snapshot.promotions,snapshot.offers,now)).join('')}</div>`);
  if(selected)template=template.replace('class="sort-field"','class="sort-field" hidden').replace('placeholder="Try camera, WiFi or laptop…"',`placeholder="Search ${escape(title)} products…"`);
  if(!products.length)template=template.replace('id="empty-state" class="empty-state" hidden','id="empty-state" class="empty-state"');
  const json=JSON.stringify(snapshot).replace(/</g,'\\u003c');
  return template.replace('</head>',`<script id="catalogue-snapshot" type="application/json">${json}</script></head>`);
}
