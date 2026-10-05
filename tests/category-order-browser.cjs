const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const server = http.createServer((req,res)=>{
  const file = path.join(process.cwd(), decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  const target = file.endsWith(path.sep) ? path.join(file,'index.html') : file;
  fs.readFile(target,(error,data)=>{
    if(error){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(target)] || 'application/octet-stream');res.end(data);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    let categories=JSON.parse(fs.readFileSync('data/categories.json')).categories, fail=false, saves=0;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'};
    await page.route('**/staff/**',async route=>{
      const req=route.request(), pathname=new URL(req.url()).pathname;
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      if(pathname.endsWith('/login'))return route.fulfill({headers,json:{token:'b'.repeat(64),username:'staff'}});
      if(pathname==='/staff/categories'){
        if(req.method()==='PATCH'){
          saves++; assert.equal(req.postDataJSON().sha,'a'.repeat(40));
          if(fail)return route.fulfill({status:409,headers,json:{error:'Categories changed. Reload and try again.'}});
          categories=req.postDataJSON().order.map(slug=>categories.find(c=>c.slug===slug));
        }
        return route.fulfill({headers,json:{categories,sha:'a'.repeat(40),message:'Homepage updates after deployment.'}});
      }
      return route.fulfill({headers,json:{configured:true,loginConfigured:true,products:[],sha:'b'.repeat(40)}});
    });
    await page.route('**/data/categories.json',route=>route.fulfill({json:{categories}}));
    await page.goto(base+'/admin/');
    await page.locator('#login-username').fill('staff');await page.locator('#login-password').fill('Camera1!');await page.locator('#staff-login').click();
    await page.locator('#staff-categories button').first().waitFor({state:'attached'});
    await page.locator('#staff-category-menu summary').click();
    const row=slug=>page.locator('#staff-categories button[data-slug="'+slug+'"]');
    const original=categories.map(c=>c.slug);
    await row('wifi').dragTo(row(original[0]),{targetPosition:{x:40,y:2}});
    await page.getByText(/^Order saved\./).waitFor();
    assert.equal(categories[0].slug,'wifi');assert.equal(saves,1);
    await row('wifi').press('Alt+ArrowDown');await page.getByText(/^Order saved\./).waitFor();
    assert.equal(categories[1].slug,'wifi');assert.equal(saves,2);
    fail=true;await row('wifi').press('Alt+ArrowUp');await page.getByText('Categories changed. Reload and try again.',{exact:true}).waitFor();
    assert.equal(await page.locator('#staff-categories button').nth(1).getAttribute('data-slug'),'wifi');
    fail=false;
    // Drag the handle with captured pointer events, also used by touch screens.
    const grip=await row('wifi').locator('.category-drag-handle').boundingBox(), first=await row(categories[0].slug).boundingBox();
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
    await page.mouse.move(first.x+40,first.y+2,{steps:8});await page.mouse.up();
    await page.getByText(/^Order saved\./).waitFor();assert.equal(categories[0].slug,'wifi');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const client=await page.context().newCDPSession(page);
    const touchGrip=await row('wifi').locator('.category-drag-handle').boundingBox(), target=await row(categories[2].slug).boundingBox();
    const point={x:touchGrip.x+touchGrip.width/2,y:touchGrip.y+touchGrip.height/2};
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+40,y:target.y+target.height-2}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.getByText(/^Order saved\./).waitFor();assert.equal(categories[2].slug,'wifi');
    await row('wifi').press('Alt+ArrowUp');await page.getByText(/^Order saved\./).waitFor();
    await row('wifi').press('Alt+ArrowUp');await page.getByText(/^Order saved\./).waitFor();
    await page.goto(base+'/');await page.evaluate(()=>window.homeCategoriesReady);
    assert.equal(await page.locator('.service-card h3').first().textContent(),'WiFi Solutions');
    assert.deepEqual(await page.locator('.service-card h3').allTextContents(),categories.filter(c=>c.visible!==false).map(c=>c.name));
    assert.deepEqual(errors,[]);
    console.log('Drag, pointer handle, touch drag, keyboard, failure rollback, mobile layout and homepage order passed.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
