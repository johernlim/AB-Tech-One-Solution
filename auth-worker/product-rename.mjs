import {readCategories} from './categories.mjs';
import {identityDatabase, activateProductAlias, reconcileProductAliases, reservedProductId} from './product-identities.mjs';
const encoder = new TextEncoder();
const decode = content => new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g,'')), c=>c.charCodeAt(0)));
function encode(text) {const bytes=encoder.encode(text),parts=[];for(let start=0;start<bytes.length;start+=16384)parts.push(String.fromCharCode(...bytes.subarray(start,start+16384)));return btoa(parts.join(''));}
function api(env,path,options={}) {return fetch('https://api.github.com/repos/'+env.GITHUB_REPO+'/'+path,{...options,headers:{Authorization:'Bearer '+env.GITHUB_CATALOGUE_TOKEN,Accept:'application/vnd.github+json','User-Agent':'AB-Tech-Staff','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}});}
export async function renameProduct(env,user,slug,from,data,validateProducts) {
  const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  if(!/^[a-f0-9]{40}$/.test(data.sha||'') || !data.product || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.product.id||'') || data.product.id.length>80 || data.product.id===from)return json({error:'Enter a different Product ID using lowercase letters, numbers and hyphens (up to 80 characters).'},400);
  const ref=await api(env,'git/ref/heads/main');if(!ref.ok)return json({error:'Could not load the publishing branch.'},502);
  const head=(await ref.json()).object.sha;
  const registry=await readCategories(env,head),category=registry.categories.find(c=>c.slug===slug);
  if(!category)return json({error:'Category not found.'},404);
  const path='data/categories/'+slug+'.json';
  const response=await api(env,'contents/'+path+'?ref='+head);if(!response.ok)return json({error:'Could not load this category’s products.'},502);
  const file=await response.json(),source=JSON.parse(decode(file.content)),products=source.products;
  const original=products.find(p=>p.id===from),to=data.product.id;
  if(!original){
    // A retry after Git succeeded must finish cart synchronization without repeating the rename.
    const renamed=products.find(p=>p.id===to&&(p.id_aliases||[]).includes(from));
    if(renamed){await reconcileProductAliases(env,category,products);return json({products,sha:file.sha,message:'Product ID is updated. Saved cart references are synchronized. Refresh the category to review the latest product details.'});}
    return json({error:'Product not found. Reload this category.'},404);
  }
  if(file.sha!==data.sha)return json({error:'These products changed since you opened them. Reload this category before publishing.'},409);
  if(products.some(p=>p.id===to||(p.id_aliases||[]).includes(to)))return json({error:'That Product ID is already used or reserved by a previous ID. Choose another ID.'},409);
  if(await reservedProductId(env,slug,[to]))return json({error:'That Product ID is reserved by a previous ID. Choose another ID.'},409);
  const aliases=[...new Set([...(original.id_aliases||[]),from])];
  if(aliases.length>100)return json({error:'This product has reached its ID rename history limit.'},400);
  const product={...original,...data.product,id_aliases:aliases};
  const next=products.map(p=>p.id===from?product:p);
  if(!validateProducts(next,category.name))return json({error:'Check the product fields and unique IDs before publishing.'},400);
  const entries=[],names=[category.name,...(category.aliases||[])];
  const oldKeys=new Set(names.flatMap(name=>[from,...(original.id_aliases||[])].map(id=>name+':'+id)));
  const replace=key=>oldKeys.has(key)?category.name+':'+to:key;
  for(const [offerPath,key,transform] of [
    ['data/pwp-offers.json','offers',offer=>({...offer,qualifiers:[...new Set(offer.qualifiers.map(replace))],addons:offer.addons.map(addon=>({...addon,key:replace(addon.key)}))})],
    ['data/discount-promotions.json','promotions',promotion=>({...promotion,products:promotion.products.map(row=>({...row,key:replace(row.key)}))})]
  ]){
    const response=await api(env,'contents/'+offerPath+'?ref='+head);
    if(response.status===404)continue;if(!response.ok)return json({error:'Could not load product promotion references.'},502);
    const source=JSON.parse(decode((await response.json()).content)),updated=source[key].map(transform);
    if(JSON.stringify(updated)!==JSON.stringify(source[key]))entries.push({path:offerPath,mode:'100644',type:'blob',content:JSON.stringify({...source,[key]:updated},null,2)+'\n'});
  }
  const base=await api(env,'git/commits/'+head);if(!base.ok)return json({error:'Could not prepare the product update.'},502);
  const blob=await api(env,'git/blobs',{method:'POST',body:JSON.stringify({content:encode(JSON.stringify({...source,products:next},null,2)+'\n'),encoding:'base64'})});if(!blob.ok)return json({error:'Could not save the product update.'},502);
  const productSha=(await blob.json()).sha;
  const tree=await api(env,'git/trees',{method:'POST',body:JSON.stringify({base_tree:(await base.json()).tree.sha,tree:[{path,mode:'100644',type:'blob',sha:productSha},...entries]})});if(!tree.ok)return json({error:'Could not prepare the product references.'},502);
  const commit=await api(env,'git/commits',{method:'POST',body:JSON.stringify({message:'Rename product ID '+from+' to '+to+' by '+user.username,tree:(await tree.json()).sha,parents:[head]})});if(!commit.ok)return json({error:'Could not create the product update.'},502);
  const db=await identityDatabase(env);
  const staged=await db.prepare("INSERT INTO product_id_aliases(category_slug,old_id,new_id,category_names,state) VALUES(?,?,?,?,'pending') ON CONFLICT(category_slug,old_id) DO UPDATE SET new_id=excluded.new_id,category_names=excluded.category_names WHERE product_id_aliases.state='pending' AND product_id_aliases.new_id=excluded.new_id RETURNING old_id").bind(slug,from,to,JSON.stringify(names)).first();
  if(!staged)return json({error:'An ID change is already in progress. Reload this category.'},409);
  const update=await api(env,'git/refs/heads/main',{method:'PATCH',body:JSON.stringify({sha:(await commit.json()).sha,force:false})});
  if(!update.ok){
    if([409,422].includes(update.status))await db.prepare("DELETE FROM product_id_aliases WHERE category_slug=? AND old_id=? AND new_id=? AND state='pending'").bind(slug,from,to).run();
    return json({error:[409,422].includes(update.status)?'The website changed during publishing. Reload this category and try again.':'Could not confirm the Product ID publish. Reload this category and check before trying again.'},[409,422].includes(update.status)?409:502);
  }
  try {await activateProductAlias(env,category,from,to);}
  catch {return json({error:'The Product ID was published, but saved cart synchronization is pending. Reload this category to complete synchronization.'},503);}
  return json({products:next,sha:productSha,message:'Product ID, saved carts and promotion references updated. The website will show the new ID after deployment.'});
}
