import {normalizeShippingAddress} from './customer-validation.js';
export const malaysiaStates = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu'];
export const federalTerritories = ['Kuala Lumpur', 'Labuan', 'Putrajaya'];
export const addressKeys = ['street', 'city', 'state', 'postcode', 'country'];
export const normalizeAddressFields = fields => Object.fromEntries(addressKeys.map(key => [key, normalizeShippingAddress(fields?.[key])]));
export const formatAddress = fields => `${fields.street}\n${fields.postcode} ${fields.city}\n${fields.state}\n${fields.country}`;
export function parseAddressFields(value) {try {return value ? JSON.parse(value) : null;} catch {return null;}}
export function addressFieldsError(fields, saved) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {field: 'street', error: 'Please enter your shipping address before saving.'};
  for (const [field, label, max] of [['street', 'street address', 500], ['city', 'city', 80], ['state', 'state', 80], ['postcode', 'postcode', 5], ['country', 'country', 30]]) {
    const value = fields[field];
    if (typeof value !== 'string' || !value.trim()) return {field, error: `Please enter your ${label} before saving.`};
    if (value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (field !== 'street' && /[\r\n\t]/.test(value))) return {field, error: `Please check your ${label}.`};
  }
  const address = normalizeAddressFields(fields);
  if (![...malaysiaStates, ...federalTerritories].includes(address.state)) return {field: 'state', error: 'Please choose a Malaysian state or federal territory.'};
  if (!/^[0-9]{5}$/.test(address.postcode)) return {field: 'postcode', error: 'Please enter a 5-digit Malaysian postcode.'};
  if (address.country !== 'Malaysia') return {field: 'country', error: 'Country must be Malaysia.'};
  if (saved && addressKeys.every(key => address[key].replace(/\s+/g, ' ') === normalizeShippingAddress(saved[key]).replace(/\s+/g, ' '))) return {field: 'street', error: 'Please modify at least one word before saving.'};
  return null;
}
export const shippingInputs = `<fieldset class="shipping-fields"><legend>Shipping address</legend><label>Street Address<textarea name="street" autocomplete="shipping street-address" maxlength="500" rows="2" placeholder="House / unit number and street"></textarea></label><div class="shipping-row"><label>City<input name="city" autocomplete="shipping address-level2" maxlength="80" placeholder="City"></label><label>State<select name="state" autocomplete="shipping address-level1"><option value="">Choose state</option><optgroup label="States">${malaysiaStates.map(state => `<option>${state}</option>`).join('')}</optgroup><optgroup label="Federal territories">${federalTerritories.map(state => `<option>${state}</option>`).join('')}</optgroup></select></label><label>Postcode<input name="postcode" autocomplete="shipping postal-code" inputmode="numeric" maxlength="5" placeholder="Postcode"></label><label>Country<input name="country" autocomplete="shipping country-name" value="Malaysia" readonly></label></div></fieldset>`;
