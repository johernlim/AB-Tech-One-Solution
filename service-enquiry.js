import {loadCategories} from './category-store.js?v=category-icons-1';

const services={
  it:{title:'IT Systems',message:'Hi AB Tech One Solution, I am interested in your IT Systems services and would like to know more about your computer, server, software and Wi-Fi solutions. Could you please share your recommendations and pricing? Thank you.'},
  pos:{title:'Point-of-Sale Systems',message:'Hi AB Tech One Solution, I am interested in your Point-of-Sale Systems services and would like to know more about your POS hardware and digital signage solutions for my business. Could you please share the available options and pricing? Thank you.'},
  security:{title:'Security Systems'}
};
const dialog=document.createElement('dialog');dialog.className='service-enquiry';dialog.id='service-enquiry';dialog.setAttribute('aria-labelledby','service-enquiry-title');
dialog.innerHTML=`<form><div class="enquiry-heading"><div><span class="eyebrow">Let's talk about your setup</span><h2 id="service-enquiry-title"></h2></div><button type="button" data-enquiry-close aria-label="Close service enquiry">×</button></div><div data-enquiry-category hidden><label for="enquiry-service">Which service do you need?</label><select id="enquiry-service" required><option value="">Choose a service</option></select><p class="enquiry-status" data-category-status role="status"></p><button type="button" class="button secondary" data-category-retry hidden>Try again</button></div><div class="enquiry-message"><span>Your message</span><p data-enquiry-message></p></div><p class="enquiry-instruction">Choose how to contact us. Your recipient and message will be filled in. Sign in if prompted, then press Send.</p><div class="enquiry-channels"><button type="submit" class="button" name="channel" value="whatsapp">By WhatsApp ↗</button><button type="submit" class="button secondary" name="channel" value="gmail">By Gmail ↗</button></div><p class="enquiry-status" data-enquiry-status role="status"></p></form>`;
document.body.append(dialog);
const $=selector=>dialog.querySelector(selector),select=$('#enquiry-service');
let active,trigger,message='',generation=0;
function updateMessage(){
  const category=select.value;
  message=active==='security'?(category?`Hi AB Tech One Solution, I am interested in your ${category} service and would like to know more. Could you please share the available options, installation details and pricing? Thank you.`:''):services[active]?.message||'';
  $('[data-enquiry-message]').textContent=message||'Select a service above to prepare your enquiry.';
  for(const button of dialog.querySelectorAll('[name="channel"]'))button.disabled=!message;
  $('[data-enquiry-status]').replaceChildren();
}
async function categories(){
  const request=++generation;select.disabled=true;select.replaceChildren(new Option('Loading services…',''));updateMessage();$('[data-category-retry]').hidden=true;$('[data-category-status]').textContent='Loading available services…';
  try{
    const list=await loadCategories();if(request!==generation||!dialog.open||active!=='security')return;
    select.replaceChildren(new Option('Choose a service',''),...list.map(category=>new Option(category.name,category.name)));select.disabled=!list.length;
    $('[data-category-status]').textContent=list.length?'':'No services are currently available. Please contact us using the contact details below.';
    $('[data-category-retry]').hidden=Boolean(list.length);
  }catch{
    if(request!==generation||!dialog.open||active!=='security')return;
    select.replaceChildren(new Option('Services unavailable',''));$('[data-category-status]').textContent='Could not load services. Please try again.';$('[data-category-retry]').hidden=false;
  }
}
document.querySelectorAll('[data-solution]').forEach(link=>{
  link.setAttribute('aria-haspopup','dialog');
  link.addEventListener('click',event=>{
    event.preventDefault();active=link.dataset.solution;if(!services[active])return;trigger=link;generation++;
    $('#service-enquiry-title').textContent=services[active].title;
    $('[data-enquiry-category]').hidden=active!=='security';select.disabled=active!=='security';select.value='';updateMessage();dialog.showModal();
    if(active==='security')categories();
  });
});
select.addEventListener('change',updateMessage);
$('[data-category-retry]').addEventListener('click',categories);
$('[data-enquiry-close]').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{generation++;trigger?.focus();});
dialog.addEventListener('click',event=>{const box=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))dialog.close();});
$('form').addEventListener('submit',event=>{
  event.preventDefault();if(!message||!event.currentTarget.reportValidity())return;
  const gmail=event.submitter?.value==='gmail',subject='Enquiry: '+(active==='security'?services.security.title+' — '+select.value:services[active].title);
  const url=gmail?'https://mail.google.com/mail/?'+new URLSearchParams({view:'cm',fs:'1',to:'abtechonesolution@gmail.com',su:subject,body:message}):'https://wa.me/601130789593?'+new URLSearchParams({text:message});
  const status=$('[data-enquiry-status]');status.textContent='Press Send in '+(gmail?'Gmail':'WhatsApp')+' to send your enquiry. If it did not open, ';
  const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='open your prepared message here.';status.append(link);
  window.open(url,'_blank','noopener,noreferrer');
});
