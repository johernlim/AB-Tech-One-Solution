import {PWP_CATEGORY, productKey, activeOffer} from '../pwp.js?v=pwp-no-dates-1';
export function setupPwpAdmin(api, isBusy, setBusy) {
  const content = document.querySelector('.staff-content'), productPane = document.createElement('div');
  productPane.append(...content.children); content.append(productPane);
  const pane = document.createElement('section'); pane.hidden = true; pane.className = 'pwp-admin';
  pane.innerHTML = `<div class="staff-content-heading"><div><span class="eyebrow">Staff workspace</span><h2>PWP offers</h2></div><button type="button" class="button" data-new-offer>Add offer +</button></div><p class="field-help">Add products to PWP Products first. Select several qualifying products and several add-ons, with a separate price for each add-on.</p><p class="account-message" role="status" data-pwp-status></p><div data-offer-list></div><form data-offer-form hidden><h3 data-offer-heading>Add PWP offer</h3><div class="product-fields"><label>Offer ID<input name="id" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*"></label><label>Offer name<input name="name" required maxlength="100"></label><fieldset class="full-field pwp-picker"><legend>Qualifying products — choose one or more</legend><p class="field-help">Any selected product in the cart unlocks this offer.</p><div data-qualifiers></div></fieldset><fieldset class="full-field pwp-picker"><legend>Add-on products — PWP Products only</legend><p class="field-help">Choose one or more. Enter a special price lower than each product’s normal price.</p><div data-addons></div></fieldset><label>Discounted quantity of each add-on per qualifying product<input name="limit" type="number" min="1" max="99" required value="1"><small>For example: limit 1 × 2 qualifying products = 2 discounted units of each add-on. Extra units use the normal price.</small></label><label class="checkbox-field"><input name="enabled" type="checkbox" checked>Offer active</label></div><p class="account-message" role="status" data-offer-message></p><div class="product-form-actions"><button class="button" data-save-offer>Save &amp; publish</button><button type="button" class="button secondary" data-cancel-offer>Cancel</button></div></form>`;
  content.append(pane);
  const $ = selector => pane.querySelector(selector), form = $('[data-offer-form]');
  let offers = [], products = [], sha, editing = -1;
  function notice(text, error = false) {$('[data-pwp-status]').textContent = text; $('[data-pwp-status]').dataset.error = String(error);}
  const node = (tag, text, className) => {const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e;};
  const money = value => new Intl.NumberFormat('en-MY', {style:'currency', currency:'MYR'}).format(value);
  function list() {
    const container = $('[data-offer-list]'); container.replaceChildren();
    if (!offers.length) container.append(node('p', 'No PWP offers yet. Add products to PWP Products, then create an offer.', 'field-help'));
    offers.forEach((offer, index) => {
      const row = node('article', undefined, 'pwp-offer-card'), copy = node('div');
      copy.append(node('h3', offer.name), node('p', `${offer.qualifiers.length} qualifying products · ${offer.addons.length} add-ons · ${activeOffer(offer) ? 'Active' : 'Paused'}`, 'field-help'));
      const actions = node('div', undefined, 'staff-product-actions'), edit = node('button', 'Edit offer'), remove = node('button', 'Delete');
      edit.type = remove.type = 'button'; edit.onclick = () => editOffer(index);
      remove.onclick = async () => {
        if (isBusy() || !confirm('Delete ' + offer.name + ' and publish this change?')) return;
        setBusy(true);
        try {await publish(offers.filter((_, i) => i !== index)); form.hidden = true;} catch (e) {notice(e.message, true);} finally {setBusy(false);}
      };
      actions.append(edit, remove); row.append(copy, actions); container.append(row);
    });
  }
  async function publish(next) {
    const result = await api('pwp', {method:'PUT', body:JSON.stringify({sha, offers:next})});
    sha = result.sha; offers = result.offers; list(); notice(result.message);
  }
  function editOffer(index) {
    if (isBusy() || !sha) return;
    editing = index; form.reset(); const offer = offers[index];
    for (const key of ['id','name','limit']) form.elements[key].value = offer?.[key] ?? (key === 'limit' ? 1 : '');
    form.elements.id.readOnly = Boolean(offer); form.elements.enabled.checked = offer?.enabled ?? true;
    $('[data-offer-heading]').textContent = offer ? 'Edit PWP offer' : 'Add PWP offer'; $('[data-offer-message]').textContent = '';
    $('[data-qualifiers]').replaceChildren(); $('[data-addons]').replaceChildren();
    products.forEach(product => {
      const key = productKey(product), addon = product.category === PWP_CATEGORY;
      if (addon && (product.price_mode !== 'fixed' || Math.round(product.price * 100) <= 1)) return;
      const row = node('div', undefined, 'pwp-choice'), label = node('label', undefined, 'checkbox-field'), check = node('input');
      check.type = 'checkbox'; check.value = key; check.name = addon ? 'addon' : 'qualifier';
      check.checked = addon ? Boolean(offer?.addons.some(a => a.key === key)) : Boolean(offer?.qualifiers.includes(key));
      label.append(check, node('span', product.name + ' · ' + (addon ? money(product.price) : product.category))); row.append(label);
      if (addon) {
        const priceLabel = node('label', 'PWP price (RM)', 'pwp-addon-price'), input = node('input');
        input.type = 'number'; input.min = '0.01'; input.max = ((Math.round(product.price * 100) - 1) / 100).toFixed(2); input.step = '0.01'; input.required = true;
        input.dataset.key = key; input.value = offer?.addons.find(a => a.key === key)?.price ?? ''; input.disabled = !check.checked;
        check.onchange = () => {input.disabled = !check.checked;}; priceLabel.append(input); row.append(priceLabel);
      }
      $(addon ? '[data-addons]' : '[data-qualifiers]').append(row);
    });
    if (!$('[data-addons]').children.length) $('[data-addons]').append(node('p', 'No eligible add-ons yet. Add a visible product with a positive fixed price in PWP Products.', 'field-help'));
    if (!$('[data-qualifiers]').children.length) $('[data-qualifiers]').append(node('p', 'No visible qualifying products yet.', 'field-help'));
    form.hidden = false; form.elements.id.focus();
  }
  form.elements.name.oninput = () => {if (!offers[editing] && !form.elements.id.dataset.edited) form.elements.id.value = form.elements.name.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);};
  form.elements.id.oninput = () => form.elements.id.dataset.edited = 'true'; form.addEventListener('reset', () => delete form.elements.id.dataset.edited);
  form.onsubmit = async event => {
    event.preventDefault(); if (isBusy()) return;
    const qualifiers = [...form.querySelectorAll('[name="qualifier"]:checked')].map(e => e.value);
    const addons = [...form.querySelectorAll('[name="addon"]:checked')].map(e => ({key:e.value, price:Number([...form.querySelectorAll('[data-key]')].find(input => input.dataset.key === e.value).value)}));
    if (!qualifiers.length || !addons.length) {$('[data-offer-message]').textContent = 'Select at least one qualifying product and one PWP add-on.'; return;}
    const offer = {id:form.elements.id.value.trim(), name:form.elements.name.value.trim(), qualifiers, addons, limit:Number(form.elements.limit.value), enabled:form.elements.enabled.checked, start:'', end:''};
    const next = offers.slice(); if (editing < 0) next.push(offer); else next[editing] = offer;
    setBusy(true); $('[data-save-offer]').disabled = true; $('[data-offer-message]').textContent = 'Publishing PWP offer…';
    try {await publish(next); form.hidden = true;} catch (e) {$('[data-offer-message]').textContent = e.message;} finally {setBusy(false); $('[data-save-offer]').disabled = false;}
  };
  $('[data-new-offer]').onclick = () => editOffer(-1); $('[data-cancel-offer]').onclick = () => {if (!isBusy()) form.hidden = true;};
  document.getElementById('staff-pwp-open').onclick = async () => {
    if (isBusy()) return;
    productPane.hidden = true; pane.hidden = false; form.hidden = true;
    document.getElementById('staff-categories').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed','false'));
    document.getElementById('staff-pwp-open').setAttribute('aria-pressed','true');
    setBusy(true); notice('Loading PWP offers and products…'); $('[data-new-offer]').disabled = true;
    try {const data = await api('pwp'); offers = data.offers; products = data.products; sha = data.sha; list(); notice('');} catch (e) {sha = null; notice(e.message,true);} finally {setBusy(false); $('[data-new-offer]').disabled = !sha;}
  };
  return {showProducts() {productPane.hidden = false; pane.hidden = true; document.getElementById('staff-pwp-open').setAttribute('aria-pressed','false');}, reset() {offers=[]; products=[]; sha=null; form.reset(); form.hidden=true; pane.hidden=true; productPane.hidden=false; $('[data-offer-list]').replaceChildren();}};
}
