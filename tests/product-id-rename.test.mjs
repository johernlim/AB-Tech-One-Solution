import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleStaff,validateProducts} from '../auth-worker/staff.mjs';
import {productAliasSchema,saveCartWithProductIds} from '../auth-worker/product-identities.mjs';
const origin='https://ab-tech-one-solution.pages.dev',sha='a'.repeat(40),head='b'.repeat(40);
const category={name:'CCTV Systems',slug:'cctv',description:'Cameras',icon:'cctv',aliases:['Security']};
const product={id:'camera',id_aliases:['old-camera'],category:category.name,name:'Camera',description:'Model 1',image:'assets/products/cctv.svg',price:100,price_mode:'fixed',gallery:[],specifications:['Outdoor'],availability:'Available',installation:'Quoted separately',published:true,example:false,new_arrival:true};
const request=(data,authenticated=true,from='camera')=>new Request('https://auth.test/staff/categories/cctv/products/'+from,{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+'a'.repeat(64)}:{})},body:JSON.stringify(data)});
async function setup(run,{conflict=false,failActivation=false}={}){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(productAliasSchema);sqlite.exec("CREATE TABLE customer_users(id TEXT PRIMARY KEY,cart_json TEXT NOT NULL,cart_version INTEGER NOT NULL DEFAULT 0)");
  const insert=sqlite.prepare('INSERT INTO customer_users(id,cart_json) VALUES(?,?)');
  insert.run('one',JSON.stringify([{id:'camera',category:category.name,quantity:2},{id:'cctv-turret1',category:category.name,quantity:1},{id:'old-camera',category:'Security',quantity:4}]));
  insert.run('other',JSON.stringify([{id:'camera',category:'Other category',quantity:1}]));insert.run('empty','[]');
  sqlite.prepare("INSERT INTO product_id_aliases VALUES('cctv','old-camera','camera',?,'active')").run(JSON.stringify([category.name,'Security']));
  let fail=failActivation;
  const db={prepare(sql){let args=[];const query={bind(...values){args=values;return query;},async first(){if(sql.includes('JOIN staff_users'))return {id:'staff',username:'staff'};return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};return query;},async batch(queries){if(fail){fail=false;throw new Error('Temporary database interruption');}sqlite.exec('BEGIN');try{const results=[];for(const query of queries)results.push(await query.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const env={STAFF_DB:db,STAFF_PASSWORD_PEPPER:'p'.repeat(32),ALLOWED_ORIGIN:origin,GITHUB_REPO:'owner/repo',GITHUB_CATALOGUE_TOKEN:'test-only-token'};
  const originalFetch=globalThis.fetch,calls=[];let current={products:[product,{...product,id:'other-camera',id_aliases:[]}]},currentSha=sha,blob;
  const file=data=>({content:Buffer.from(JSON.stringify(data)).toString('base64')});
  globalThis.fetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;calls.push({url,method:options.method||'GET',body});
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:head}});
    if(url.includes('/contents/data/categories.json?'))return Response.json({...file({categories:[category]}),sha:'c'.repeat(40)});
    if(url.includes('/contents/data/categories/cctv.json?'))return Response.json({...file(current),sha:currentSha});
    if(url.includes('/contents/data/pwp-offers.json?'))return Response.json(file({offers:[{id:'kit',qualifiers:['CCTV Systems:camera','Security:old-camera','Other category:camera'],addons:[{key:'CCTV Systems:camera',price:20}]}]}));
    if(url.includes('/contents/data/discount-promotions.json?'))return Response.json(file({promotions:[{id:'sale',products:[{key:'CCTV Systems:camera',mode:'percent',value:10}]}]}));
    if(url.endsWith('/git/commits/'+head))return Response.json({tree:{sha:'d'.repeat(40)}});
    if(url.endsWith('/git/blobs')){blob=JSON.parse(Buffer.from(body.content,'base64'));return Response.json({sha:'e'.repeat(40)});}
    if(url.endsWith('/git/trees'))return Response.json({sha:'f'.repeat(40)});
    if(url.endsWith('/git/commits'))return Response.json({sha:'1'.repeat(40)});
    if(url.endsWith('/git/refs/heads/main')){if(conflict)return new Response('',{status:422});current=blob;currentSha='e'.repeat(40);return Response.json({});}
    throw new Error('Unexpected Git request '+url);
  };
  try{await run({env,sqlite,db,calls,current:()=>current});}finally{globalThis.fetch=originalFetch;sqlite.close();}
}
const change=()=>({sha,product:{...product,id:'cctv-turret1',name:'Updated camera'}});
test('ID rename atomically publishes products, PWP and discount references, then migrates private carts',async()=>setup(async({env,sqlite,calls,current})=>{
  const response=await handleStaff(request(change()),env);assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.sha,'e'.repeat(40));assert.equal(result.products[0].id,'cctv-turret1');assert.deepEqual(result.products[0].id_aliases,['old-camera','camera']);assert.equal(result.products[0].name,'Updated camera');
  const tree=calls.find(call=>call.url.endsWith('/git/trees')).body.tree;assert.deepEqual(tree.map(entry=>entry.path),['data/categories/cctv.json','data/pwp-offers.json','data/discount-promotions.json']);
  assert.deepEqual(JSON.parse(tree[1].content).offers[0].qualifiers,['CCTV Systems:cctv-turret1','Other category:camera']);assert.equal(JSON.parse(tree[1].content).offers[0].addons[0].key,'CCTV Systems:cctv-turret1');assert.equal(JSON.parse(tree[2].content).promotions[0].products[0].key,'CCTV Systems:cctv-turret1');
  assert.equal(calls.at(-1).body.force,false);assert.deepEqual(current().products,result.products);
  const user=sqlite.prepare('SELECT * FROM customer_users WHERE id=?').get('one');assert.equal(user.cart_version,1);
  assert.deepEqual(JSON.parse(user.cart_json),[{id:'cctv-turret1',category:category.name,quantity:3},{id:'cctv-turret1',category:'Security',quantity:4}]);
  assert.equal(sqlite.prepare('SELECT cart_version FROM customer_users WHERE id=?').get('other').cart_version,0);
  assert.equal(sqlite.prepare('SELECT cart_version FROM customer_users WHERE id=?').get('empty').cart_version,0);
  assert.deepEqual(sqlite.prepare('SELECT new_id,state FROM product_id_aliases').all().map(row=>({...row})),[{new_id:'cctv-turret1',state:'active'},{new_id:'cctv-turret1',state:'active'}]);
}));
test('Old browser writes resolve to the new ID atomically; stale versions remain protected',async()=>setup(async({env,db})=>{
  assert.equal((await handleStaff(request(change()),env)).status,200);
  assert.equal(await saveCartWithProductIds(db,'one',[{id:'camera',category:category.name,quantity:1}],0),null);
  const result=await saveCartWithProductIds(db,'empty',[{id:'camera',category:category.name,quantity:2},{id:'old-camera',category:category.name,quantity:3}],0);
  assert.deepEqual(JSON.parse(result.cart_json),[{id:'cctv-turret1',category:category.name,quantity:5}]);
  const cleared=await saveCartWithProductIds(db,'empty',[],1);assert.deepEqual(JSON.parse(cleared.cart_json),[]);
}));
test('Repeated ID changes update every older reference directly to the newest ID',async()=>setup(async({env,sqlite,db,current})=>{
  assert.equal((await handleStaff(request(change()),env)).status,200);
  const second={sha:'e'.repeat(40),product:{...current().products[0],id:'cctv-turret2'}};
  assert.equal((await handleStaff(request(second,true,'cctv-turret1'),env)).status,200);
  assert.deepEqual(sqlite.prepare('SELECT DISTINCT new_id FROM product_id_aliases').all().map(row=>row.new_id),['cctv-turret2']);
  assert.equal(sqlite.prepare('SELECT cart_version FROM customer_users WHERE id=?').get('one').cart_version,2);
  const saved=await saveCartWithProductIds(db,'empty',[{id:'old-camera',category:category.name,quantity:1}],0);assert.equal(JSON.parse(saved.cart_json)[0].id,'cctv-turret2');
}));
test('Unauthenticated, duplicate, retired and stale ID edits cannot publish',async()=>setup(async({env,calls})=>{
  assert.equal((await handleStaff(request(change(),false),env)).status,401);
  for(const id of ['other-camera','old-camera'])assert.equal((await handleStaff(request({...change(),product:{...product,id}}),env)).status,409);
  assert.equal((await handleStaff(request({...change(),sha:'9'.repeat(40)}),env)).status,409);
  assert.equal((await handleStaff(request({...change(),product:{...product,id:'INVALID ID'}}),env)).status,400);
  assert.equal(calls.some(call=>call.method==='POST'||call.method==='PATCH'),false);
  assert.equal(validateProducts([{...product,id:'other-camera'}, {...product,id:'old-camera',id_aliases:[]}],category.name),false);
}));
test('A concurrent Git publish leaves saved carts and active aliases unchanged',async()=>setup(async({env,sqlite})=>{
  assert.equal((await handleStaff(request(change()),env)).status,409);
  assert.equal(sqlite.prepare('SELECT cart_version FROM customer_users WHERE id=?').get('one').cart_version,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM product_id_aliases WHERE state='pending'").get().count,0);
},{conflict:true}));
test('Historical IDs remain reserved after the associated product is removed',async()=>setup(async({env,sqlite,calls})=>{
  sqlite.prepare("INSERT INTO product_id_aliases VALUES('cctv','retired-id','removed-product',?,'active')").run(JSON.stringify([category.name]));
  const rename=await handleStaff(request({...change(),product:{...product,id:'retired-id'}}),env);assert.equal(rename.status,409);
  const addRequest=new Request('https://auth.test/staff/categories/cctv',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify({sha,products:[product,{...product,id:'retired-id',id_aliases:[]}]})});
  assert.equal((await handleStaff(addRequest,env)).status,409);assert.equal(calls.some(call=>call.method==='POST'||call.method==='PUT'||call.method==='PATCH'),false);
}));
test('A published rename with interrupted D1 activation is recovered by retry without a second commit',async()=>setup(async({env,sqlite,calls})=>{
  const failed=await handleStaff(request(change()),env);assert.equal(failed.status,503);assert.match((await failed.json()).error,/published.*pending/);
  assert.equal(sqlite.prepare('SELECT cart_version FROM customer_users WHERE id=?').get('one').cart_version,0);
  assert.equal((await handleStaff(request(change()),env)).status,200);
  assert.equal(sqlite.prepare('SELECT cart_version FROM customer_users WHERE id=?').get('one').cart_version,1);
  assert.equal(calls.filter(call=>call.url.endsWith('/git/refs/heads/main')).length,1);
},{failActivation:true}));
