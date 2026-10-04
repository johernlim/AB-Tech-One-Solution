importScripts('vendor/xlsx-0.20.3.min.js');
self.onmessage=event=>{
  try{
    const workbook=XLSX.read(event.data,{type:'array',sheetRows:252,cellFormula:true,cellHTML:false,cellStyles:false});
    const sheet=workbook.Sheets.Products;
    if(!sheet)throw new Error('Use the Products sheet in the downloaded template.');
    const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
    if(range.e.c>13||range.e.r>250)throw new Error('Use the template columns and at most 250 product rows. Remove unused rows outside the table.');
    for(const [key,cell] of Object.entries(sheet)){
      if(key.startsWith('!'))continue;
      if(/^A[0-9]+$/.test(key)&&key!=='A1'&&sheet.A1?.v==='Action') {sheet[key]={t:'s',v:''};continue;}
      if(cell.f)throw new Error('Formulas are not supported. Paste values instead.');
    }
    self.postMessage({rows:XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true,raw:true})});
  }catch(error){self.postMessage({error:error.message||'Unable to read this workbook.'});}
};
