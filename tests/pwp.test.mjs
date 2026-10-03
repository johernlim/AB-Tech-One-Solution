import test from 'node:test';
import assert from 'node:assert/strict';
import {PWP_CATEGORY, productKey, pwpChoices, pwpLine} from '../pwp.js';
import {validateOffers} from '../auth-worker/pwp.mjs';
import {handleStaff} from '../auth-worker/staff.mjs';
const product = (id, category, price) => ({id, category, price, price_mode:'fixed', published:true, name:id});
const products = [product('camera', 'CCTV Systems', 666), product('recorder','CCTV Systems',100), product('card',PWP_CATEGORY,35), product('cable',PWP_CATEGORY,15)];
const keys = products.map(productKey), catalogue = new Map(products.map(p=>[productKey(p),p]));
const offer = {id:'camera-kit',name:'Camera kit',qualifiers:keys.slice(0,2),addons:[{key:keys[2],price:20},{key:keys[3],price:10}],enabled:true,limit:1,start:'',end:''};
const item = (index,quantity=1) => ({id:products[index].id,category:products[index].category,quantity});
test('Either qualifier unlocks multiple add-ons; selected add-ons have discounted totals',()=>{
  for(const qualifier of [0,1]) assert.equal(pwpChoices([item(qualifier)],catalogue,[offer]).size,2);
  const choices=pwpChoices([item(0),item(2),item(3)],catalogue,[offer]);
  assert.equal(pwpLine(item(2),products[2],choices).total,2000);
  assert.equal(pwpLine(item(3),products[3],choices).saving,500);
  assert.equal(66600+pwpLine(item(2),products[2],choices).total,68600);
});
test('Quantity changes cap discounts; removing all qualifiers restores normal prices',()=>{
  const choices=pwpChoices([item(0),item(1,2)],catalogue,[offer]);
  const line=pwpLine(item(2,4),products[2],choices);
  assert.equal(line.discountedQuantity,3);assert.equal(line.total,9500);assert.equal(line.saving,4500);
  assert.equal(pwpLine(item(2),products[2],pwpChoices([item(2)],catalogue,[offer])).total,3500);
  const hidden = new Map(catalogue);hidden.delete(keys[0]);assert.equal(pwpChoices([item(0)],hidden,[offer]).size,0);
});
test('Active switch controls availability; old dates are ignored and offers never stack',()=>{
  const now=new Date('2026-10-04T12:00:00Z');
  assert.equal(pwpChoices([item(0)],catalogue,[{...offer,enabled:false}]).size,0);
  for(const dates of [{start:'2026-10-05'},{end:'2026-10-03'}]) assert.equal(pwpChoices([item(0)],catalogue,[{...offer,...dates}]).size,2);
  const choices=pwpChoices([item(0)],catalogue,[offer,{...offer,id:'second',addons:[{key:keys[2],price:18}],limit:2}],now);
  assert.equal(choices.get(keys[2]).price,18);assert.equal(choices.get(keys[2]).limit,2);
  assert.equal(pwpChoices([item(0)],catalogue,[{...offer,addons:[{key:keys[1],price:10}]}]).size,0);
});
test('Publishing validates multi-select references, category, prices, limits and duplicates',()=>{
  assert.equal(validateOffers([offer],products),true);
  for(const change of [{qualifiers:[]},{qualifiers:[keys[2]]},{qualifiers:[keys[0],keys[0]]},{addons:[]},{addons:[{key:keys[0],price:20}]},{addons:[{key:keys[2],price:35}]},{addons:[{key:keys[2],price:0}]},{addons:[{key:keys[2],price:1.001}]},{limit:0}]) assert.equal(validateOffers([{...offer,...change}],products),false,JSON.stringify(change));
  assert.equal(validateOffers([offer,offer],products),false);
  assert.equal(validateOffers([offer],products.filter(p=>p.id!=='card')),false);
});
const origin='https://ab-tech-one-solution.pages.dev';
const env={ALLOWED_ORIGIN:origin,GITHUB_REPO:'test/repo',STAFF_PASSWORD_PEPPER:'p'.repeat(32),GITHUB_CATALOGUE_TOKEN:'test-only',STAFF_DB:{prepare(){return{bind(){return this;},async first(){return{id:'staff',username:'staff'};}}}}};
const request=(method,data,auth=true)=>new Request('https://auth.test/staff/pwp',{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+'a'.repeat(64)}:{})},...(data?{body:JSON.stringify(data)}:{})});
test('PWP API requires staff; publishes only sanitized data and detects stale edits',async()=>{
  assert.equal((await handleStaff(request('GET',null,false),env)).status,401);
  const original=globalThis.fetch;let written, conflict=false;
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'c'.repeat(40)}});
    if(url.includes('categories.json?'))return Response.json({sha:'b'.repeat(40),content:Buffer.from(JSON.stringify({categories:[{name:'CCTV Systems',slug:'cctv',description:'Cameras',icon:'cctv'},{name:PWP_CATEGORY,slug:'pwp',description:'Add-ons',icon:'pos'}]})).toString('base64')});
    if(url.includes('/categories/'))return Response.json({content:Buffer.from(JSON.stringify({products:products.filter(p=>url.includes('/pwp.json')?p.category===PWP_CATEGORY:p.category!==PWP_CATEGORY)})).toString('base64')});
    if(options.method==='PUT'){written=JSON.parse(Buffer.from(JSON.parse(options.body).content,'base64').toString());return conflict?new Response('',{status:409}):Response.json({content:{sha:'d'.repeat(40)}});}
    return Response.json({sha:'a'.repeat(40),content:Buffer.from(JSON.stringify({offers:[]})).toString('base64')});
  };
  try{
    const response=await handleStaff(request('PUT',{sha:'a'.repeat(40),offers:[{...offer,privateToken:'strip-me'}]}),env);assert.equal(response.status,200);assert.deepEqual(written.offers,[offer]);
    const loaded=await(await handleStaff(request('GET'),env)).json();assert.equal(loaded.products.length,4);
    assert.equal((await handleStaff(request('PUT',{sha:'a'.repeat(40),offers:[{...offer,addons:[{key:keys[0],price:20}]}]}),env)).status,400);
    conflict=true;assert.equal((await handleStaff(request('PUT',{sha:'a'.repeat(40),offers:[offer]}),env)).status,409);
  }finally{globalThis.fetch=original;}
});
