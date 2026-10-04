import {productKey,cents} from './pwp.js';
const malaysiaDate = now => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function promotionFor(product,promotions,now=new Date()) {
  if(product.price_mode!=='fixed')return null;
  const today=malaysiaDate(now);let best=null;
  for(const promotion of promotions){
    if(!promotion.enabled||today<promotion.start||today>promotion.end)continue;
    const row=promotion.products?.find(row=>row.key===productKey(product));
    // A global sales cap needs confirmed-order accounting. Only uncapped rows
    // become live until that server-side accounting/payment integration exists.
    if(!row||row.limit!==null)continue;
    const amount=row.mode==='percent'?cents(product.price*(1-row.value/100)):row.mode==='price'?cents(row.value):0;
    if(!Number.isFinite(amount)||amount<=0||amount>=cents(product.price))continue;
    if(!best||amount<cents(best.price))best={price:amount/100,name:promotion.name,start:promotion.start,end:promotion.end,label:row.mode==='percent'?`${row.value}% OFF`:'SALE'};
  }
  return best;
}
export function promotionLine(item,product,pwpChoices,promotions,now=new Date()) {
  const normal=cents(product.price),promotion=promotionFor(product,promotions,now),base=promotion?cents(promotion.price):normal,choice=pwpChoices.get(productKey(product));
  const discountedQuantity=choice&&cents(choice.price)<base?Math.min(item.quantity,choice.limit):0;
  const total=discountedQuantity*cents(choice?.price||0)+(item.quantity-discountedQuantity)*base;
  return {total,saving:normal*item.quantity-total,discountedQuantity,choice,promotion,promotionQuantity:promotion?item.quantity-discountedQuantity:0};
}
export async function loadPromotions(){const response=await fetch(new URL('data/discount-promotions.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('Could not load promotion prices. Please refresh.');const data=await response.json();if(!Array.isArray(data.promotions))throw new Error('Invalid promotion data.');return data.promotions;}
