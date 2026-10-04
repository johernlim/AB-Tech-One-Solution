import {loadCategories, renderCategoryCards} from './category-store.js?v=category-icons-1';
const container = document.querySelector('#services .services-grid');
try {
  const categories = await loadCategories();
  document.getElementById('systems-count-heading').textContent = `${categories.length} system${categories.length === 1 ? '' : 's'}. One team.`;
  renderCategoryCards(container, categories);
  const select = document.getElementById('service');
  if (select) {
    const saved = select.value;
    const options = categories.map(category => {const option = document.createElement('option'); option.value = category.name; option.textContent = category.name; return option;});
    select.replaceChildren(new Option('Choose a service', ''), ...options, new Option('Multiple services / Not sure', 'Multiple services / Not sure'));
    if ([...select.options].some(option => option.value === saved)) select.value = saved;
  }
} catch {
  container.replaceChildren();
  const message = document.createElement('p'); message.textContent = 'Product categories could not load. Please refresh or contact our team.';
  container.append(message);
}
