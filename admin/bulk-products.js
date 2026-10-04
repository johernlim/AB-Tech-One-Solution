import {combinedColumns as columns,reviewRows,editableFields} from './bulk-products-core.js?v=combined-1';
import {downloadCombinedWorkbook,guide} from './combined-workbook.js?v=combined-1';
function parseWorkbook(file){return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./bulk-workbook-worker.js?v=combined-1',import.meta.url));
  const timer=setTimeout(()=>finish(new Error('This workbook took too long to read. Use a smaller file with values only.')),15000);
  function finish(error,rows){clearTimeout(timer);worker.terminate();error?reject(error):resolve(rows);}
  worker.onmessage=event=>finish(event.data.error?new Error(event.data.error):null,event.data.rows);
  worker.onerror=()=>finish(new Error('Unable to read this workbook. Download a fresh template.'));
  file.arrayBuffer().then(data=>worker.postMessage(data,[data])).catch(error=>finish(error));
});}
export function setupBulkProducts(api,isBusy,setBusy,upload){
  const content=document.querySelector('.staff-content'),sidebar=document.querySelector('.staff-category-sidebar');
  const open=document.createElement('button');open.type='button';open.id='staff-bulk-open';open.className='button secondary';open.textContent='Products in Excel';sidebar.append(open);
  const pane=document.createElement('section');pane.className='bulk-admin';pane.hidden=true;
  pane.innerHTML=`<div class="staff-content-heading"><div><span class="eyebrow">Staff workspace</span><h2>Products in Excel</h2></div><button type="button" class="button secondary" data-reload>Reload catalogue</button></div>
  <p class="field-help">Add or update products in Excel, review every change, then publish the batch together.</p>
  <div class="bulk-step"><h3>1. Download and fill your Excel file</h3><p class="field-help">Download existing products, edit their rows, and add new rows at the bottom. Choose Add or Update in the Action column. Unchanged products are skipped automatically.</p><label>Category<select data-scope aria-label="Export category"></select></label><div class="bulk-download-actions"><button type="button" class="button secondary" data-download>Download existing products + template</button><button type="button" class="button secondary" data-blank>Blank template for new products</button></div><p class="field-help">Dropdowns and examples are included. New products: leave Product ID and Version blank. Updates: keep these fields and Category unchanged. Up to 250 rows per batch.</p><details class="bulk-guide"><summary>What should I enter in each column?</summary><div data-column-guide></div></details></div>
  <div class="bulk-step"><h3>2. Choose your file and photos</h3><label>Completed Excel file<input type="file" data-workbook accept=".xlsx" aria-label="Completed Excel file"></label><p class="field-help">.xlsx only, up to 5 MB. Use the Products sheet and keep its headers. Enter values, not formulas.</p><label>Product photos<input type="file" data-photos multiple accept="image/jpeg,image/png,image/webp" aria-label="Product photos"></label><p class="field-help">Match each Image Filename exactly to a selected photo. JPG, PNG or WebP, smaller than 1 MB each, up to 8192 × 8192 pixels. Choose up to 250 photos (50 MB total). For Update rows, leave Image Filename blank to keep the current image.</p><button type="button" class="button" data-review>Review products</button></div>
  <p class="account-message" role="status" data-status></p><div data-errors class="bulk-errors" hidden></div>
  <div data-preview hidden><h3>3. Review and publish</h3><p data-summary class="field-help"></p><div class="bulk-table-wrap"><table class="bulk-table"><thead><tr><th>Row / Product</th><th>Category</th><th>Photo</th><th>Changes</th></tr></thead><tbody data-rows></tbody></table></div><p class="field-help">Only the changes above will be published. Existing product IDs, category visibility, PWP offers and discount settings are preserved.</p><button type="button" class="button" data-publish>Confirm &amp; publish</button></div>`;
  content.append(pane);const $=selector=>pane.querySelector(selector);
  let mode='mixed',catalogue=[],categoriesSha,plan=null,urls=[];
  const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  function status(message,error=false){$('[data-status]').textContent=message;$('[data-status]').dataset.error=String(error);}
  function clear(){plan=null;urls.forEach(URL.revokeObjectURL);urls=[];$('[data-preview]').hidden=true;$('[data-rows]').replaceChildren();$('[data-errors]').hidden=true;$('[data-errors]').replaceChildren();}
  function controls(disabled){for(const node of pane.querySelectorAll('button,input,select'))node.disabled=disabled;}
  function hide(){if(isBusy())return;pane.hidden=true;open.setAttribute('aria-pressed','false');}
  sidebar.addEventListener('click',event=>{if(event.target.closest('#staff-categories button,#staff-pwp-open,#staff-promotions-open'))hide();},true);
  async function load(){
    clear();catalogue=[];categoriesSha=null;setBusy(true);controls(true);status('Loading categories and products…');
    try{
      const registry=await api('categories');categoriesSha=registry.sha;
      // Limit concurrent reads to keep large catalogues responsive.
      for(let offset=0;offset<registry.categories.length;offset+=4){const batch=await Promise.all(registry.categories.slice(offset,offset+4).map(async category=>({...category,...await api('categories/'+category.slug)})));catalogue.push(...batch);}
      $('[data-scope]').replaceChildren(new Option('All categories',''),...catalogue.map(c=>new Option(c.name+(c.visible===false?' (hidden)':''),c.slug)));
      status(catalogue.reduce((n,c)=>n+c.products.length,0)+' products loaded.');
    }catch(error){categoriesSha=null;catalogue=[];status(error.message,true);}
    finally{setBusy(false);controls(false);$('[data-blank]').disabled=$('[data-download]').disabled=$('[data-review]').disabled=!categoriesSha;}
  }
  $('[data-reload]').onclick=()=>{if(!isBusy())load();};
  for(const selector of ['[data-workbook]','[data-photos]'])$(selector).onchange=()=>{clear();status('Files changed. Review products before publishing.');};
  for(const selector of ['[data-download]','[data-blank]'])$(selector).onclick=async()=>{
    if(isBusy()||!categoriesSha)return;setBusy(true);controls(true);
    try{await downloadCombinedWorkbook(catalogue,$('[data-scope]').value,selector==='[data-blank]');status('Excel downloaded. Use Add or Update; unchanged rows are skipped automatically.');}
    catch(error){status(error.message,true);}finally{setBusy(false);controls(false);}
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
      const body=$('[data-rows]');for(const item of plan){const tr=el('tr'),name=el('td');name.append(el('strong',item.product.name),el('small','Row '+item.line+' · '+item.product.id));name.append(el('small',item.action==='add'?'ADD NEW':'UPDATE'));tr.append(name,el('td',item.product.category));const photoCell=el('td'),image=el('img');image.alt='';image.width=image.height=52;if(item.photo){const url=URL.createObjectURL(item.photo.file);urls.push(url);image.src=url;}else image.src=new URL('../'+item.product.image,import.meta.url);photoCell.append(image);tr.append(photoCell);const changes=el('td');for(const field of item.changes){const line=el('p'),label={name:'Name',description:'Model',price:'Price',price_mode:'Price type',published:'Visible',new_arrival:'New Arrival',image:'Photo',availability:'Availability',installation:'Installation',specifications:'Specifications'}[field];const format=value=>Array.isArray(value)?value.join(' | '):typeof value==='boolean'?value?'Yes':'No':String(value??'—');line.textContent=label+': '+(item.action==='update'?format(item.original?.[field])+' → ':'')+(field==='image'?item.photo.file.name:format(item.product[field]));changes.append(line);}tr.append(changes);body.append(tr);}
      const added=plan.filter(item=>item.action==='add').length,updated=plan.length-added;
      $('[data-summary]').textContent=added+' new | '+updated+' updated | '+(review.items.length-plan.length)+' unchanged (automatically skipped).';
      $('[data-publish]').textContent='Confirm '+added+' new + '+updated+' updates';
      $('[data-preview]').hidden=false;status('Review complete. Nothing has been published yet.');
    }catch(error){plan=null;status(error.message,true);}finally{setBusy(false);controls(false);}
  };
  $('[data-publish]').onclick=async()=>{
    if(isBusy()||!plan?.length)return;setBusy(true);controls(true);
    try{
      const changes=new Map(),uploaded=new Map();let count=0;
      for(const item of plan){const product={id:item.product.id,category:item.product.category,action:item.action};for(const field of editableFields)product[field]=item.product[field];
        if(item.photo){const file=item.photo.file;if(!uploaded.has(file)){status('Uploading photo '+(++count)+'…');uploaded.set(file,await upload(file));}product.image=uploaded.get(file);}
        if(!changes.has(item.slug))changes.set(item.slug,{slug:item.slug,sha:catalogue.find(c=>c.slug===item.slug).sha,products:[]});changes.get(item.slug).products.push(product);
      }
      status('Publishing '+plan.length+' products together…');const result=await api('bulk-products',{method:'POST',body:JSON.stringify({mode,categoriesSha,changes:[...changes.values()]})});clear();categoriesSha=null;status(result.message+' Reload the catalogue before your next batch.');
    }catch(error){clear();categoriesSha=null;status(error.message+' Reload the catalogue and review again before retrying. No automatic publish retry was attempted.',true);}
    finally{setBusy(false);controls(false);$('[data-blank]').disabled=$('[data-review]').disabled=$('[data-download]').disabled=!categoriesSha;}
  };
  open.onclick=async()=>{if(isBusy())return;for(const child of content.children)child.hidden=true;pane.hidden=false;for(const button of sidebar.querySelectorAll('button[aria-pressed]'))button.setAttribute('aria-pressed','false');open.setAttribute('aria-pressed','true');$('[data-workbook]').value='';$('[data-photos]').value='';await load();};
  for(const [name,required,description,example] of guide){const row=el('p');row.append(el('strong',name+' - '+required),el('br'),el('span',description),el('br'),el('small','Example: '+example));$('[data-column-guide]').append(row);}
  return {reset(){pane.hidden=true;clear();catalogue=[];categoriesSha=null;open.setAttribute('aria-pressed','false');$('[data-workbook]').value='';$('[data-photos]').value='';}};
}
