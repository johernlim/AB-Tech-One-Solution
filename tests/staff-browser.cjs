const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let registered = false, products = [], saved, uploaded = false;
  try {
    await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/staff/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let status = 200, data;
      if (request.method() === 'OPTIONS') {await route.fulfill({status: 204, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'}}); return;}
      if (path.endsWith('/status')) data = {configured: true, missing: []};
      else if (path.endsWith('/register')) {
        if (registered) {status = 409; data = {error: 'That username is already taken. Choose another username.'};}
        else {registered = true; data = {message: 'Account created. You can now log in.'};}
      } else if (path.endsWith('/login')) {
        if (request.postDataJSON().password === 'this is the wrong password') {status = 401; data = {error: 'Username or password is incorrect.'};}
        else data = {token: 'a'.repeat(64), username: 'staff_test'};
      } else if (path.endsWith('/logout')) data = {message: 'Logged out.'};
      else if (path.endsWith('/upload')) {uploaded = true; data = {path: 'assets/products/cctv.svg'};}
      else if (request.method() === 'PUT') {saved = request.postDataJSON(); products = saved.products; data = {sha: 'b'.repeat(40), message: 'Published to GitHub.'};}
      else data = {sha: 'a'.repeat(40), products};
      await route.fulfill({status, json: data, headers: {'Access-Control-Allow-Origin': '*'}});
    });
    await page.goto('http://localhost:8080/admin/');
    await page.waitForFunction(() => !document.getElementById('staff-login').disabled);
    await page.screenshot({path: '.preview/staff-login-ready.png', fullPage: true});
    await page.getByRole('tab', {name: 'Create account'}).click();
    await page.locator('#register-username').fill('staff_test');
    await page.locator('#register-password').fill('Camera12');
    assert.equal(await page.locator('#register-password').evaluate(input => input.validity.customError), true);
    await page.locator('#register-password').fill('Camera1!');
    await page.locator('#confirm-password').fill('a different passphrase 123');
    await page.locator('#invitation-code').fill('invitation-for-trusted-staff');
    await page.locator('#staff-register').click();
    assert.equal(await page.locator('#confirm-password').evaluate(input => input.validity.customError), true);
    await page.locator('#confirm-password').fill('Camera1!');
    await page.locator('#staff-register').click();
    await page.getByText('Account created. You can now log in.', {exact: true}).waitFor();
    await page.getByRole('tab', {name: 'Create account'}).click();
    await page.locator('#register-username').fill('STAFF_TEST');
    await page.locator('#register-password').fill('Camera1!');
    await page.locator('#confirm-password').fill('Camera1!');
    await page.locator('#invitation-code').fill('invitation-for-trusted-staff');
    await page.locator('#staff-register').click();
    await page.getByText('That username is already taken. Choose another username.', {exact: true}).waitFor();
    await page.screenshot({path: '.preview/staff-register.png', fullPage: true});
    await page.getByRole('tab', {name: 'Login', exact: true}).click();
    await page.locator('#login-password').fill('this is the wrong password');
    await page.locator('#staff-login').click();
    await page.getByText('Username or password is incorrect.', {exact: true}).waitFor();
    await page.locator('#login-password').fill('Camera1!');
    await page.locator('#staff-login').click();
    await page.getByRole('button', {name: 'Add product +'}).waitFor();
    await page.getByRole('button', {name: 'Add product +'}).click();
    const form = page.locator('#staff-product-form');
    await form.locator('[name="id"]').fill('test-camera');
    await form.locator('[name="name"]').fill('Test camera');
    await form.locator('[name="description"]').fill('A test camera description.');
    await page.locator('#staff-photo').setInputFiles({name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6kAAAAASUVORK5CYII=', 'base64')});
    await page.getByText('Photo uploaded. Save the product to display it in the catalogue.', {exact: true}).waitFor();
    assert.equal(uploaded, true);
    await page.getByRole('button', {name: 'Save & publish'}).click();
    await page.locator('.staff-product').waitFor();
    assert.equal(saved.products[0].category, 'CCTV Systems');
    assert.equal(saved.products[0].published, false);
    assert.equal(saved.products[0].image, 'assets/products/cctv.svg');
    await page.getByRole('button', {name: 'Edit product', exact: true}).click();
    await form.locator('[name="price"]').fill('199.50');
    await page.getByRole('button', {name: 'Save & publish'}).click();
    await page.waitForFunction(() => !document.getElementById('staff-product-dialog').open);
    assert.equal(saved.products[0].price, 199.5);
    await page.screenshot({path: '.preview/staff-workspace.png', fullPage: true});
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: 'Delete', exact: true}).click();
    await page.getByText('No products yet. Add the first product in this category.', {exact: true}).waitFor();
    assert.deepEqual(saved.products, []);
    await page.getByRole('button', {name: 'Log out', exact: true}).click();
    await page.getByText('You have logged out.', {exact: true}).waitFor();
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: '.preview/staff-login-mobile.png', fullPage: true});
    assert.deepEqual(errors, []);
    console.log('Staff login, password confirmation, duplicate usernames, category CRUD, photo upload, logout and mobile layout checks passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
