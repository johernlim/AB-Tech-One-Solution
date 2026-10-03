const root = new URL('.', import.meta.url);
export async function loadCategories() {
  const response = await fetch(new URL('data/categories.json', root), {cache: 'no-store'});
  if (!response.ok) throw new Error('Unable to load categories. Please refresh and try again.');
  const data = await response.json();
  if (!Array.isArray(data.categories)) throw new Error('Unable to load categories.');
  return data.categories;
}
export function renderCategoryCards(container, categories) {
  const templates = new Map([...container.querySelectorAll('.service-card')].map(card => [card.querySelector('h3').textContent, card]));
  const cards = categories.map(category => {
    const card = templates.get(category.name)?.cloneNode(true) || document.createElement('article');
    card.className = 'service-card';
    if (!card.querySelector('h3')) {
      const code = document.createElement('span'); code.className = 'service-code';
      const icon = document.createElement('img'); icon.className = 'service-icon'; icon.alt = ''; icon.width = icon.height = 42;
      const heading = document.createElement('h3'); heading.append(document.createElement('a'));
      const description = document.createElement('p');
      const link = document.createElement('a'); link.className = 'service-link'; link.textContent = 'Browse products ↗';
      card.append(code, icon, heading, description, link);
    }
    card.querySelector('.service-code').textContent = category.code || 'SYS / ' + category.slug.toUpperCase();
    const icon = card.querySelector('img.service-icon');
    if (icon) icon.src = new URL('assets/category-icons/' + (category.icon || 'network') + '.svg', root).href;
    card.querySelector('h3 a').textContent = category.name;
    card.querySelector('p').textContent = category.description;
    const href = new URL('catalogue.html?category=' + encodeURIComponent(category.name), root);
    card.querySelectorAll('a').forEach(link => {link.href = href.href;});
    return card;
  });
  container.replaceChildren(...cards);
}
