import {renderCatalogue} from '../catalogue-render.mjs';
export async function onRequest(context) {
  const url=new URL(context.request.url);
  if(!['/catalogue','/catalogue.html'].includes(url.pathname)||context.request.method!=='GET'||(!url.searchParams.has('category')&&url.searchParams.get('view')!=='all'))return context.next();
  const response=await context.next();
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
  try {
    const read=async path=>{const response=await context.env.ASSETS.fetch(new URL(path,url));if(!response.ok)throw new Error('Catalogue asset unavailable');return response.json();};
    const [registry,promotionData,offerData]=await Promise.all([read('/data/categories.json'),read('/data/discount-promotions.json'),read('/data/pwp-offers.json')]);
    const categories=registry.categories.filter(c=>c.visible!==false);
    const requested=url.searchParams.get('category');
    const selected=categories.find(c=>c.name===requested||(c.aliases||[]).includes(requested));
    if(requested&&!selected)return response;
    const groups=await Promise.all((selected?[selected]:categories).map(async c=>{
      if(!/^[a-z0-9-]+$/.test(c.slug))throw new Error('Invalid category slug');
      const data=await read('/data/categories/'+c.slug+'.json');
      return data.products.filter(p=>p.published===true).map(p=>({...p,category:c.name}));
    }));
    const snapshot={categories,products:groups.flat(),promotions:promotionData.promotions,offers:offerData.offers};
    const html=renderCatalogue(await response.clone().text(),snapshot,selected);
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('Cache-Control','public, max-age=0, must-revalidate');headers.set('X-Catalogue-Rendered','server');
    return new Response(html,{status:200,headers});
  }catch(error){console.error('Catalogue rendering failed:',error.message);return response;}
}
