export const columns=['Category ID','Product ID','Product Name','Model Number','Price (RM)','Price Type','Visible','New Arrival','Image Filename','Availability','Installation','Specifications','Version'];
export const combinedColumns=['Action','Category',...columns.slice(1)];
export function combinedExportRow(category,product,sha){const row=exportRow(category,product,sha);row[0]=category.name;return ['Skip',...row];}
export const editableFields=['name','description','price','price_mode','published','new_arrival','image','availability','installation','specifications'];
const text=value=>String(value??'').trim();
const bool=(value,fallback)=>!text(value)?fallback:/^(yes|true|1)$/i.test(text(value))?true:/^(no|false|0)$/i.test(text(value))?false:null;
export function exportRow(category,product,sha){return [category.slug,product.id,product.name,product.description,product.price,product.price_mode,product.published?'Yes':'No',(product.new_arrival??product.example)?'Yes':'No','',product.availability,product.installation,(product.specifications||[]).join(' | '),sha];}
export function reviewRows(rows,batchMode,catalogue,photos=new Map()){
  const errors=[],items=[],seen=new Set(),counts=new Map();
  if(!rows.length||rows.length>250)return {errors:['Use 1–250 product rows per batch.'],items:[]};
  rows.forEach((values,index)=>{
    if((batchMode==='mixed'?values.slice(1):values).every(value=>!text(value)))return;
    const row=Object.fromEntries((batchMode==='mixed'?combinedColumns:columns).map((key,i)=>[key,text(values[i])])),line=index+2;
    const fail=message=>errors.push('Row '+line+': '+message);
    const group=catalogue.find(c=>batchMode==='mixed'?c.name===row.Category:c.slug===row['Category ID']);
    if(!group){fail('Choose an existing Category from the Categories sheet.');return;}
    // Identity and the saved version decide the action, never a spreadsheet label.
    const existing=group.products.find(p=>p.id===row['Product ID']);
    const mode=batchMode==='mixed'?(row.Version||existing?'edit':'add'):batchMode;
    if(mode==='add'&&row.Version){fail('For Add, leave Version blank. Use Update for existing rows.');return;}
    const generated=batchMode==='mixed'&&mode==='add'&&!row['Product ID'];
    const id=generated?'product-'+crypto.randomUUID():row['Product ID'],key=group.slug+':'+id;
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)||id.length>80){fail('Product ID needs lowercase letters, numbers and hyphens (maximum 80 characters).');return;}
    if(seen.has(key)){fail('Duplicate product ID in this category.');return;}seen.add(key);
    const original=group.products.find(p=>p.id===id);
    if(mode==='add'&&original){fail('Product already exists. Use Update.');return;}
    if(mode==='edit'&&!original){fail('Product not found. Do not change its Category ID or Product ID.');return;}
    if(mode==='edit'&&row.Version!==group.sha){fail('This export is out of date. Download a fresh products file.');return;}
    const defaults={id,category:group.name,name:'',description:'',price:0,price_mode:'fixed',published:true,new_arrival:false,image:'',availability:'Contact us to confirm availability',installation:'Installation quoted separately.',specifications:[],gallery:[],example:false};
    const product={...(original||defaults)};
    product.specifications=product.specifications||[];
    for(const [column,field] of [['Product Name','name'],['Model Number','description'],['Availability','availability'],['Installation','installation']]){
      if(row[column]||mode==='add'&&['name','description'].includes(field))product[field]=row[column];
      if(!product[field]?.trim()||product[field].length>5000)fail(column+' is required and must be at most 5,000 characters.');
    }
    if(row['Price Type'])product.price_mode=row['Price Type'].toLowerCase();
    if(!['fixed','from','quote'].includes(product.price_mode))fail('Price Type must be fixed, from or quote.');
    if(row['Price (RM)']){
      if(!/^\d+(\.\d{1,2})?$/.test(row['Price (RM)'])||Number(row['Price (RM)'])>10000000)fail('Price must be 0–10,000,000 with at most two decimal places, without RM or commas.');
      else product.price=Number(row['Price (RM)']);
    }else if(mode==='add'&&product.price_mode!=='quote')fail('Price (RM) is required.');
    for(const [column,field] of [['Visible','published'],['New Arrival','new_arrival']]){
      product[field]=bool(row[column],product[field]??product.example??false);
      if(product[field]===null)fail(column+' must be Yes or No.');
    }
    if(row.Specifications && row.Specifications !== (original?.specifications||[]).join(' | '))product.specifications=row.Specifications.split('|').map(text).filter(Boolean);
    if(product.specifications.length>50||product.specifications.some(s=>s.length>500))fail('Use at most 50 specifications, each under 501 characters.');
    let photo=null;
    if(row['Image Filename']){
      photo=photos.get(row['Image Filename'].toLowerCase());
      if(!photo)fail('Select the photo named '+row['Image Filename']+'.');
      else if(photo.error)fail(photo.error);
    }else if(mode==='add')fail('Image Filename is required for a new product.');
    const changes=editableFields.filter(field=>{
      if(field==='image')return Boolean(photo);
      const previous=field==='new_arrival'?(original?.new_arrival??original?.example??false):field==='specifications'?(original?.specifications||[]):original?.[field];
      return JSON.stringify(product[field])!==JSON.stringify(previous);
    });
    if(mode==='add')counts.set(group.slug,(counts.get(group.slug)||0)+1);
    items.push({line,slug:group.slug,product,original,photo,changes,action:mode==='add'?'add':'update',generated});
  });
  for(const group of catalogue)if(group.products.length+(counts.get(group.slug)||0)>250)errors.push(group.name+' would exceed 250 products.');
  if(new Set(items.filter(i=>i.changes.length).map(i=>i.slug)).size>20)errors.push('Use at most 20 categories per batch.');
  return {errors,items};
}
