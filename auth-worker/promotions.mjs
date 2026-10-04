import {pwpCatalogue} from './pwp.mjs';
import {productKey, cents} from '../pwp.js';
const path = 'data/discount-promotions.json';
function github(env, file, options = {}) {
  return fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/contents/' + file, {...options, headers:{Authorization:'Bearer ' + env.GITHUB_CATALOGUE_TOKEN, Accept:'application/vnd.github+json', 'User-Agent':'AB-Tech-Staff', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json'}});
}
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function validatePromotions(promotions, products) {
  if (!Array.isArray(promotions) || promotions.length > 50) return false;
  const catalogue = new Map(products.map(p => [productKey(p),p])), ids = new Set();
  return promotions.every(p => {
    if (!p || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id || '') || p.id.length > 80 || ids.has(p.id)) return false;
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 || typeof p.enabled !== 'boolean' || !date(p.start) || !date(p.end) || p.start > p.end) return false;
    if (!Array.isArray(p.products) || !p.products.length || p.products.length > 100 || new Set(p.products.map(v => v?.key)).size !== p.products.length) return false;
    return p.products.every(row => {
      const product = catalogue.get(row?.key);
      if (!product || product.price_mode !== 'fixed' || cents(product.price) <= 1 || !Number.isFinite(row.value) || row.value <= 0 || !(row.limit === null || Number.isInteger(row.limit) && row.limit > 0 && row.limit <= 1000000)) return false;
      return row.mode === 'price' ? cents(row.value) > 0 && cents(row.value) < cents(product.price) && Math.abs(row.value * 100 - cents(row.value)) < .00001 : row.mode === 'percent' && row.value < 100 && cents(product.price * (1-row.value/100)) > 0;
    });
  });
}
export async function readPromotions(env) {
  const response = await github(env,path+'?ref=main');
  if (!response.ok) throw new Error('Could not load discount promotions.');
  const file = await response.json();
  const text = new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0)));
  return {sha:file.sha,promotions:JSON.parse(text).promotions};
}
export async function publishPromotions(env,user,data) {
  const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  if (!/^[a-f0-9]{40}$/.test(data.sha || '')) return json({error:'Reload promotions before saving.'},400);
  const headResponse=await fetch('https://api.github.com/repos/'+env.GITHUB_REPO+'/git/ref/heads/main',{headers:{Authorization:'Bearer '+env.GITHUB_CATALOGUE_TOKEN,'User-Agent':'AB-Tech-Staff'}});
  if(!headResponse.ok)return json({error:'Could not check current products.'},502);
  const products=await pwpCatalogue(env,(await headResponse.json()).object.sha);
  if (!validatePromotions(data.promotions,products)) return json({error:'Check the name, dates, selected products, discounts and total sales limits. Use visible products with fixed prices and a discount below the normal price.'},400);
  const promotions=data.promotions.map(p=>({id:p.id,name:p.name.trim(),start:p.start,end:p.end,enabled:p.enabled,products:p.products.map(({key,mode,value,limit})=>({key,mode,value,limit}))}));
  const bytes=new TextEncoder().encode(JSON.stringify({promotions},null,2)+'\n'),parts=[];
  for(let i=0;i<bytes.length;i+=16384)parts.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  const response=await github(env,path,{method:'PUT',body:JSON.stringify({branch:'main',sha:data.sha,message:'Update discount promotions by '+user.username,content:btoa(parts.join(''))})});
  if ([409,422].includes(response.status)) return json({error:'Promotions changed. Reload before saving.'},409);
  if (!response.ok) return json({error:'Could not save promotions. Please try again.'},502);
  return json({sha:(await response.json()).content.sha,promotions,message:'Published to GitHub. No-limit promotions apply after deployment during their dates; capped promotions need completed-payment tracking.'});
}
