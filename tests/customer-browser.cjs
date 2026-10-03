const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const users = new Map(), tokens = new Map(); let sequence = 0, writes = 0, failSave = false, profileWrites = 0;
  await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/customer/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.split('/').pop();
    const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'};
    if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
    const token = req.headers().authorization?.slice(7), user = users.get(tokens.get(token));
    let status = 200, data;
    if (['register', 'login'].includes(path)) {
      const fields = req.postDataJSON();
      if (path === 'register') users.set(fields.email, {username: fields.email, email: fields.email, fullName: fields.fullName, contactNo: fields.contactNo, dateOfBirth: fields.dateOfBirth, gender: fields.gender, shippingAddress: '', items: [], version: 0});
      if (fields.password === 'Wrong123!') {status = 401; data = {error: 'Gmail or password is incorrect.'};}
      else {const result = users.get(fields.email); const nextToken = (++sequence).toString(16).padStart(64, '0'); tokens.set(nextToken, fields.email); data = {...result, token: nextToken};}
    } else if (!user) {status = 401; data = {error: 'Please log in to use your cart.'};}
    else if (path === 'logout') {tokens.delete(token); data = {message: 'Logged out.'};}
    else if (path === 'profile' && req.method() === 'PUT') {profileWrites++; user.shippingAddress = req.postDataJSON().shippingAddress.trim(); data = {...user, message: 'Shipping address saved.'};}
    else if (req.method() === 'PUT') {
      writes++;
      if (failSave) {status = 500; data = {error: 'Unable to save your cart. Please try again.'};}
      else {const payload = req.postDataJSON(); assert.equal(payload.version, user.version); user.items = payload.items; user.version++; data = user;}
    } else data = user;
    return route.fulfill({status, json: data, headers: cors});
  });
  const count = n => page.waitForFunction(n => document.querySelector('[data-cart-count]').textContent === String(n), n);
  async function submit(email, register = false, password = 'Camera1!') {
    if (register) await page.locator('#customer-register-tab').click(); else await page.locator('#customer-login-tab').click();
    const form = page.locator(register ? '#customer-register-form' : '#customer-login-form');
    await form.locator('[name="email"]').fill(email); await form.locator('[name="password"]').fill(password);
    if (register) {await form.locator('[name="fullName"]').fill('Customer Test'); await form.locator('[name="contactNo"]').fill('01112345678'); await form.locator('[name="birthYear"]').selectOption('1995'); await form.locator('[name="birthMonth"]').selectOption('1'); await form.locator('[name="birthDay"]').selectOption('1'); await form.locator('[name="gender"]').selectOption('female');}
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
    await submit('customer.one@gmail.com', true); await count(1);
    assert.equal(writes, 1); assert.equal(users.get('customer.one@gmail.com').items[0].id, 'cctv-turret');
    await page.locator('[data-customer-account]').click();
    await page.getByText('01112345678', {exact: true}).waitFor();
    assert.equal(await page.locator('.customer-details').getByText('1995-01-01', {exact: true}).count(), 1);
    await page.locator('[name=shippingAddress]').fill('12 Jalan Test\n34000 Taiping, Perak');
    await page.getByRole('button', {name: 'Save shipping address', exact: true}).click();
    await page.getByText('Shipping address saved.', {exact: true}).waitFor(); await count(1);
    assert.equal(profileWrites, 1);
    await page.getByRole('button', {name: 'Save shipping address', exact: true}).click();
    assert.match(await page.locator('[name=shippingAddress]').evaluate(e => e.validationMessage), /modify at least one word/);
    assert.equal(profileWrites, 1);
    await page.locator('[name=shippingAddress]').fill('   ');
    await page.getByRole('button', {name: 'Save shipping address', exact: true}).click();
    assert.match(await page.locator('[name=shippingAddress]').evaluate(e => e.validationMessage), /enter your shipping address/);
    assert.equal(profileWrites, 1);
    await page.locator('[name=shippingAddress]').fill('15 Jalan Test\n34000 Taiping, Perak');
    await page.getByRole('button', {name: 'Save shipping address', exact: true}).click();
    await page.getByText('Shipping address saved.', {exact: true}).waitFor();
    assert.equal(profileWrites, 2);
    await page.screenshot({path: '.preview/customer-account-address.png'});
    await page.getByRole('button', {name: 'Close account window', exact: true}).click();
    await page.locator('[data-cart-open]').click(); await page.locator('.cart-item').waitFor();
    await page.getByRole('link', {name: 'View cart', exact: true}).click();
    await page.locator('[data-cart-page] .cart-item').waitFor(); await count(1);
    await page.locator('.cart-quantity button').last().click(); await count(2);
    await page.waitForFunction(() => document.querySelector('#cart-total').textContent.includes('1,332.00'));
    await page.locator('.cart-quantity button').first().click(); await count(1);
    await page.reload(); await page.locator('[data-cart-page] .cart-item').waitFor(); await count(1);
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: '.preview/full-cart-mobile.png'});
    await page.setViewportSize({width: 1440, height: 1000});
    await page.locator('[data-customer-account]').click();
    assert.equal(await page.locator('[name=shippingAddress]').inputValue(), '15 Jalan Test\n34000 Taiping, Perak');
    await page.getByRole('button', {name: 'Close account window', exact: true}).click();
    await page.goto('http://localhost:8080/index.html'); await count(1);
    await logout();
    await page.goto('http://localhost:8080/catalogue.html?category=CCTV%20Systems'); await page.locator('.product-card').nth(1).waitFor();
    await page.getByRole('button', {name: 'View 4-Camera CCTV Starter Package', exact: true}).click(); await page.locator('#detail-add-cart').click();
    await submit('customer.one@gmail.com', false, 'Wrong123!'); await page.getByText('Gmail or password is incorrect.', {exact: true}).waitFor();
    assert.equal(writes, 3);
    await submit('customer.one@gmail.com'); await count(2); assert.equal(writes, 4);
    await page.getByRole('button', {name: 'Close product details', exact: true}).click(); await logout();
    await page.locator('.product-add-cart').first().click(); await submit('customer.two@gmail.com', true); await count(1);
    assert.equal(users.get('customer.two@gmail.com').items.length, 1); assert.equal(users.get('customer.one@gmail.com').items.length, 2);
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
