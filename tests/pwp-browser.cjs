const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const categories=[{name:'CCTV Systems',slug:'cctv',description:'Cameras',icon:'cctv'},{name:'PWP Products',slug:'pwp',description:'Optional add-ons',icon:'pos'}];
  const product=(id,name,category,price)=>({id,name,category,price,price_mode:'fixed',published:true,example:false,new_arrival:false,image:'assets/products/cctv.svg',description:id,specifications:[],gallery:[],installation:'Quoted separately',availability:'Contact us'});
  const products=[product('camera','Camera','CCTV Systems',666),product('recorder','Recorder','CCTV Systems',100),product('card','64GB memory card','PWP Products',35),product('cable','Cable','PWP Products',15)];
  products[2].new_arrival=true;
  const key=p=>p.category+':'+p.id;
  let offers=[{id:'kit',name:'Camera essentials',qualifiers:products.slice(0,2).map(key),addons:[{key:key(products[2]),price:20},{key:key(products[3]),price:10}],limit:1,enabled:true,start:'',end:''}];
  let items=[{id:'camera',category:'CCTV Systems',quantity:1}],version=0;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
  await page.addInitScript(()=>sessionStorage.setItem('abtech-customer-session:/',JSON.stringify({token:'a'.repeat(64),username:'pwp_test'})));
  await page.route('**/data/categories.json',r=>r.fulfill({json:{categories}}));
  await page.route('**/data/categories/*.json',r=>r.fulfill({json:{products:products.filter(p=>new URL(r.request().url()).pathname.endsWith('/pwp.json')?p.category==='PWP Products':p.category==='CCTV Systems')}}));
  await page.route('**/data/pwp-offers.json',r=>r.fulfill({json:{offers}}));
  await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/customer/**',async r=>{
    if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
    if(r.request().method()==='PUT'){items=r.request().postDataJSON().items;version++;}
    return r.fulfill({headers,json:{username:'pwp_test',fullName:'PWP Tester',email:'pwptest@gmail.com',items,version}});
  });
  await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/staff/**',async r=>{
    const req=r.request(),path=new URL(req.url()).pathname;
    if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
    let result={configured:true,loginConfigured:true,registrationConfigured:true};
    if(path.endsWith('/login'))result={token:'b'.repeat(64),username:'staff'};
    if(path.endsWith('/categories'))result={categories,sha:'a'.repeat(40)};
    if(path.endsWith('/categories/cctv'))result={products:products.slice(0,2),sha:'b'.repeat(40)};
    if(path.endsWith('/categories/pwp'))result={products:products.slice(2),sha:'b'.repeat(40)};
    if(path.endsWith('/pwp')){
      if(req.method()==='PUT')offers=req.postDataJSON().offers;
      result={offers,products,sha:'c'.repeat(40),message:'Published to GitHub.'};
    }
    return r.fulfill({headers,json:result});
  });
  const waitTotal=async(value)=>{await page.waitForFunction(v=>document.querySelector('#cart-total')?.textContent.replace(/\s/g,'')===v,value);};
  try {
    await page.goto('http://localhost:8080/cart.html');await waitTotal('RM666.00');
    assert.equal(await page.locator('.cart-pwp-offer').count(),2);
    await page.getByRole('button',{name:/Add for RM.*20.00/}).click();await waitTotal('RM686.00');
    assert.match(await page.locator('.cart-pwp-savings').textContent(),/15.00/);
    await page.getByRole('button',{name:/Add for RM.*10.00/}).click();await waitTotal('RM696.00');
    await page.getByRole('button',{name:'Increase quantity of 64GB memory card',exact:true}).click();await waitTotal('RM731.00');
    await page.getByRole('button',{name:'Remove Camera',exact:true}).click();await waitTotal('RM85.00');
    assert.equal(await page.locator('.cart-pwp').isVisible(),false);
    await page.reload();await waitTotal('RM85.00');
    // A different qualifying product also unlocks the saved add-ons.
    items.push({id:'recorder',category:'CCTV Systems',quantity:1});version++;await page.reload();await waitTotal('RM165.00');
    await page.screenshot({path:'.preview/pwp-cart-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'Checkout',exact:true}).click();
    assert.equal((await page.locator('.checkout-total strong').textContent()).replace(/\s/g,''),'RM165.00');
    await page.setViewportSize({width:390,height:844});await page.reload();await waitTotal('RM165.00');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'.preview/pwp-cart-mobile.png',fullPage:true});
    await page.goto('http://localhost:8080/admin/');await page.locator('#login-username').fill('staff');await page.locator('#login-password').fill('Camera1!');await page.locator('#staff-login').click();
    await page.locator('#staff-workspace').waitFor({state:'visible'});
    const categoryToggle=page.locator('#staff-category-menu summary');
    assert.equal(await page.locator('#staff-categories').isVisible(),false);
    await categoryToggle.click();assert.equal(await page.locator('#staff-categories').isVisible(),true);
    await categoryToggle.press('Enter');assert.equal(await page.locator('#staff-categories').isVisible(),false);
    await page.locator('#staff-pwp-open').click();
    await page.getByRole('button',{name:'Edit offer',exact:true}).click();
    assert.equal(await page.locator('[name="qualifier"]:checked').count(),2);assert.equal(await page.locator('[name="addon"]:checked').count(),2);
    assert.equal(await page.locator('[name="addon"]').count(),2);assert.equal(await page.locator('[name="qualifier"]').count(),2);
    await page.locator('[data-key="PWP Products:card"]').fill('18');await page.locator('[data-save-offer]').click();
    await page.locator('[data-offer-form]').waitFor({state:'hidden'});assert.equal(offers[0].addons[0].price,18);
    await page.getByRole('button',{name:'Edit offer',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'.preview/pwp-admin-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'.preview/pwp-admin-desktop.png',fullPage:true});
    await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('[data-cancel-offer]').click();await categoryToggle.click();await page.locator('#staff-categories button[data-slug="pwp"]').click();
    await page.getByRole('heading',{name:'PWP Products',exact:true}).waitFor();await page.locator('#edit-staff-category').click();assert.equal(await page.locator('#remove-staff-category').isDisabled(),true);await page.locator('#cancel-staff-category').click();
    await categoryToggle.click();assert.equal(await page.locator('#staff-categories').isVisible(),false);
    await page.goto('http://localhost:8080/cart.html');await waitTotal('RM163.00');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    offers[0].enabled=false;await page.reload();await waitTotal('RM185.00');
    offers[0].enabled=true;await page.goto('http://localhost:8080/catalogue.html?view=all');await page.locator('.product-card').nth(3).waitFor();
    assert.equal(await page.locator('.product-pwp-badge').count(),4);
    const newCard=page.locator('.product-card').filter({hasText:'64GB memory card'});
    assert.equal(await newCard.locator('.sample-badge').textContent(),'NEW ARRIVAL');assert.equal(await newCard.locator('.product-pwp-badge').textContent(),'PWP');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'.preview/pwp-product-badges-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PWP multi-select admin publishing, add-ons, limits, persisted carts, repricing, checkout total and mobile layout passed.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
