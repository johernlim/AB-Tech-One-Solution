import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStaff} from '../auth-worker/staff.mjs';
import {columns,reviewRows,exportRow} from '../admin/bulk-products-core.js';
const sha='a'.repeat(40),head='b'.repeat(40),registrySha='c'.repeat(40);
const product={id:'camera',category:'CCTV',name:'Camera',description:'Model 1',price:100,price_mode:'fixed',image:'assets/products/cctv.svg',published:true,example:false,new_arrival:false,availability:'Available',installation:'Quoted',specifications:['One'],gallery:['assets/products/cctv.svg'],custom:'preserve'};
const categories=[{slug:'cctv',name:'CCTV',description:'Cameras',icon:'cctv',visible:false},{slug:'alarm',name:'Alarm',description:'Alarms',icon:'alarm'}];
const catalogue=categories.map(c=>({...c,sha,products:c.slug==='cctv'?[product]:[]}));
const row=values=>columns.map(c=>values[c]??'');
const photo={file:{name:'camera.png'}};
test('New rows validate images, IDs, prices, booleans and defaults',()=>{
 const valid=row({'Category ID':'alarm','Product ID':'new-alarm','Product Name':'New alarm','Model Number':'A1','Price (RM)':20,'Image Filename':'camera.png'});
 let result=reviewRows([valid],'add',catalogue,new Map([['camera.png',photo]]));assert.deepEqual(result.errors,[]);assert.equal(result.items[0].product.published,true);assert.equal(result.items[0].product.new_arrival,false);
 assert.match(reviewRows([valid],'add',catalogue).errors.join(' '),/Select the photo/);
 assert.match(reviewRows([valid,valid],'add',catalogue,new Map([['camera.png',photo]])).errors.join(' '),/Duplicate/);
 const bad=valid.slice();bad[4]='NaN';bad[6]='maybe';assert.equal(reviewRows([bad],'add',catalogue,new Map([['camera.png',photo]])).errors.length,2);
 assert.match(reviewRows([row({'Category ID':'bad'})],'add',catalogue).errors[0],/existing Category/);
});
test('Edit exports round trip, blank fields preserve data, changed prices preview and stale files fail',()=>{
 const values=exportRow(catalogue[0],product,sha);let result=reviewRows([values],'edit',catalogue);assert.deepEqual(result.errors,[]);assert.deepEqual(result.items[0].changes,[]);
 values[4]=80;values[2]='';result=reviewRows([values],'edit',catalogue);assert.deepEqual(result.items[0].changes,['price']);assert.equal(result.items[0].product.name,'Camera');assert.deepEqual(result.items[0].product.gallery,product.gallery);
 values[12]='old';assert.match(reviewRows([values],'edit',catalogue).errors[0],/out of date/);
 values[12]=sha;values[1]='renamed';assert.match(reviewRows([values],'edit',catalogue).errors[0],/not found/);
});
const origin='https://ab-tech-one-solution.pages.dev';
const env={ALLOWED_ORIGIN:origin,GITHUB_REPO:'owner/repo',GITHUB_CATALOGUE_TOKEN:'test',STAFF_PASSWORD_PEPPER:'p'.repeat(32),STAFF_DB:{prepare(){return{bind(){return this;},async run(){return{};},async first(){return{id:'staff',username:'staff'};}};}}};
const request=(data,authenticated=true)=>new Request('https://test/staff/bulk-products',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+'a'.repeat(64)}:{})},body:JSON.stringify(data)});
async function withGit(run,{conflict=false,productSha=sha}={}){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({url,method:options.method||'GET',body});
 if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:head}});
 if(url.includes('/contents/data/categories.json?'))return Response.json({sha:registrySha,content:Buffer.from(JSON.stringify({categories})).toString('base64')});
 if(url.includes('/contents/data/categories/'))return Response.json({sha:productSha,content:Buffer.from(JSON.stringify({products:url.includes('/cctv.json')?[product]:[]})).toString('base64')});
 if(url.endsWith('/git/commits/'+head))return Response.json({tree:{sha:'d'.repeat(40)}});
 if(url.endsWith('/git/trees'))return Response.json({sha:'e'.repeat(40)});
 if(url.endsWith('/git/commits'))return Response.json({sha:'f'.repeat(40)});
 if(url.endsWith('/git/refs/heads/main'))return conflict?new Response('',{status:422}):Response.json({});
 throw new Error('Unexpected '+url);};try{await run(calls);}finally{globalThis.fetch=original;}
}
const batch=(mode='edit')=>({mode,categoriesSha:registrySha,changes:[{slug:'cctv',sha,products:[{...product,price:80}]}]});
test('Bulk publishing requires authentication and preserves unrelated product data',async()=>{
 assert.equal((await handleStaff(request(batch(),false),env)).status,401);
 await withGit(async calls=>{const response=await handleStaff(request(batch()),env);assert.equal(response.status,200);const tree=calls.find(c=>c.url.endsWith('/git/trees')).body.tree;assert.equal(tree.length,1);const next=JSON.parse(tree[0].content).products[0];assert.equal(next.price,80);assert.equal(next.custom,'preserve');assert.deepEqual(next.gallery,product.gallery);assert.deepEqual(calls.at(-1).body,{sha:'f'.repeat(40),force:false});});
});
test('Multiple categories are committed atomically and existing products are kept',async()=>{
 await withGit(async calls=>{const data={mode:'add',categoriesSha:registrySha,changes:[{slug:'cctv',sha,products:[{...product,id:'second'}]},{slug:'alarm',sha,products:[{...product,id:'alarm',category:'Alarm'}]}]};assert.equal((await handleStaff(request(data),env)).status,200);const tree=calls.find(c=>c.url.endsWith('/git/trees')).body.tree;assert.equal(tree.length,2);assert.equal(JSON.parse(tree[0].content).products.length,2);assert.equal(calls.filter(c=>c.url.endsWith('/git/refs/heads/main')).length,1);});
});
test('Stale data, duplicates, existing IDs on add, invalid prices and new IDs on edit cannot publish',async()=>{
 const bads=[{...batch(),categoriesSha:sha},batch('add'),{...batch(),changes:[{slug:'cctv',sha,products:[{...product,id:'missing'}]}]},{...batch(),changes:[{slug:'cctv',sha,products:[product,product]}]},{...batch(),changes:[{slug:'cctv',sha,products:[{...product,price:-1}]}]}];
 for(const data of bads)await withGit(async calls=>{assert.ok((await handleStaff(request(data),env)).status>=400);assert.equal(calls.some(c=>c.method==='POST'||c.method==='PATCH'),false);});
 await withGit(async calls=>{assert.equal((await handleStaff(request(batch()),env)).status,409);assert.equal(calls.some(c=>c.method==='POST'),false);},{productSha:head});
 await withGit(async()=>{assert.equal((await handleStaff(request(batch()),env)).status,409);},{conflict:true});
});
import {combinedColumns,combinedExportRow} from '../admin/bulk-products-core.js';
test('Combined rows add and update together; unchanged rows need no Skip action',()=>{
 const existing=combinedExportRow(catalogue[0],product,sha);
 let result=reviewRows([existing],'mixed',catalogue);assert.deepEqual(result.errors,[]);assert.equal(result.items[0].changes.length,0);
 const edited=existing.slice();edited[5]=75;
 const added=combinedColumns.map(c=>({Action:'Add',Category:'Alarm','Product Name':'New alarm','Model Number':'A2','Price (RM)':200,'Image Filename':'camera.png'}[c]??''));
 result=reviewRows([edited,added],'mixed',catalogue,new Map([['camera.png',photo]]));assert.deepEqual(result.errors,[]);assert.equal(result.items[0].action,'update');assert.equal(result.items[1].action,'add');assert.match(result.items[1].product.id,/^product-/);assert.equal(result.items[1].generated,true);
 const skip=existing.slice();skip[0]='Skip';assert.equal(reviewRows([skip],'mixed',catalogue).items[0].changes.length,0);skip[5]=80;assert.equal(reviewRows([skip],'mixed',catalogue).items[0].action,'update');
 const bad=added.slice();bad[13]=sha;assert.match(reviewRows([bad],'mixed',catalogue).errors[0],/Product ID|Product not found/);
});
test('Combined backend commits mixed actions atomically, ignores no-ops, and rejects unknown actions',async()=>{
 await withGit(async calls=>{const data={mode:'mixed',categoriesSha:registrySha,changes:[{slug:'cctv',sha,products:[{...product,price:80,action:'update'},{...product,id:'new-camera',action:'add'}]}]};const response=await handleStaff(request(data),env);assert.equal(response.status,200);assert.equal((await response.json()).count,2);const saved=JSON.parse(calls.find(c=>c.url.endsWith('/git/trees')).body.tree[0].content).products;assert.equal(saved.length,2);assert.equal(saved[0].price,80);assert.equal(saved[0].action,undefined);});
 await withGit(async calls=>{const data=batch();data.mode='mixed';data.changes[0].products=[{...product,action:'update'}];assert.equal((await (await handleStaff(request(data),env)).json()).count,0);assert.equal(calls.some(c=>c.method==='POST'||c.method==='PATCH'),false);});
 await withGit(async calls=>{const data=batch();data.mode='mixed';data.changes[0].products[0].action='skip';assert.equal((await handleStaff(request(data),env)).status,400);assert.equal(calls.some(c=>c.method==='POST'),false);});
});
