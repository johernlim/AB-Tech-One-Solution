import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePromotions,readPromotions,publishPromotions} from '../auth-worker/promotions.mjs';
const products=[{id:'camera',category:'CCTV Systems',price:100,price_mode:'fixed'},{id:'card',category:'PWP Products',price:35,price_mode:'fixed'}];
const promotion=()=>({id:'october-sale',name:'October sale',start:'2026-10-04',end:'2026-10-31',enabled:true,products:[{key:'CCTV Systems:camera',mode:'price',value:80,limit:100},{key:'PWP Products:card',mode:'percent',value:10,limit:null}]});
test('Multiple products support special prices, percentages, total caps and no limit',()=>assert.equal(validatePromotions([promotion()],products),true));
test('Reject invalid dates and reversed promotion periods',()=>{for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-11-01','2026-10-31']]){const p=promotion();Object.assign(p,{start,end});assert.equal(validatePromotions([p],products),false);}});
test('Reject duplicate products, missing products and non-fixed prices',()=>{const p=promotion();p.products.push({...p.products[0]});assert.equal(validatePromotions([p],products),false);assert.equal(validatePromotions([promotion()],products.slice(1)),false);assert.equal(validatePromotions([promotion()],products.map(p=>({...p,price_mode:'quote'}))),false);});
test('Discounts must be positive and lower than normal prices; caps must be positive integers',()=>{for(const values of [{value:100},{value:0},{limit:0},{limit:1.5},{mode:'percent',value:100}]){const p=promotion();Object.assign(p.products[0],values);assert.equal(validatePromotions([p],products),false);}});
test('Promotion settings read and publish through GitHub with stale-edit protection',async()=>{
 const original=globalThis.fetch,env={GITHUB_REPO:'test/catalogue',GITHUB_CATALOGUE_TOKEN:'test-token'};let conflict=false,written;
 const file=data=>Response.json({sha:'a'.repeat(40),content:Buffer.from(JSON.stringify(data)).toString('base64')});
 globalThis.fetch=async(url,options={})=>{
  assert.equal(options.headers.Authorization,'Bearer test-token');const path=new URL(url).pathname;
  if(path.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'b'.repeat(40)}});
  if(path.endsWith('categories.json'))return file({categories:[{name:'CCTV Systems',slug:'cctv',description:'Cameras',icon:'cctv'},{name:'PWP Products',slug:'pwp',description:'Add-ons',icon:'pos'}]});
  if(path.endsWith('/cctv.json'))return file({products:[{...products[0],published:true}]});if(path.endsWith('/pwp.json'))return file({products:[{...products[1],published:true}]});
  if(options.method==='PUT'){written=JSON.parse(options.body);return conflict?new Response('',{status:409}):Response.json({content:{sha:'c'.repeat(40)}});}
  return file({promotions:[]});
 };
 try{assert.deepEqual((await readPromotions(env)).promotions,[]);const result=await publishPromotions(env,{username:'staff'},{sha:'a'.repeat(40),promotions:[promotion()]});assert.equal(result.status,200);assert.deepEqual(JSON.parse(Buffer.from(written.content,'base64').toString()).promotions,[promotion()]);conflict=true;assert.equal((await publishPromotions(env,{username:'staff'},{sha:'a'.repeat(40),promotions:[promotion()]})).status,409);}finally{globalThis.fetch=original;}
});
