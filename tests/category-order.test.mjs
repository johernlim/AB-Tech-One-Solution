import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleStaff} from '../auth-worker/staff.mjs';
import worker from '../auth-worker/worker.mjs';
import {applyCategoryOrder, loadLiveCategoryOrder} from '../category-order.js';
const origin='https://ab-tech-one-solution.pages.dev';
const categories=[{slug:'cctv',name:'CCTV Systems',description:'Cameras',icon:'cctv'},{slug:'wifi',name:'WiFi Solutions',description:'WiFi',icon:'wifi',visible:false,aliases:['Wireless']}];
const request=(method='GET',data,authenticated=true)=>new Request('https://auth.test/staff/categories',{method,headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+'a'.repeat(64)}:{})},...(data?{body:JSON.stringify(data)}:{})});
async function setup(run) {
  const sqlite=new DatabaseSync(':memory:');let primaryReads=0,reads=0;
  const db={prepare(sql){let args=[];const stmt={bind(...values){args=values;return stmt;},async run(){return sqlite.prepare(sql).run(...args);},async first(){if(sql.includes('JOIN staff_users'))return {id:'staff',username:'staff'};return sqlite.prepare(sql).get(...args)||null;}};return stmt;},withSession(constraint){assert.equal(constraint,'first-primary');primaryReads++;return db;}};
  const env={STAFF_DB:db,STAFF_PASSWORD_PEPPER:'p'.repeat(32),ALLOWED_ORIGIN:origin,GITHUB_REPO:'owner/repo',GITHUB_CATALOGUE_TOKEN:'test-only-token'};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{assert.match(String(url),/contents\/data\/categories.json/);assert.equal(options.method,undefined);reads++;return Response.json({sha:'b'.repeat(40),content:Buffer.from(JSON.stringify({categories})).toString('base64')});};
  try{await run(env,sqlite,()=>({primaryReads,reads}));}finally{globalThis.fetch=original;sqlite.close();}
}
const data=(order=['wifi','cctv'],orderVersion=0)=>({sha:'b'.repeat(40),order,orderVersion});
test('Save is immediately public without GitHub mutations and survives admin reload',async()=>setup(async(env,sqlite,counts)=>{
  assert.deepEqual((await(await handleStaff(request(),env)).json()).categories,categories);
  const saved=await handleStaff(request('PATCH',data()),env);assert.equal(saved.status,200);
  const result=await saved.json();assert.equal(result.orderVersion,1);assert.equal(result.sha,'b'.repeat(40));assert.deepEqual(result.categories,[categories[1],categories[0]]);
  const publicResponse=await worker.fetch(new Request('https://auth.test/public/category-order'),env);
  assert.equal(publicResponse.headers.get('Cache-Control'),'no-store');assert.equal(publicResponse.headers.get('Access-Control-Allow-Origin'),'*');assert.deepEqual(await publicResponse.json(),{order:['wifi','cctv']});
  const reloaded=await(await handleStaff(request(),env)).json();assert.equal(reloaded.orderVersion,1);assert.deepEqual(reloaded.categories,result.categories);
  assert.equal(sqlite.prepare('SELECT version FROM category_order').get().version,1);assert.ok(counts().primaryReads>=4);
}));
test('Unauthorized, invalid, stale registry and concurrent order saves are rejected',async()=>setup(async(env)=>{
  assert.equal((await handleStaff(request('PATCH',data(),false),env)).status,401);
  for(const order of [[],['wifi','wifi'],['unknown','cctv'],[123,'cctv']])assert.equal((await handleStaff(request('PATCH',data(order)),env)).status,400);
  assert.equal((await handleStaff(request('PATCH',{...data(),orderVersion:-1}),env)).status,400);
  assert.equal((await handleStaff(request('PATCH',{...data(),sha:'c'.repeat(40)}),env)).status,409);
  assert.equal((await handleStaff(request('PATCH',data(undefined,2)),env)).status,409);
  const results=await Promise.all([handleStaff(request('PATCH',data()),env),handleStaff(request('PATCH',data(['cctv','wifi'])),env)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await handleStaff(request('PATCH',data(['cctv','wifi'],1)),env)).status,200);
  assert.equal((await worker.fetch(new Request('https://auth.test/public/category-order',{method:'POST'}),env)).status,405);
}));
test('Saved order ignores removed IDs, keeps hidden metadata and appends new categories',()=>{
  const added={slug:'new',name:'New category'};
  assert.deepEqual(applyCategoryOrder([...categories,added],['deleted','wifi','cctv']),[categories[1],categories[0],added]);
  assert.deepEqual(applyCategoryOrder(categories,[]),categories);
});
test('Public failure does not expose errors and client falls back to deployment order',async()=>{
  const response=await worker.fetch(new Request('https://auth.test/public/category-order'),{});assert.equal(response.status,503);
  const original=globalThis.fetch;try{
    for(const response of [Response.json({error:'Unavailable'},{status:503}),Response.json({order:'invalid'})]){globalThis.fetch=async()=>response;assert.deepEqual(await loadLiveCategoryOrder(),[]);}
    globalThis.fetch=async()=>{throw new Error('Offline');};assert.deepEqual(await loadLiveCategoryOrder(),[]);
  }finally{globalThis.fetch=original;}
});
