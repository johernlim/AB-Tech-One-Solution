const menu = document.querySelector('.menu');
const homeReturnKey = 'abtech-home-return:' + new URL('.', location.href).pathname;
document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank') return;
  const target = new URL(link.href);
  if (target.origin === location.origin && target.pathname === new URL('catalogue.html', location.href).pathname) {
    try { sessionStorage.setItem(homeReturnKey, JSON.stringify({url: location.href, y: scrollY})); } catch {}
  }
});
if (new URL(location.href).searchParams.get('return') === 'services') {
  history.scrollRestoration = 'manual';
  window.addEventListener('load', async () => {
    await document.fonts.ready;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(homeReturnKey)); sessionStorage.removeItem(homeReturnKey); } catch {}
    const url = new URL(location.href); url.searchParams.delete('return'); history.replaceState(history.state, '', url);
    const top = saved && Number.isFinite(saved.y) && saved.y >= 0 ? saved.y : document.getElementById('services').offsetTop;
    window.scrollTo({top, behavior: 'instant'});
    history.scrollRestoration = 'auto';
  }, {once: true});
}
const nav = document.querySelector('.nav');
function closeMenu() { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});
nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); menu.focus(); } });
document.getElementById('year').textContent = new Date().getFullYear();
document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
  document.getElementById('service').value = link.dataset.service;
}));
const phoneInput = document.getElementById('phone');
function localMobileNumber(value) {
  return /^(?:011[0-9]{8}|01[02-9][0-9]{7})$/.test(value) ? value : null;
}
function validatePhone() {
  const valid = localMobileNumber(phoneInput.value);
  phoneInput.setCustomValidity(phoneInput.value && !valid
    ? 'Enter a Malaysian mobile number: 011 needs 11 digits; other 01 prefixes need 10 digits.' : '');
  return valid;
}
phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/[^0-9]/g, '').slice(0, 11);
  validatePhone();
});
phoneInput.addEventListener('change', validatePhone);

document.querySelector('.contact-form').addEventListener('submit', event => {
  event.preventDefault();
  const phone = validatePhone();
  if (!event.currentTarget.reportValidity() || !phone) return;
  const data = new FormData(event.currentTarget);
  data.set('phone', phone);
  data.set('company', data.get('company').trim());
  const body = `Request a free site assessment\n\nName: ${data.get('name')}\nCompany: ${data.get('company')}\nPhone: ${data.get('phone')}\nSystem: ${data.get('service')}\n\nAbout the space: ${data.get('message') || 'Not provided'}`;
  const email = event.submitter?.value === 'email';
  const url = email
    ? `mailto:abtechonesolution@gmail.com?subject=${encodeURIComponent('Request a free site assessment')}&body=${encodeURIComponent(body)}`
    : `https://wa.me/601130789593?text=${encodeURIComponent(body)}`;
  const status = document.getElementById('form-status');
  const destination = email ? 'your email app' : 'WhatsApp';
  status.textContent = `Press Send in ${destination} to complete your request. If it did not open, `;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'open your request here.';
  status.append(link);
  window.open(url, '_blank', 'noopener,noreferrer');
});
