const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  try {
    await page.goto('http://localhost:8080/admin/?demo=1');
    await page.getByRole('button',{name:'Login',exact:true}).click();
    await page.getByText('Products',{exact:true}).first().click();
    await page.getByText('4MP Indoor Turret Camera — CCTV Systems',{exact:true}).waitFor();
    const first = page.getByText('4MP Indoor Turret Camera — CCTV Systems',{exact:true}).locator('..');
    await first.locator('button').first().click();
    await page.getByLabel('Product name',{exact:true}).first().fill('Demo Edited Camera');
    await page.getByLabel('Price (RM)',{exact:true}).first().fill('299.50');
    await page.getByRole('button',{name:'Publish',exact:true}).click();
    await page.getByText('Publish now',{exact:true}).click();
    await page.getByRole('button',{name:'Published',exact:true}).waitFor();
    const saved = await page.evaluate(()=>JSON.parse(window.repoFiles.data['products.json'].content));
    assert.equal(saved.products[0].name,'Demo Edited Camera');
    assert.equal(saved.products[0].price,299.5);
    assert.equal(await page.locator('#nc-root img').evaluateAll(nodes=>nodes.every(n=>n.complete&&n.naturalWidth>0)),true);
    await page.getByRole('button',{name:'Add product',exact:true}).click();
    await page.getByText('13 products',{exact:true}).waitFor();
    // Remove the unsaved new entry using the list item's remove control.
    const last = page.locator('[class*="SortableListItem"]').last();
    await last.locator(':scope > div').first().locator('button').nth(1).click();
    await page.getByText('12 products',{exact:true}).waitFor();
    // Remove a real example in the demo, then publish to its in-memory repo.
    const existing = page.getByText('4-Camera CCTV Starter Package — CCTV Systems',{exact:true}).locator('..');
    await existing.locator(':scope > div').first().locator('button').nth(1).click();
    await page.getByText('11 products',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Publish',exact:true}).click();
    await page.getByText('Publish now',{exact:true}).click();
    await page.getByRole('button',{name:'Published',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(window.repoFiles.data['products.json'].content).products.length),11);
    const actual = await (await page.request.get('http://localhost:8080/data/products.json')).json();
    assert.equal(actual.products.length,12);
    assert.equal(actual.products[0].name,'4MP Indoor Turret Camera');
    await page.reload();
    await page.waitForFunction(()=>/products|login/i.test(document.querySelector('#nc-root')?.textContent || ''));
    const login = page.getByRole('button',{name:'Login',exact:true});
    if (await login.isVisible()) await login.click();
    const entry = page.getByText('Products',{exact:true}).first();
    if (await entry.isVisible()) await entry.click();
    await page.getByText('12 products',{exact:true}).waitFor();
    await page.getByText('4MP Indoor Turret Camera — CCTV Systems',{exact:true}).waitFor();
    console.log('Admin demo edit, price, add, delete, save, reset and public data isolation checks passed.');
    assert.equal(await page.locator('#editor-error').isVisible(),false);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
