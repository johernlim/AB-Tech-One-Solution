export const categoryOrderURL = 'https://ab-tech-catalogue-auth.johern20154.workers.dev/public/category-order';

export function applyCategoryOrder(categories, order = []) {
  const positions = new Map(order.map((slug, index) => [slug, index]));
  return [...categories].sort((a, b) => (positions.get(a.slug) ?? order.length) - (positions.get(b.slug) ?? order.length));
}

export async function loadLiveCategoryOrder() {
  try {
    const response = await fetch(categoryOrderURL, {cache:'no-store', signal:AbortSignal.timeout(3000)});
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.order) && data.order.every(slug => typeof slug === 'string') ? data.order : [];
  } catch {return [];}
}
