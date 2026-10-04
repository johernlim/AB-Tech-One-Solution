// Prepare at most two nearby category pages, without changing normal links.
export function prepareCategoryLinks(container) {
  if (document.prerendering || navigator.connection?.saveData || !HTMLScriptElement.supports?.('speculationrules')) return;
  const urls = new Map();
  let rules;
  function publish() {
    rules?.remove();
    if (!urls.size) return;
    rules = document.createElement('script'); rules.type = 'speculationrules';
    rules.textContent = JSON.stringify({prerender:[{source:'list',urls:[...urls.keys()],eagerness:'immediate'}]});
    document.head.append(rules);
  }
  function prepare(link) {
    const url = new URL(link.href);
    if (url.origin !== location.origin || !url.searchParams.has('category') || url.href === location.href || urls.has(url.href)) return;
    if (urls.size >= 2) {const oldest=urls.keys().next().value;clearTimeout(urls.get(oldest));urls.delete(oldest);}
    urls.set(url.href,setTimeout(()=>{urls.delete(url.href);publish();},60000));
    publish();
  }
  const observer = new IntersectionObserver(entries=>{
    for(const entry of entries) if(entry.isIntersecting){observer.unobserve(entry.target);if(urls.size<2)prepare(entry.target);}
  },{rootMargin:'150px'});
  container.querySelectorAll('.service-link').forEach(link=>observer.observe(link));
  for(const event of ['pointerover','focusin','touchstart'])container.addEventListener(event,event=>{
    const link=event.target.closest('a');if(link&&container.contains(link))prepare(link);
  },{passive:true});
  window.addEventListener('pagehide',()=>{observer.disconnect();for(const timer of urls.values())clearTimeout(timer);urls.clear();},{once:true});
}
