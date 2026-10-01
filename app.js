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
document.querySelector('.contact-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const body = `Name: ${data.get('name')}\nCompany: ${data.get('company')}\nPhone: ${data.get('phone')}\nSystem: ${data.get('service')}\n\n${data.get('message')}`;
  window.location.href = `mailto:abtechonesolution@gmail.com?subject=${encodeURIComponent('Site assessment: ' + data.get('service'))}&body=${encodeURIComponent(body)}`;
  document.getElementById('form-status').textContent = 'Your email app will open with your enquiry. Please press Send there to complete your request. If it does not open, call +6011 3078 9593.';
});
