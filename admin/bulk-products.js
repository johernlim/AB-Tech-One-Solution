import {columns,exportRow,reviewRows,editableFields} from './bulk-products-core.js';
let library;
function excel(){
  if(!library)library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/xlsx-0.20.3.min.js',import.meta.url);script.onload=()=>resolve(window.XLSX);script.onerror=()=>{library=null;script.remove();reject(new Error('Excel tools could not load. Please try again.'));};document.head.append(script);});
  return library;
}
function parseWorkbook(file){return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./bulk-workbook-worker.js',import.meta.url));
  const timer=setTimeout(()=>finish(new Error('This workbook took too long to read. Use a smaller file with values only.')),15000);
  function finish(error,rows){clearTimeout(timer);worker.terminate();error?reject(error):resolve(rows);}
  worker.onmessage=event=>finish(event.data.error?new Error(event.data.error):null,event.data.rows);
  worker.onerror=()=>finish(new Error('Unable to read this workbook. Download a fresh template.'));
  file.arrayBuffer().then(data=>worker.postMessage(data,[data])).catch(error=>finish(error));
});}
export function setupBulkProducts(api,isBusy,setBusy,upload){
  const content=document.querySelector('.staff-content'),sidebar=document.querySelector('.staff-category-sidebar');
  const open=document.createElement('button');open.type='button';open.id='staff-bulk-open';open.className='button secondary';open.textContent='Mass Upload / Edit';sidebar.append(open);
  const pane=document.createElement('section');pane.className='bulk-admin';pane.hidden=true;
  pane.innerHTML=`<div class="staff-content-heading"><div><span class="eyebrow">Staff workspace</span><h2>Mass Upload / Edit</h2></div><button type="button" class="button secondary" data-reload>Reload catalogue</button></div>
  <p class="field-help">Add or update products in Excel, review every change, then publish the batch together.</p>
  <div class="account-tabs bulk-tabs" role="tablist" aria-label="Bulk action"><button type="button" role="tab" aria-selected="true" data-mode="add">Mass Upload</button><button type="button" role="tab" aria-selected="false" data-mode="edit">Mass Edit</button></div>
  <div class="bulk-step"><h3>1. Download your Excel file</h3><p class="field-help" data-mode-help></p><label>Category<select data-scope aria-label="Export category"></select></label><button type="button" class="button secondary" data-download>Download template</button><p class="field-help">Up to 250 products across 20 categories per batch. Each category holds at most 250 products. IDs stay fixed when editing. Products omitted from an edit file are kept.</p></div>
  <div class="bulk-step"><h3>2. Choose your file and photos</h3><label>Completed Excel file<input type="file" data-workbook accept=".xlsx" aria-label="Completed Excel file"></label><p class="field-help">.xlsx only, up to 5 MB. Use the Products sheet and keep its headers. Enter values, not formulas.</p><label>Product photos<input type="file" data-photos multiple accept="image/jpeg,image/png,image/webp" aria-label="Product photos"></label><p class="field-help">Match each Image Filename exactly to a selected photo. JPG, PNG or WebP, smaller than 1 MB each, up to 8192 × 8192 pixels. Choose up to 250 photos (50 MB total). In Mass Edit, leave Image Filename blank to keep the current image.</p><button type="button" class="button" data-review>Review products</button></div>
  <p class="account-message" role="status" data-status></p><div data-errors class="bulk-errors" hidden></div>
  <div data-preview hidden><h3>3. Review and publish</h3><p data-summary class="field-help"></p><div class="bulk-table-wrap"><table class="bulk-table"><thead><tr><th>Row / Product</th><th>Category</th><th>Photo</th><th>Changes</th></tr></thead><tbody data-rows></tbody></table></div><p class="field-help">Only the changes above will be published. Existing product IDs, category visibility, PWP offers and discount settings are preserved.</p><button type="button" class="button" data-publish>Confirm &amp; publish</button></div>`;
  content.append(pane);const $=selector=>pane.querySelector(selector);
  let mode='add',catalogue=[],categoriesSha,plan=null,urls=[];
  const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  function status(message,error=false){$('[data-status]').textContent=message;$('[data-status]').dataset.error=String(error);}
  function clear(){plan=null;urls.forEach(URL.revokeObjectURL);urls=[];$('[data-preview]').hidden=true;$('[data-rows]').replaceChildren();$('[data-errors]').hidden=true;$('[data-errors]').replaceChildren();}
  function controls(disabled){for(const node of pane.querySelectorAll('button,input,select'))node.disabled=disabled;}
  function hide(){if(isBusy())return;pane.hidden=true;open.setAttribute('aria-pressed','false');}
  sidebar.addEventListener('click',event=>{if(event.target.closest('#staff-categories button,#staff-pwp-open,#staff-promotions-open'))hide();},true);
  function setMode(next){mode=next;clear();$('[data-scope]').closest('label').hidden=mode==='add';status('');$('[data-workbook]').value='';$('[data-photos]').value='';for(const button of pane.querySelectorAll('[data-mode]'))button.setAttribute('aria-selected',String(button.dataset.mode===mode));$('[data-mode-help]').textContent=mode==='add'?'Download a blank template. The Categories sheet lists valid category IDs. Add one new product per row.':'Export current products, change the fields you need, then upload the file. Blank editable cells keep their current values. Do not change IDs or Version.';$('[data-download]').textContent=mode==='add'?'Download template':'Export products for editing';}
  async function load(){
    clear();catalogue=[];categoriesSha=null;setBusy(true);controls(true);status('Loading categories and products…');
    try{
      const registry=await api('categories');categoriesSha=registry.sha;
      // Limit concurrent reads to keep large catalogues responsive.
      for(let offset=0;offset<registry.categories.length;offset+=4){const batch=await Promise.all(registry.categories.slice(offset,offset+4).map(async category=>({...category,...await api('categories/'+category.slug)})));catalogue.push(...batch);}
      $('[data-scope]').replaceChildren(new Option('All categories',''),...catalogue.map(c=>new Option(c.name+(c.visible===false?' (hidden)':''),c.slug)));
      status(catalogue.reduce((n,c)=>n+c.products.length,0)+' products loaded.');
    }catch(error){categoriesSha=null;catalogue=[];status(error.message,true);}
    finally{setBusy(false);controls(false);$('[data-download]').disabled=$('[data-review]').disabled=!categoriesSha;}
  }
  for(const button of pane.querySelectorAll('[data-mode]'))button.onclick=()=>{if(!isBusy())setMode(button.dataset.mode);};
  $('[data-reload]').onclick=()=>{if(!isBusy())load();};
  for(const selector of ['[data-workbook]','[data-photos]'])$(selector).onchange=()=>{clear();status('Files changed. Review products before publishing.');};
  $('[data-download]').onclick=async()=>{
    if(isBusy()||!categoriesSha)return;setBusy(true);controls(true);
    try{
      const XLSX=await excel(),groups=catalogue.filter(c=>!$('[data-scope]').value||c.slug===$('[data-scope]').value);
      const rows=mode==='edit'?groups.flatMap(c=>c.products.map(p=>exportRow(c,p,c.sha))):[];
      if(rows.length>250)throw new Error('This selection has more than 250 products. Choose one category to export.');
      if(mode==='edit'&&!rows.length)throw new Error('There are no products to edit in this selection.');
      const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([columns,...rows]);sheet['!cols']=columns.map((_,i)=>({wch:[23,28,38,30,16,16,12,14,32,40,40,45,43][i]}));sheet['!autofilter']={ref:XLSX.utils.encode_range({r:0,c:0},{r:Math.max(rows.length,1),c:columns.length-1})};
      XLSX.utils.book_append_sheet(workbook,sheet,'Products');
      const cats=XLSX.utils.aoa_to_sheet([['Category ID','Category Name','Shown on website'],...catalogue.map(c=>[c.slug,c.name,c.visible===false?'No':'Yes'])]);cats['!cols']=[{wch:25},{wch:40},{wch:24}];XLSX.utils.book_append_sheet(workbook,cats,'Categories');
      const notes=[['AB TECH — '+(mode==='add'?'MASS UPLOAD':'MASS EDIT')],['Fill only the Products sheet. One product per row. Maximum 250 rows across 20 categories.'],['Category ID: copy from Categories. Product ID: unique within that category; lowercase letters, numbers and hyphens.'],['Product Name and Model Number are required for new products.'],['Price (RM): numbers only, maximum two decimal places. Price Type: fixed, from or quote.'],['Visible and New Arrival: Yes or No. New products default to Visible Yes and New Arrival No.'],['Image Filename: photo filename including extension (e.g. camera.png). Select matching photos in admin.'],['Photos: JPG, PNG or WebP, smaller than 1 MB each; maximum 8192 × 8192 pixels.'],['Availability and Installation: optional on new products; sensible defaults are applied.'],['Specifications: separate entries with |.'],['Mass Edit: do not change Category ID, Product ID or Version. Blank editable cells preserve existing values.'],['Mass Edit: blank Image Filename keeps the current image; enter a filename only to replace it.'],['Deleting spreadsheet rows does NOT delete products. Use the normal product editor for deletion or category changes.'],['Keep Version unchanged. If the category changed since export, download a fresh file.'],['Use values only, no formulas. Fix every error before publishing. Photos are uploaded only after confirmation.']];
      const instructions=XLSX.utils.aoa_to_sheet(notes);instructions['!cols']=[{wch:125}];XLSX.utils.book_append_sheet(workbook,instructions,'Instructions');
      XLSX.writeFile(workbook,mode==='add'?'AB-Tech-Mass-Upload.xlsx':'AB-Tech-Mass-Edit.xlsx',{compression:true});status('Excel file downloaded.');
    }catch(error){status(error.message,true);}finally{setBusy(false);controls(false);}
  };
  $('[data-review]').onclick=async()=>{
    if(isBusy()||!categoriesSha)return;clear();setBusy(true);controls(true);status('Checking spreadsheet and photos…');
    try{
      const file=$('[data-workbook]').files[0];if(!file||!file.name.toLowerCase().endsWith('.xlsx')||file.size>5000000)throw new Error('Choose an .xlsx file no larger than 5 MB.');
      const matrix=await parseWorkbook(file);if(columns.some((name,i)=>matrix[0]?.[i]!==name))throw new Error('Spreadsheet headers do not match. Download the template and keep its column names.');
      const photos=new Map(),files=[...$('[data-photos]').files];if(files.length>250||files.reduce((n,f)=>n+f.size,0)>50000000)throw new Error('Choose at most 250 photos and 50 MB total.');
      for(const photo of files){const key=photo.name.toLowerCase();if(photos.has(key))throw new Error('Duplicate photo filename: '+photo.name);let error='';if(!['image/png','image/jpeg','image/webp'].includes(photo.type)||photo.size>=1000000)error=photo.name+' must be JPG, PNG or WebP smaller than 1 MB.';else{try{const image=await createImageBitmap(photo);if(image.width>8192||image.height>8192)error=photo.name+' exceeds 8192 × 8192 pixels.';image.close();}catch{error=photo.name+' is not a readable image.';}}photos.set(key,{file:photo,error});}
      let rows=matrix.slice(1);while(rows.length&&rows.at(-1).every(value=>String(value).trim()===''))rows.pop();
      const review=reviewRows(rows,mode,catalogue,photos);
      if(review.errors.length){const box=$('[data-errors]');box.hidden=false;box.append(el('h3','Fix these errors before publishing'));const list=el('ul');for(const error of review.errors)list.append(el('li',error));box.append(list);status(review.errors.length+' errors found. Nothing uploaded or published.',true);return;}
      plan=review.items.filter(item=>item.changes.length);
      if(new TextEncoder().encode(JSON.stringify(plan.map(item=>item.product))).length>1800000)throw new Error('This batch contains too much product text. Split it into smaller files before publishing.');
      if(!plan.length){status('No changes found. Modify at least one product before publishing.');return;}
      const body=$('[data-rows]');for(const item of plan){const tr=el('tr'),name=el('td');name.append(el('strong',item.product.name),el('small','Row '+item.line+' · '+item.product.id));tr.append(name,el('td',item.product.category));const photoCell=el('td'),image=el('img');image.alt='';image.width=image.height=52;if(item.photo){const url=URL.createObjectURL(item.photo.file);urls.push(url);image.src=url;}else image.src=new URL('../'+item.product.image,import.meta.url);photoCell.append(image);tr.append(photoCell);const changes=el('td');for(const field of item.changes){const line=el('p'),label={name:'Name',description:'Model',price:'Price',price_mode:'Price type',published:'Visible',new_arrival:'New Arrival',image:'Photo',availability:'Availability',installation:'Installation',specifications:'Specifications'}[field];const format=value=>Array.isArray(value)?value.join(' | '):typeof value==='boolean'?value?'Yes':'No':String(value??'—');line.textContent=label+': '+(mode==='edit'?format(item.original?.[field])+' → ':'')+(field==='image'?item.photo.file.name:format(item.product[field]));changes.append(line);}tr.append(changes);body.append(tr);}
      $('[data-summary]').textContent=plan.length+' products to '+(mode==='add'?'add':'update')+' across '+new Set(plan.map(i=>i.slug)).size+' categories'+(review.items.length>plan.length?' · '+(review.items.length-plan.length)+' unchanged rows skipped':'')+'.';$('[data-preview]').hidden=false;status('Review complete. Nothing has been published yet.');
    }catch(error){plan=null;status(error.message,true);}finally{setBusy(false);controls(false);}
  };
  $('[data-publish]').onclick=async()=>{
    if(isBusy()||!plan?.length)return;setBusy(true);controls(true);
    try{
      const changes=new Map(),uploaded=new Map();let count=0;
      for(const item of plan){const product={id:item.product.id,category:item.product.category};for(const field of editableFields)product[field]=item.product[field];
        if(item.photo){const file=item.photo.file;if(!uploaded.has(file)){status('Uploading photo '+(++count)+'…');uploaded.set(file,await upload(file));}product.image=uploaded.get(file);}
        if(!changes.has(item.slug))changes.set(item.slug,{slug:item.slug,sha:catalogue.find(c=>c.slug===item.slug).sha,products:[]});changes.get(item.slug).products.push(product);
      }
      status('Publishing '+plan.length+' products together…');const result=await api('bulk-products',{method:'POST',body:JSON.stringify({mode,categoriesSha,changes:[...changes.values()]})});clear();categoriesSha=null;status(result.message+' Reload the catalogue before your next batch.');
    }catch(error){clear();categoriesSha=null;status(error.message+' Reload the catalogue and review again before retrying. No automatic publish retry was attempted.',true);}
    finally{setBusy(false);controls(false);$('[data-review]').disabled=$('[data-download]').disabled=!categoriesSha;}
  };
  open.onclick=async()=>{if(isBusy())return;for(const child of content.children)child.hidden=true;pane.hidden=false;for(const button of sidebar.querySelectorAll('button[aria-pressed]'))button.setAttribute('aria-pressed','false');open.setAttribute('aria-pressed','true');setMode(mode);await load();};
  setMode('add');
  return {reset(){pane.hidden=true;clear();catalogue=[];categoriesSha=null;open.setAttribute('aria-pressed','false');$('[data-workbook]').value='';$('[data-photos]').value='';}};
}
