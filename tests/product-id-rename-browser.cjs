const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
(async()=>{
  const server=http.createServer(async(req,res)=>{try{let file=path.join(process.cwd(),new URL(req.url,'http://localhost').pathname);if(file.endsWith(path.sep))file=path.join(file,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const categories=[{name:'CCTV Systems',slug:'cctv',description:'Cameras.',icon:'cctv'}];
    let products=[{id:'camera',category:'CCTV Systems',name:'Camera',description:'Model 1',image:'assets/products/cctv.svg',price:100,price_mode:'fixed',gallery:[],specifications:['Outdoor'],availability:'Available',installation:'Quoted',published:true,example:false,new_arrival:false}];
    let sha='a'.repeat(40),renames=0,savedItems=[{id:'camera',category:'CCTV Systems',quantity:2}];
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS'};
    await page.route('**/staff/**',async route=>{
      const request=route.request(),pathname=new URL(request.url()).pathname;
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
      let result={configured:true,loginConfigured:true};
      if(pathname.endsWith('/login'))result={token:'b'.repeat(64),username:'staff'};
      if(pathname==='/staff/categories')result={categories,sha:'c'.repeat(40),orderVersion:0};
      if(pathname==='/staff/categories/cctv')result={products,sha};
      if(pathname==='/staff/categories/cctv/products/camera'){
        assert.equal(request.method(),'PATCH');const data=request.postDataJSON();assert.equal(data.sha,sha);assert.equal(data.product.id,'cctv-turret1');
        renames++;products=[{...data.product,id_aliases:['camera']}];sha='d'.repeat(40);result={products,sha,message:'Product ID, saved carts and promotion references updated.'};
      }
      return route.fulfill({headers,json:result});
    });
    await page.route('**/data/categories.json',route=>route.fulfill({json:{categories}}));
    await page.route('**/data/categories/*.json',route=>route.fulfill({json:{products}}));
    await page.route('**/data/pwp-offers.json',route=>route.fulfill({json:{offers:[]}}));
    await page.route('**/data/discount-promotions.json',route=>route.fulfill({json:{promotions:[]}}));
    await page.route('**/public/category-order',route=>route.fulfill({headers,json:{order:[]}}));
    await page.route('**/customer/**',async route=>{
      const request=route.request();if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
      if(request.method()==='PUT')savedItems=request.postDataJSON().items;
      return route.fulfill({headers,json:{configured:true,username:'customer',items:savedItems,version:1}});
    });
    await page.goto(base+'/admin/');await page.locator('#login-username').fill('staff');await page.locator('#login-password').fill('Camera1!');await page.locator('#staff-login').click();
    await page.locator('#staff-categories button').waitFor({state:'attached'});await page.locator('#staff-category-menu summary').click();await page.locator('#staff-categories button').click();
    await page.locator('.staff-product').getByRole('button',{name:'Edit product',exact:true}).click();
    await page.locator('#staff-product-form [name="id"]').fill('cctv-turret1');await page.locator('#staff-product-form [name="name"]').fill('Updated camera');await page.locator('#publish-staff-product').click();
    await page.getByText('Product ID, saved carts and promotion references updated.',{exact:true}).waitFor();assert.equal(renames,1);
    await page.locator('.staff-product').getByRole('button',{name:'Edit product',exact:true}).click();assert.equal(await page.locator('#staff-product-form [name="id"]').inputValue(),'cctv-turret1');await page.locator('#cancel-staff-product').click();
    await page.addInitScript(()=>sessionStorage.setItem('abtech-customer-session:/',JSON.stringify({token:'a'.repeat(64),username:'customer'})));
    await page.goto(base+'/index.html');await page.locator('[data-cart-open]').click();
    await page.locator('.cart-item h3').filter({hasText:'Updated camera'}).waitFor();assert.equal(await page.locator('.cart-item').count(),1);
    await page.getByRole('button',{name:'Increase quantity of Updated camera',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.cart-clear').disabled);assert.equal(savedItems[0].id,'cctv-turret1');assert.equal(savedItems[0].quantity,3);
    assert.deepEqual(errors,[]);console.log('Admin Product ID rename uses the safe endpoint; old cart IDs display and save as the new ID.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
