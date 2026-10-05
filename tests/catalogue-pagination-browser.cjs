const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
(async()=>{
  const {renderCatalogue}=await import('../catalogue-render.mjs');
  const template=await fs.readFile('catalogue.html','utf8');
  const categories=[{name:'CCTV Systems',slug:'cctv',description:'Cameras.',icon:'cctv'},{name:'WiFi Solutions',slug:'wifi',description:'WiFi.',icon:'wifi'}];
  let count=36;
  const products=Array.from({length:36},(_,i)=>({id:'camera-'+(i+1),name:'Camera '+String(i+1).padStart(2,'0'),category:i<24?'CCTV Systems':'WiFi Solutions',description:'Camera model',image:'assets/products/cctv.svg',price:i+1,price_mode:'fixed',published:true,example:false,specifications:[],availability:'Available',installation:'Quoted separately'}));
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    try{
      if(url.pathname==='/catalogue.html'){
        const snapshot={categories,products:products.slice(0,count),promotions:[],offers:[]};
        res.setHeader('Content-Type','text/html');return res.end(renderCatalogue(template,snapshot,null,new Date(),url.searchParams.get('page')||1));
      }
      const file=path.join(process.cwd(),url.pathname);
      res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
      res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/public/category-order',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{order:[]}}));
    await page.route('**/customer/**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{configured:false}}));
    const ready=()=>page.waitForFunction(()=>document.querySelector('#products').getAttribute('aria-busy')==='false');
    const pageButtons=()=>page.locator('#product-pagination a[aria-label^="Page "]');
    for(const total of [12,24,36,25,0]){
      count=total;await page.goto(base+'/catalogue.html?view=all');await ready();
      assert.equal(await page.locator('#products .product-card').count(),Math.min(total,12));
      assert.equal(await pageButtons().count(),total>12?Math.ceil(total/12):0);
      if(total>12){await page.getByRole('link',{name:'Page '+Math.ceil(total/12),exact:true}).click();assert.equal(await page.locator('#products .product-card').count(),total%12||12);}
    }
    count=36;await page.goto(base+'/catalogue.html?view=all');await ready();
    await page.getByRole('link',{name:'Page 3',exact:true}).click();
    assert.equal(await page.locator('.product-title-button').first().textContent(),'Camera 25');
    await page.locator('#search').fill('Camera 36');assert.equal(await page.locator('#products .product-card').count(),1);assert.equal(await page.locator('#product-pagination').isVisible(),false);
    await page.locator('#search').fill('');assert.equal(await page.locator('.product-title-button').first().textContent(),'Camera 01');
    await page.getByRole('link',{name:'Page 3',exact:true}).click();await page.locator('#sort').selectOption('price-low');assert.equal(await page.locator('.product-title-button').first().textContent(),'Camera 01');
    await page.getByRole('link',{name:'Page 3',exact:true}).click();await page.locator('#category-filters').getByRole('button',{name:'WiFi Solutions',exact:true}).click();
    assert.equal(await page.locator('#products .product-card').count(),12);assert.equal(await page.locator('#product-pagination').isVisible(),false);
    await page.locator('#category-filters').getByRole('button',{name:'All products',exact:true}).click();
    const gap=await page.evaluate(()=>document.querySelector('.catalogue-heading').getBoundingClientRect().top-document.querySelector('.header').getBoundingClientRect().bottom+scrollY);assert.ok(gap<=40);
    await fs.mkdir('.preview',{recursive:true});await page.screenshot({path:'.preview/catalogue-pagination-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.getByRole('link',{name:'Page 2',exact:true}).click();assert.equal(await page.locator('#products .product-card').count(),12);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'.preview/catalogue-pagination-mobile.png',fullPage:true});
    const plain=await browser.newContext({javaScriptEnabled:false}),plainPage=await plain.newPage();
    await plainPage.goto(base+'/catalogue.html?view=all&page=2');assert.equal(await plainPage.locator('.product-card').count(),12);assert.equal(await plainPage.locator('.product-title-button').first().textContent(),'Camera 13');assert.equal(await plainPage.locator('#product-pagination a[aria-label^="Page "]').count(),3);await plain.close();
    await page.goto(base+'/catalogue.html?view=all&page=99');await ready();assert.equal(await page.locator('.product-title-button').first().textContent(),'Camera 25');
    assert.deepEqual(errors,[]);console.log('12/24/36/25/0 products, page links, search/filter/sort resets, server rendering and mobile layout passed.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
