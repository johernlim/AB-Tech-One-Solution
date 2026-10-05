import {readCategories} from './categories.mjs';
import {reservedProductId} from './product-identities.mjs';
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fields = ['name','description','price','price_mode','image','published','new_arrival','availability','installation','specifications'];
async function git(env,path,options={}) {
  const response=await fetch('https://api.github.com/repos/'+env.GITHUB_REPO+'/'+path,{...options,headers:{Authorization:'Bearer '+env.GITHUB_CATALOGUE_TOKEN,Accept:'application/vnd.github+json','User-Agent':'AB-Tech-Staff','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok){const error=new Error([409,422].includes(response.status)?'The catalogue changed during publishing. Reload and review your file again.':'Could not publish the batch. Reload the catalogue before retrying.');error.status=[409,422].includes(response.status)?409:502;throw error;}
  return response.json();
}
export async function publishBulk(env,user,data,validateProducts) {
  try {
    if(!['add','edit','mixed'].includes(data.mode)||!Array.isArray(data.changes)||!data.changes.length||data.changes.length>20||!data.changes.every(c=>c&&typeof c.slug==='string'&&/^[a-f0-9]{40}$/.test(c.sha||'')&&Array.isArray(c.products)&&c.products.length>0)||data.changes.reduce((n,c)=>n+c.products.length,0)>250||new Set(data.changes.map(c=>c.slug)).size!==data.changes.length)return json({error:'Use 1–250 products across at most 20 categories per batch.'},400);
    const head=(await git(env,'git/ref/heads/main')).object.sha;
    const registry=await readCategories(env,head);
    if(registry.sha!==data.categoriesSha)return json({error:'Categories changed. Reload the catalogue and review your file again.'},409);
    const tree=[];let count=0;
    for(const change of data.changes){
      const category=registry.categories.find(c=>c.slug===change.slug);
      if(!category)return json({error:'A selected category no longer exists.'},400);
      const file=await git(env,'contents/data/categories/'+category.slug+'.json?ref='+head);
      if(file.sha!==change.sha)return json({error:category.name+' changed. Reload the catalogue and review your file again.'},409);
      const source=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
      const products=source.products.slice(),seen=new Set();
      let changed=false;
      for(const row of change.products){
        if(!row||typeof row.id!=='string'||seen.has(row.id)||row.category!==category.name)return json({error:'Duplicate IDs or invalid category in batch.'},400);
        seen.add(row.id);const index=products.findIndex(p=>p.id===row.id);
        const mode=data.mode==='mixed'?({add:'add',update:'edit',delete:'delete'}[row.action]):data.mode;
        if(!mode)return json({error:'Each row must use Add, Update or Delete.'},400);
        if(mode==='delete'){
          if(index<0)return json({error:'Product '+row.id+' no longer exists. Reload the catalogue before deleting.'},409);
          products.splice(index,1);count++;changed=true;continue;
        }
        if(mode==='add'&&index>=0||mode==='edit'&&index<0)return json({error:'Product '+row.id+(index>=0?' already exists. Use Update.':' does not exist. Use Add.')},400);
        const product=index<0?{id:row.id,category:category.name,gallery:[],example:false}: {...products[index]};
        for(const field of fields)if(Object.hasOwn(row,field))product[field]=row[field];
        if(index>=0&&JSON.stringify(product)===JSON.stringify(products[index]))continue;
        if(index<0)products.push(product);else products[index]=product;count++;changed=true;
      }
      if(!validateProducts(products,category.name))return json({error:'Invalid product data or more than 250 products in '+category.name+'.'},400);
      if(await reservedProductId(env,category.slug,products.map(product=>product.id)))return json({error:'A Product ID in '+category.name+' is reserved by a previous ID. Choose another ID.'},409);
      if(changed)tree.push({path:'data/categories/'+category.slug+'.json',mode:'100644',type:'blob',content:JSON.stringify({...source,products},null,2)+'\n'});
    }
    if(!count)return json({count:0,message:'No changes found. Unchanged products were skipped.'});
    const base=(await git(env,'git/commits/'+head)).tree.sha;
    const nextTree=await git(env,'git/trees',{method:'POST',body:JSON.stringify({base_tree:base,tree})});
    const commit=await git(env,'git/commits',{method:'POST',body:JSON.stringify({message:'Mass '+(data.mode==='mixed'?'add and update':data.mode==='add'?'upload':'edit')+' '+count+' products by '+user.username,tree:nextTree.sha,parents:[head]})});
    await git(env,'git/refs/heads/main',{method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});
    return json({count,commit:commit.sha,message:count+' products published together. The website will update after deployment.'});
  }catch(error){return json({error:error.message},error.status||502);}
}
