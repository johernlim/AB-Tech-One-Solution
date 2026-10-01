import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
import {productCategories} from '../product-categories.js';
const groups = await Promise.all(productCategories.map(async ({name, slug}) => {
  const data = JSON.parse(await readFile(new URL('data/categories/' + slug + '.json', root), 'utf8'));
  assert.ok(data.products.every(product => product.category === name));
  return data.products;
}));
const data = {products: groups.flat()};
const categories = ['CCTV Systems', 'Alarm Systems', 'Door Access Control', 'Computers & Laptops', 'POS Systems', 'Network Infrastructure', 'WiFi Solutions', 'Server Solutions', 'Software Solutions', 'Digital Signage'];

test('Examples cover all categories, have unique IDs, safe images and explicit example labelling', async () => {
  assert.equal(data.products.length, 12);
  assert.equal(new Set(data.products.map(p => p.id)).size, data.products.length);
  assert.deepEqual(new Set(data.products.map(p => p.category)), new Set(categories));
  for (const product of data.products) {
    assert.equal(product.example, true);
    assert.equal(product.published, true);
    assert.ok(product.name && product.description && product.installation && product.availability);
    assert.ok(product.price >= 0 && Number.isFinite(product.price));
    assert.ok(['fixed', 'from', 'quote'].includes(product.price_mode));
    assert.match(product.image, /^assets\/products\/[\w-]+\.svg$/);
    await access(fileURLToPath(new URL(product.image, root)));
    assert.match(await readFile(new URL(product.image, root), 'utf8'), /EXAMPLE/);
  }
});

test('Every homepage service links to its catalogue category', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const category of categories) assert.ok(html.includes('catalogue.html?category=' + encodeURIComponent(category).replaceAll("'", '%27')));
});

test('Live authentication uses the production Worker', async () => {
  const settings = JSON.parse(await readFile(new URL('admin/settings.json', root), 'utf8'));
  assert.equal(settings.repo, 'johernlim/AB-Tech-One-Solution');
  assert.equal(settings.auth_base_url, 'https://ab-tech-catalogue-auth.johern20154.workers.dev');
});
