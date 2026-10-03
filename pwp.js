// Shared PWP rules. Product keys stay compatible with existing saved carts.
export const PWP_CATEGORY = 'PWP Products';
export const productKey = product => product.category + ':' + product.id;
export const cents = value => Math.round(Number(value) * 100);
export function activeOffer(offer) {
  return offer.enabled === true;
}
export function pwpChoices(items, catalogue, offers) {
  const choices = new Map();
  for (const offer of offers) {
    if (!activeOffer(offer)) continue;
    const qualifyingQuantity = items.reduce((sum, item) => sum + (offer.qualifiers.includes(productKey(item)) && catalogue.has(productKey(item)) && item.category !== PWP_CATEGORY ? item.quantity : 0), 0);
    if (!qualifyingQuantity) continue;
    for (const addon of offer.addons) {
      const product = catalogue.get(addon.key);
      if (!product || product.category !== PWP_CATEGORY || product.price_mode !== 'fixed' || !Number.isFinite(addon.price) || addon.price <= 0 || cents(addon.price) >= cents(product.price)) continue;
      const choice = {product, price: addon.price, limit: Math.min(999, qualifyingQuantity * offer.limit), offerName: offer.name};
      const previous = choices.get(addon.key);
      // Offers do not stack. Select the cheapest valid offer (then largest allowance).
      if (!previous || cents(choice.price) < cents(previous.price) || cents(choice.price) === cents(previous.price) && choice.limit > previous.limit) choices.set(addon.key, choice);
    }
  }
  return choices;
}
export function pwpLine(item, product, choices) {
  const normal = cents(product.price), choice = choices.get(productKey(item));
  const discountedQuantity = choice ? Math.min(item.quantity, choice.limit) : 0;
  const total = discountedQuantity * cents(choice?.price || 0) + (item.quantity - discountedQuantity) * normal;
  return {total, saving: normal * item.quantity - total, discountedQuantity, choice};
}
export async function loadPwpOffers() {
  const response = await fetch(new URL('data/pwp-offers.json', import.meta.url), {cache: 'no-store'});
  if (!response.ok) throw new Error('Unable to load PWP offers. Please refresh and try again.');
  const data = await response.json();
  if (!Array.isArray(data.offers)) throw new Error('Unable to load PWP offers.');
  return data.offers;
}
