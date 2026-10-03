const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let categories = JSON.parse(fs.readFileSync('data/categories.json')).categories, sha = 'a'.repeat(40);
  await page.route('**/data/categories.json', route => route.fulfill({json: {categories}}));
  await page.route('**/data/categories/smart-home.json', route => route.fulfill({json: {products: []}}));
  await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/staff/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'}});
    let data;
    if (path.endsWith('/login')) data = {token: 'b'.repeat(64), username: 'test_staff'};
    else if (path === '/staff/categories' && request.method() === 'POST') {
      assert.equal(request.postDataJSON().sha, sha);
      categories.push(request.postDataJSON().category); sha = 'c'.repeat(40);
      data = {categories, sha, message: 'Published to GitHub. The homepage and catalogue will update after deployment.'};
    } else if (request.method() === 'DELETE') {
      assert.equal(request.postDataJSON().sha, sha);
      categories = categories.filter(c => c.slug !== path.split('/').pop()); sha = 'd'.repeat(40);
      data = {categories, sha, message: 'Published to GitHub. The homepage and catalogue will update after deployment.'};
    } else if (path === '/staff/categories') data = {categories, sha};
    else data = {sha: 'e'.repeat(40), products: []};
    return route.fulfill({json: data, headers: {'Access-Control-Allow-Origin': '*'}});
  });
  try {
    await page.goto('http://localhost:8080/admin/');
    await page.locator('#login-username').fill('test_staff'); await page.locator('#login-password').fill('Camera1!');
    await page.locator('#staff-login').click(); await page.locator('#staff-categories button').nth(9).waitFor();
    await page.getByRole('button', {name: 'Add category +', exact: true}).click();
    await page.locator('#category-name').fill('Smart Home'); assert.equal(await page.locator('#category-slug').inputValue(), 'smart-home');
    await page.locator('#staff-category-form [name="description"]').fill('Connected devices for your home.');
    await page.getByRole('button', {name: 'Add & publish', exact: true}).click();
    await page.getByRole('heading', {name: 'Smart Home', exact: true}).waitFor();
    assert.equal(await page.locator('#staff-categories button').count(), 11);
    assert.equal(await page.locator('#add-staff-product').isDisabled(), false);
    await page.screenshot({path: '.preview/admin-categories.png', fullPage: true});
    const publicPage = await browser.newPage({viewport: {width: 390, height: 844}});
    await publicPage.route('**/data/categories.json', route => route.fulfill({json: {categories}}));
    await publicPage.goto('http://localhost:8080/index.html');
    await publicPage.locator('#services h3 a').filter({hasText: 'Smart Home'}).waitFor();
    assert.equal(await publicPage.locator('#services .service-card').count(), 11);
    assert.equal(await publicPage.locator('#service option[value="Smart Home"]').count(), 1);
    await publicPage.goto('http://localhost:8080/catalogue.html');
    await publicPage.locator('.catalogue-categories h3 a').filter({hasText: 'Smart Home'}).waitFor();
    assert.equal(await publicPage.locator('.catalogue-categories .service-card').count(), 11);
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: 'Remove category', exact: true}).click();
    await page.getByRole('heading', {name: 'CCTV Systems', exact: true}).waitFor();
    assert.equal(await page.locator('#staff-categories button').count(), 10);
    await publicPage.goto('http://localhost:8080/index.html'); await publicPage.waitForFunction(() => document.querySelectorAll('#services .service-card').length === 10);
    assert.equal(await publicPage.locator('#services h3').filter({hasText: 'Smart Home'}).count(), 0);
    await publicPage.goto('http://localhost:8080/catalogue.html?category=Smart%20Home');
    await publicPage.waitForFunction(() => document.querySelectorAll('.catalogue-categories .service-card').length === 10);
    assert.equal(await publicPage.locator('#product-browser').isVisible(), false);
    assert.match(await publicPage.locator('#catalogue-page-description').textContent(), /no longer available/);
    // Removing the final category leaves an actionable empty staff workspace.
    categories = [categories[0]]; await page.reload();
    await page.locator('#login-username').fill('test_staff'); await page.locator('#login-password').fill('Camera1!'); await page.locator('#staff-login').click();
    await page.getByRole('heading', {name: 'CCTV Systems', exact: true}).waitFor();
    await page.getByRole('button', {name: 'Remove category', exact: true}).click();
    await page.getByRole('heading', {name: 'No categories yet', exact: true}).waitFor();
    assert.equal(await page.locator('#add-staff-product').isDisabled(), true);
    assert.equal(await page.getByRole('button', {name: 'Add category +', exact: true}).isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log('Admin add/remove, generated ID, new category product editing, homepage/catalogue synchronization, removed links, mobile and empty categories passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
