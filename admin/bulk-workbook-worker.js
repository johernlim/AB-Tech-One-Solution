importScripts('vendor/xlsx-0.20.3.min.js');
self.onmessage=event=>{
  try{
    const workbook=XLSX.read(event.data,{type:'array',sheetRows:252,cellFormula:true,cellHTML:false,cellStyles:false});
    const sheet=workbook.Sheets.Products;
    if(!sheet)throw new Error('Use the Products sheet in the downloaded template.');
    const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
    if(range.e.c>15||range.e.r>250)throw new Error('Use the template columns and at most 250 product rows. Remove unused rows outside the table.');
    const identity=workbook.Sheets._Identity;
    if(sheet.O1?.v!=='Row Reference'||sheet.P1?.v!=='Delete product'||!identity||identity.A1?.v!=='Row Reference')throw new Error('This template does not have the latest product protection and deletion controls. Download a fresh template before uploading.');
    const identityRange=XLSX.utils.decode_range(identity['!fullref']||identity['!ref']||'A1');
    if(identityRange.e.r>250||identityRange.e.c>13)throw new Error('Invalid identity sheet. Download a fresh template.');
    for(const [key,cell] of Object.entries(sheet)){
      if(key.startsWith('!'))continue;
      if(/^A[0-9]+$/.test(key)&&key!=='A1'&&sheet.A1?.v==='Action') {sheet[key]={t:'s',v:''};continue;}
      if(cell.f)throw new Error('Formulas are not supported. Paste values instead.');
    }
    self.postMessage({rows:XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true,raw:true}),identities:XLSX.utils.sheet_to_json(identity,{header:1,defval:'',blankrows:false,raw:true}).slice(1)});
  }catch(error){self.postMessage({error:error.message||'Unable to read this workbook.'});}
};
