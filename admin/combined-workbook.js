import {combinedColumns,combinedExportRow,referenceColumn,deleteColumn} from './bulk-products-core.js?v=excel-delete-1';
let library;
async function excel(){
  if(!library)library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/exceljs-4.4.0.min.js',import.meta.url);script.onload=()=>resolve(window.ExcelJS);script.onerror=()=>{library=null;script.remove();reject(new Error('Excel tools could not load. Please try again.'));};document.head.append(script);});
  return library;
}
export const guide=[
  ['Action','Automatic','Do not edit. Enter data in a new row to show Add. Changed existing rows show Update; unchanged rows show Skip. Upload review checks actions independently.','Add / Update / Skip'],
  ['Category','Required','Choose from the dropdown. Keep the category unchanged on Update rows.','CCTV Systems'],
  ['Product ID','Automatic for Add','For Add, enter a unique custom ID or leave blank to generate one. Existing IDs are locked; rename them in admin.','Leave blank for Add'],
  ['Product Name','Required for Add','Customer-facing product name; maximum 5,000 characters. Blank on Update keeps the current name.','Outdoor Wi-Fi Camera'],
  ['Model Number','Required for Add','Model code; maximum 5,000 characters. Blank on Update keeps the current model.','CAM-OUT-4MP'],
  ['Price (RM)','Required for Add unless quote','Number only, 0–10,000,000; up to two decimal places. Do not enter RM or commas.','299.00'],
  ['Price Type','Dropdown','fixed = exact price; from = starting price; quote = ask for a quote. New products default to fixed.','fixed / from / quote'],
  ['Visible','Dropdown','Yes shows the product when its category is visible. No hides it. Add defaults to Yes.','Yes / No'],
  ['New Arrival','Dropdown','Yes shows the New Arrival badge. Add defaults to No.','Yes / No'],
  ['Image Filename','Required for Add','Enter the photo filename including extension and select the matching photo in admin. Blank on Update keeps the current photo.','outdoor-camera.jpg'],
  ['Availability','Optional','Blank on Add defaults to Contact us to confirm availability. Blank on Update keeps the current value.','In stock'],
  ['Installation','Optional','Blank on Add defaults to Installation quoted separately. Blank on Update keeps the current value.','Installation quoted separately.'],
  ['Specifications','Optional','Separate entries with |. Up to 50 entries, 500 characters each. Blank on Update keeps current specifications.','4MP resolution | Night vision | Wi-Fi'],
  ['Version','Automatic for Update','Do not change the prefilled version. Leave blank for Add. Download a fresh file if existing products changed.','Keep existing value / blank for Add'],
  ['Delete product','Optional','Choose Yes to mark an existing product for deletion. Review and confirm the deletion in admin. Blank or No keeps it.','Yes / No']
];
export async function buildCombinedWorkbook(catalogue,scope='',blank=false){
  const ExcelJS=await excel(),workbook=new ExcelJS.Workbook();workbook.creator='AB Tech One Solution';
  const rows=blank?[]:catalogue.filter(c=>!scope||c.slug===scope).flatMap(c=>c.products.map(p=>combinedExportRow(c,p,c.sha)));
  if(rows.length>250)throw new Error('More than 250 products selected. Choose one category, or download a blank template for new products.');
  const products=workbook.addWorksheet('Products',{views:[{state:'frozen',ySplit:1}]});
  products.columns=combinedColumns.map((header,i)=>({header,key:header,width:[15,29,42,38,28,17,17,15,17,32,42,42,55,44][i]}));
  const references=rows.map(()=>crypto.randomUUID());
  products.addRows(rows.map((row,index)=>[...row,references[index]]));
  products.getCell('O1').value=referenceColumn;
  products.getColumn(15).hidden=true;
  products.getCell('P1').value=deleteColumn;products.getColumn(16).width=22;
  workbook.calcProperties.fullCalcOnLoad=true;
  const originals=workbook.addWorksheet('_Original',{state:'veryHidden'});
  originals.addRow(combinedColumns);
  for(const row of rows)originals.addRow([row[1]+'|'+row[2],...row.slice(1)]);
  const identities=workbook.addWorksheet('_Identity',{state:'veryHidden'});
  identities.addRow([referenceColumn,...combinedColumns.slice(1)]);
  rows.forEach((row,index)=>identities.addRow([references[index],...row.slice(1)]));
  products.autoFilter='A1:N251';
  const categories=workbook.addWorksheet('Categories');categories.columns=[{header:'Category ID',width:28},{header:'Category Name',width:38},{header:'Shown on website',width:22}];
  for(const category of catalogue)categories.addRow([category.slug,category.name,category.visible===false?'No':'Yes']);
  if(catalogue.length)workbook.definedNames.add("'Categories'!$B$2:$B$"+(catalogue.length+1),'CategoryNames');
  function validation(formula,prompt){return {type:'list',allowBlank:true,formulae:[formula],showInputMessage:true,promptTitle:'Choose a value',prompt,showErrorMessage:true,errorStyle:'stop',errorTitle:'Invalid value',error:'Choose a value from the dropdown.'};}
  for(let row=2;row<=251;row++){
    for(let col=1;col<=16;col++)products.getCell(row,col).protection={locked:col===1||col===14||col===15||(row<=rows.length+1&&[2,3].includes(col))};
    const lookup=`MATCH(B${row}&"|"&C${row},'_Original'!$A$2:$A$251,0)`;
    const comparisons=['D','E','F','G','H','I','K','L','M'].map(col=>`AND(${col}${row}<>"",${col}${row}<>INDEX('_Original'!$${col}$2:$${col}$251,${lookup}))`);
    const formula=`IF(P${row}="Yes","Delete",IF(COUNTA(B${row}:N${row})=0,"",IF(N${row}="","Add",IFERROR(IF(OR(J${row}<>"",${comparisons.join(',')}),"Update","Skip"),"Update"))))`;
    products.getCell(row,1).value={formula,result:row<=rows.length+1?'Skip':''};
    products.getCell(row,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F3'}};
    if(catalogue.length)products.getCell(row,2).dataValidation=validation('CategoryNames','Select an existing category.');
    products.getCell(row,7).dataValidation=validation('"fixed,from,quote"','Select the price type.');
    for(const col of [8,9])products.getCell(row,col).dataValidation=validation('"Yes,No"','Choose Yes or No.');
    products.getCell(row,16).dataValidation=validation('"Yes,No"','Yes marks an existing product for deletion. Blank or No keeps it. Review deletions in admin before publishing.');
    products.getCell(row,6).numFmt='0.00';
    for(const col of [3,14]){const cell=products.getCell(row,col);cell.numFmt='@';cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F3'}};}
    if(row<=rows.length+1)for(const col of [3,14])products.getCell(row,col).dataValidation={type:'custom',formulae:['TRUE'],showInputMessage:true,promptTitle:'Edit in admin',prompt:col===3?'Please edit it in admin. Rename this Product ID in Edit product, then download a fresh Excel file.':'Please edit this product in admin. Version updates automatically; download a fresh Excel file after saving.'};
  }
  guide.slice(0,14).forEach((entry,index)=>products.getCell(1,index+1).note=entry[1]+': '+entry[2]+' Example: '+entry[3]);
  products.getCell('P1').note='Choose Yes to delete an existing product when you confirm publishing in admin. Blank or No keeps the product. Removing a row does not delete it.';
  await products.protect(crypto.randomUUID(),{selectLockedCells:true,selectUnlockedCells:true,autoFilter:true});
  await identities.protect(crypto.randomUUID());
  const help=workbook.addWorksheet('Column Guide');help.columns=[{header:'Column',width:25},{header:'Required?',width:26},{header:'What to enter',width:95},{header:'Example',width:52}];help.addRows(guide);help.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};if(row.number>1)row.height=48;});
  const examples=workbook.addWorksheet('Examples');examples.columns=combinedColumns.map((header,i)=>({header,width:products.getColumn(i+1).width}));
  const first=catalogue.find(c=>c.products.length),category=first||catalogue[0];
  if(first){const sample=combinedExportRow(first,first.products[0],first.sha);sample[0]='Update';sample[6]='fixed';sample[5]=199.00;examples.addRow(sample);}
  examples.addRow(['Add',category?.name||'Choose a category','','Outdoor Wi-Fi Camera','CAM-OUT-4MP',299,'fixed','Yes','No','outdoor-camera.jpg','In stock','Installation quoted separately.','4MP | Night vision | Wi-Fi','']);
  const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{header:'How to use this file',width:125}];
  for(const note of ['Edit Products only. Start typing in a new row: Action shows Add automatically. No action selection is needed.','Existing rows show Skip until edited, then Update. Clearing an editable cell keeps its original value. Upload review recomputes every action.','New products: enter a unique Product ID or leave it blank to generate one. Leave Version blank. Fill the required fields and match a photo filename.','Existing Category, Product ID and Version cells are locked and checked against hidden row references. Rename IDs in admin and download a fresh file. Blank editable cells keep existing values.','Action is an automatic formula. Use the dropdowns for Category, Price Type, Visible and New Arrival. Click a column header for guidance.','Column Guide explains every field. Examples are reference rows only; they are not imported.','Maximum 250 product rows across 20 changed categories per batch. Each category holds at most 250 products.','Excel files: .xlsx, at most 5 MB. Photos: JPG, PNG or WebP smaller than 1 MB each. Select photos separately.','To delete an existing product, choose Yes in the Delete product column. Admin review lists every deletion before you confirm publishing. Removing a spreadsheet row leaves its product unchanged. Keep the hidden reference column and sheets.','Review the Added, Updated, Deleted and Unchanged counts before confirming. Products marked Delete are removed only when you confirm publishing.'])instructions.addRow([note]);
  for(const sheet of workbook.worksheets){sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).height=30;sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF214C42'}};sheet.getRow(1).alignment={vertical:'middle',wrapText:true};}
  return workbook;
}
export async function downloadCombinedWorkbook(catalogue,scope,blank){const workbook=await buildCombinedWorkbook(catalogue,scope,blank);const bytes=await workbook.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=blank?'AB-Tech-New-Products.xlsx':'AB-Tech-Products.xlsx';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
