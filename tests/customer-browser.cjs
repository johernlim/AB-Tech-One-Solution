const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const users = new Map(), tokens = new Map(); let sequence = 0, writes = 0, failSave = false;
  await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/customer/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.split('/').pop();
    const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'};
    if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
    const token = req.headers().authorization?.slice(7), user = users.get(tokens.get(token));
    let status = 200, data;
    if (['register', 'login'].includes(path)) {
      const fields = req.postDataJSON();
      if (path === 'register') users.set(fields.username, {username: fields.username, items: [], version: 0});
      if (fields.password === 'Wrong123!') {status = 401; data = {error: 'Username or password is incorrect.'};}
      else {const result = users.get(fields.username); const nextToken = (++sequence).toString(16).padStart(64, '0'); tokens.set(nextToken, fields.username); data = {...result, token: nextToken};}
    } else if (!user) {status = 401; data = {error: 'Please log in to use your cart.'};}
    else if (path === 'logout') {tokens.delete(token); data = {message: 'Logged out.'};}
    else if (req.method() === 'PUT') {
      writes++;
      if (failSave) {status = 500; data = {error: 'Unable to save your cart. Please try again.'};}
      else {const payload = req.postDataJSON(); assert.equal(payload.version, user.version); user.items = payload.items; user.version++; data = user;}
    } else data = user;
    return route.fulfill({status, json: data, headers: cors});
  });
  const count = n => page.waitForFunction(n => document.querySelector('[data-cart-count]').textContent === String(n), n);
  async function submit(username, register = false, password = 'Camera1!') {
    if (register) await page.locator('#customer-register-tab').click(); else await page.locator('#customer-login-tab').click();
    const form = page.locator(register ? '#customer-register-form' : '#customer-login-form');
    await form.locator('[name="username"]').fill(username); await form.locator('[name="password"]').fill(password);
    if (register) await form.locator('[name="confirmPassword"]').fill(password);
    await form.locator('.customer-submit').click();
  }
  async function logout() {await page.locator('[data-customer-account]').click(); await page.locator('#customer-logout').click(); await count(0);}
  try {
    await page.goto('http://localhost:8080/index.html');
    assert.equal(await page.getByRole('link', {name: 'Shop ↗', exact: true}).count(), 0);
    const rects = await page.locator('.header-row').evaluate(row => ({cart: row.querySelector('[data-cart-open]').getBoundingClientRect().right, header: row.getBoundingClientRect().right}));
    assert.ok(Math.abs(rects.cart - rects.header) < 2);
    await page.goto('http://localhost:8080/catalogue.html?view=all');
    await page.locator('.product-card').nth(11).waitFor();
    assert.equal(await page.locator('.catalogue-nav').getByRole('link', {name: 'Services', exact: true}).count(), 0);
    await page.locator('.product-add-cart').first().click(); await page.locator('.customer-dialog').waitFor();
    assert.equal(writes, 0); await count(0);
    await page.getByRole('button', {name: 'Close account window', exact: true}).click();
    await page.locator('.product-add-cart').first().click();
    await submit('customer_one', true); await count(1);
    assert.equal(writes, 1); assert.equal(users.get('customer_one').items[0].id, 'cctv-turret');
    await page.goto('http://localhost:8080/index.html'); await count(1);
    await logout();
    await page.goto('http://localhost:8080/catalogue.html?category=CCTV%20Systems'); await page.locator('.product-card').nth(1).waitFor();
    await page.getByRole('button', {name: 'View 4-Camera CCTV Starter Package', exact: true}).click(); await page.locator('#detail-add-cart').click();
    await submit('customer_one', false, 'Wrong123!'); await page.getByText('Username or password is incorrect.', {exact: true}).waitFor();
    assert.equal(writes, 1);
    await submit('customer_one'); await count(2); assert.equal(writes, 2);
    await page.getByRole('button', {name: 'Close product details', exact: true}).click(); await logout();
    await page.locator('.product-add-cart').first().click(); await submit('customer_two', true); await count(1);
    assert.equal(users.get('customer_two').items.length, 1); assert.equal(users.get('customer_one').items.length, 2);
    failSave = true; await page.locator('.product-add-cart').first().click(); await page.getByText('Unable to save your cart. Please try again.', {exact: true}).waitFor(); await count(1);
    failSave = false;
    await page.setViewportSize({width: 390, height: 844}); await logout();
    await page.locator('.product-add-cart').first().click(); await page.screenshot({path: '.preview/customer-login-mobile.png'});
    assert.equal(await page.locator('.customer-dialog').evaluate(e => e.scrollWidth <= e.clientWidth), true);
    await page.getByRole('button', {name: 'Close account window', exact: true}).click();
    assert.deepEqual(errors, []);
    console.log('Guest browsing, login gating, cancelled pending add, auto-add after signup/login, failed login, account cart isolation, persistence, failed save, header position and mobile account form passed.');
  } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode = 1;});
