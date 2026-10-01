const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
      const page = await browser.newPage({viewport});
      await page.goto('http://localhost:8080/index.html');
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, document.getElementById('services').offsetTop + 130);
      });
      const position = await page.evaluate(() => scrollY);
      await page.locator('#services h3 a[href*="Alarm%20Systems"]').click();
      await page.locator('.product-card').first().waitFor();
      const count = await page.locator('.product-card').count();
      assert.equal(await page.locator('#category-title').textContent(), 'Alarm Systems');
      assert.equal(await page.locator('#category-filters').isVisible(), false);
      assert.equal(await page.locator('.sort-field').isVisible(), false);
      assert.ok((await page.locator('.product-category').allTextContents()).every(name => name === 'Alarm Systems'));
      await page.locator('#search').fill('no-matching-alarm-product');
      assert.equal(await page.locator('.product-card').count(), 0);
      await page.getByRole('button', {name: 'Clear search', exact: true}).click();
      assert.equal(await page.locator('.product-card').count(), count);
      assert.equal(new URL(page.url()).searchParams.get('category'), 'Alarm Systems');
      await page.screenshot({path: '.preview/alarm-category-' + viewport.width + '.png', fullPage: true});
      await page.getByRole('link', {name: 'Back to home', exact: false}).click();
      await page.waitForFunction(expected => Math.abs(scrollY - expected) <= 2, position);
      assert.equal(new URL(page.url()).searchParams.has('return'), false);
      await page.screenshot({path: '.preview/home-return-' + viewport.width + '.png'});
      await page.locator('#services h3 a[href*="Alarm%20Systems"]').click();
      await page.locator('.product-card').first().waitFor();
      await page.goBack();
      await page.waitForFunction(expected => Math.abs(scrollY - expected) <= 2, position);
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto('http://localhost:8080/catalogue.html?category=Alarm%20Systems');
    assert.equal(await page.getByRole('link', {name: 'Back to home', exact: false}).getAttribute('href'), 'index.html');
    await page.goto('http://localhost:8080/catalogue.html?view=all');
    await page.locator('.product-card').first().waitFor();
    assert.equal(await page.locator('#category-filters').isVisible(), true);
    assert.equal(await page.locator('.sort-field').isVisible(), true);
    await page.goto('http://localhost:8080/admin/');
    assert.equal(await page.locator('#staff-setup-status').isVisible(), false);
    assert.equal(await page.locator('#staff-setup-status').textContent(), '');
    console.log('Category-only products, scoped search/reset, desktop/mobile home scroll restoration, browser Back and blank login setup status passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
