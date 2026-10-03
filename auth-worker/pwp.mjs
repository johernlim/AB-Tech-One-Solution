import {readCategories} from './categories.mjs';
import {PWP_CATEGORY, productKey, cents} from '../pwp.js';
const path = 'data/pwp-offers.json';
const encode = text => {
  const bytes = new TextEncoder().encode(text), parts = [];
  for (let i = 0; i < bytes.length; i += 16384) parts.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return btoa(parts.join(''));
};
const decode = content => new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0)));
function github(env, file, options = {}) {
  return fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/contents/' + file, {...options, headers: {Authorization: 'Bearer ' + env.GITHUB_CATALOGUE_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'AB-Tech-Staff', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'}});
}
export async function readPwp(env) {
  const response = await github(env, path + '?ref=main');
  if (!response.ok) throw new Error('Could not load PWP offers.');
  const file = await response.json();
  return {sha: file.sha, offers: JSON.parse(decode(file.content)).offers};
}
export async function pwpCatalogue(env, ref = 'main') {
  const {categories} = await readCategories(env, ref);
  const groups = await Promise.all(categories.map(async category => {
    const response = await github(env, 'data/categories/' + category.slug + '.json?ref=' + encodeURIComponent(ref));
    if (!response.ok) throw new Error('Could not load products for PWP.');
    const file = await response.json();
    return JSON.parse(decode(file.content)).products.filter(p => p.published).map(p => ({...p, category: category.name}));
  }));
  return groups.flat();
}
const validDate = value => value === '' || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function validateOffers(offers, products) {
  if (!Array.isArray(offers) || offers.length > 50) return false;
  const catalogue = new Map(products.map(p => [productKey(p), p])), ids = new Set();
  return offers.every(o => {
    if (!o || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(o.id || '') || o.id.length > 80 || ids.has(o.id)) return false;
    ids.add(o.id);
    if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 100 || typeof o.enabled !== 'boolean' || !Number.isInteger(o.limit) || o.limit < 1 || o.limit > 99 || !validDate(o.start) || !validDate(o.end) || o.start && o.end && o.end < o.start) return false;
    if (!Array.isArray(o.qualifiers) || !o.qualifiers.length || o.qualifiers.length > 100 || new Set(o.qualifiers).size !== o.qualifiers.length || !o.qualifiers.every(key => catalogue.has(key) && catalogue.get(key).category !== PWP_CATEGORY)) return false;
    if (!Array.isArray(o.addons) || !o.addons.length || o.addons.length > 100 || new Set(o.addons.map(a => a?.key)).size !== o.addons.length) return false;
    return o.addons.every(a => {
      const p = catalogue.get(a?.key);
      return p?.category === PWP_CATEGORY && p.price_mode === 'fixed' && Number.isFinite(a.price) && a.price > 0 && cents(a.price) < cents(p.price) && Math.abs(a.price * 100 - cents(a.price)) < 0.00001;
    });
  });
}
export async function publishPwp(env, user, data) {
  const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store'}});
  if (!/^[a-f0-9]{40}$/.test(data.sha || '')) return json({error: 'Reload PWP offers before publishing.'}, 400);
  // Pin validation to one repository snapshot, even if products change during the reads.
  const headResponse = await fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/git/ref/heads/main', {headers: {Authorization: 'Bearer ' + env.GITHUB_CATALOGUE_TOKEN, 'User-Agent': 'AB-Tech-Staff'}});
  if (!headResponse.ok) return json({error: 'Could not check current products.'}, 502);
  const head = (await headResponse.json()).object.sha;
  const products = await pwpCatalogue(env, head);
  if (!validateOffers(data.offers, products)) return json({error: 'Choose visible qualifying products and add-ons from PWP Products. Each PWP price must be lower than its fixed normal price. Check dates, limits and unique offer IDs.'}, 400);
  const offers = data.offers.map(({id, name, qualifiers, addons, limit, start, end, enabled}) => ({id, name: name.trim(), qualifiers, addons: addons.map(({key, price}) => ({key, price})), limit, start, end, enabled}));
  const response = await github(env, path, {method: 'PUT', body: JSON.stringify({branch: 'main', sha: data.sha, message: 'Update PWP offers by ' + user.username, content: encode(JSON.stringify({offers}, null, 2) + '\n')})});
  if ([409, 422].includes(response.status)) return json({error: 'PWP offers changed. Reload before publishing.'}, 409);
  if (!response.ok) return json({error: 'Could not publish PWP offers. Please try again.'}, 502);
  return json({sha: (await response.json()).content.sha, offers, message: 'Published to GitHub. PWP offers will update after deployment.'});
}
