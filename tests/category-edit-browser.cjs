const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  let categoryProductRequests=0;
  let categoryListRequests=0;
  let failedProductReads=0, patchRequests=0, failNextSave=true;
  let categories=[{name:'CCTV Systems',slug:'cctv',description:'Cameras.',icon:'cctv'}];
  const products=[{id:'camera',name:'Camera',category:'CCTV Systems',image:'assets/products/cctv.svg',price:100,price_mode:'fixed',description:'Camera',specifications:[],gallery:[],installation:'Quoted separately',availability:'Contact us',published:true,example:false,new_arrival:false}];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'};
  await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/staff/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,method=req.method();if(method==='OPTIONS')return route.fulfill({status:204,headers});
    let result={configured:true,loginConfigured:true};
    if(path.endsWith('/login'))result={token:'b'.repeat(64),username:'staff'};
    if(path.endsWith('/categories')){
      if(method==='GET' && ++categoryListRequests===1)return route.fulfill({status:503,headers,json:{error:'Temporary upstream delay.'}});
      if(method==='POST')categories.push(req.postDataJSON().category);result={categories,sha:'a'.repeat(40),message:'Published.'};
    }
    if(/\/categories\//.test(path)){
      if(method==='GET'){categoryProductRequests++;if(failedProductReads>0){failedProductReads--;return route.abort('failed');}}
      const slug=path.split('/').pop();
      if(method==='PATCH'){patchRequests++;if(failNextSave){failNextSave=false;return route.fulfill({status:503,headers,json:{error:'Save temporarily unavailable.'}});}}
      if(method==='PATCH'){const next=req.postDataJSON().category;categories=categories.map(c=>c.slug===slug?{...next,aliases:[c.name]}:c);if(slug==='cctv')products[0].category=next.name;result={categories,sha:'a'.repeat(40),message:'Published.'};}
      else if(method==='DELETE'){categories=categories.filter(c=>c.slug!==slug);result={categories,sha:'a'.repeat(40),message:'Published.'};}
      else result={products:slug==='cctv'?products:[],sha:'b'.repeat(40)};
    }
    return route.fulfill({headers,json:result});
  });
  await page.route('**/data/categories.json',r=>r.fulfill({json:{categories}}));
  await page.route('**/data/categories/*.json',r=>r.fulfill({json:{products}}));
  await page.route('**/data/pwp-offers.json',r=>r.fulfill({json:{offers:[]}}));
  await page.route('https://ab-tech-catalogue-auth.johern20154.workers.dev/customer/**',r=>r.fulfill({headers,json:{configured:false}}));
  await page.goto('http://localhost:8080/admin/');await page.locator('#login-username').fill('staff');await page.locator('#login-password').fill('Camera1!');await page.locator('#staff-login').click();
  await page.locator('#staff-categories button[data-slug="cctv"]').waitFor({state:'attached'});
  assert.equal(await page.locator('#staff-category-title').isVisible(),false);assert.equal(await page.locator('#staff-workspace-message').isVisible(),false);
  assert.equal(await page.locator('#edit-staff-category').isVisible(),false);assert.equal(await page.locator('#add-staff-product').isVisible(),false);
  assert.equal(await page.locator('#staff-products').textContent(),'');assert.equal(categoryProductRequests,0);
  assert.equal(categoryListRequests,2);
  assert.equal(await page.locator('#staff-category-menu').getAttribute('open'),null);
  assert.equal(await page.locator('#edit-staff-category').isDisabled(),true);assert.equal(await page.locator('#add-staff-product').isDisabled(),true);
  await page.screenshot({path:'.preview/admin-empty-on-login.png',fullPage:true});
  await page.locator('#staff-category-menu summary').click();assert.equal(categoryProductRequests,0);
  await page.locator('#staff-categories button[data-slug="cctv"]').click();
  await page.getByRole('heading',{name:'CCTV Systems',exact:true}).waitFor();assert.equal(await page.locator('#remove-staff-category').isVisible(),false);
  assert.equal(categoryProductRequests,1);assert.equal(await page.locator('.staff-product').count(),1);
  failedProductReads=2;await page.locator('#staff-categories button[data-slug="cctv"]').click();
  await page.getByText('Could not load data after retrying. Please refresh or select the category again.',{exact:true}).waitFor();assert.equal(categoryProductRequests,3);
  await page.locator('#staff-categories button[data-slug="cctv"]').click();await page.locator('#staff-workspace-message').filter({hasText:/^$/}).waitFor({state:'attached'});assert.equal(categoryProductRequests,4);
  await page.locator('#staff-category-menu summary').click();
  await page.locator('#edit-staff-category').click();assert.equal(await page.locator('#category-slug').getAttribute('readonly')!==null,true);
  await page.locator('#category-name').fill('Security Cameras');await page.locator('#staff-category-form [name="description"]').fill('Updated camera category.');await page.locator('#publish-staff-category').click();
  await page.getByText('Save temporarily unavailable.',{exact:true}).waitFor();assert.equal(patchRequests,1);assert.equal(categories[0].name,'CCTV Systems');
  await page.locator('#publish-staff-category').click();
  await page.getByRole('heading',{name:'Security Cameras',exact:true}).waitFor();assert.equal(products[0].category,'Security Cameras');
  await page.locator('#staff-category-menu summary').click();await page.locator('#add-staff-category').click();assert.equal(await page.locator('#remove-staff-category').isVisible(),false);
  await page.locator('#category-name').fill('Smart Home');await page.locator('#staff-category-form [name="description"]').fill('Smart devices.');await page.locator('#publish-staff-category').click();
  await page.getByRole('heading',{name:'Smart Home',exact:true}).waitFor();await page.locator('#edit-staff-category').click();assert.equal(await page.locator('#remove-staff-category').isVisible(),true);
  await page.locator('#remove-staff-category').click();await page.getByRole('heading',{name:'Security Cameras',exact:true}).waitFor();assert.equal(categories.length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'.preview/category-edit-mobile.png',fullPage:true});
  await page.goto('http://localhost:8080/catalogue.html?category=CCTV%20Systems');await page.locator('.product-card').waitFor();assert.equal(await page.locator('#catalogue-page-title').textContent(),'Security Cameras');
  assert.deepEqual(errors,[]);console.log('Edit existing/new categories, rename, removal within edit dialog, old links and mobile layout passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
