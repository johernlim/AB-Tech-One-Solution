const root = new URL('.', import.meta.url);
const presets = new Set(['cctv','alarm','door-access','computers','pos','network','wifi','servers','software','signage']);
export function categoryIconURL(icon) {
  const path = /^assets\/uploads\/[a-zA-Z0-9_-]+\.(png|webp)$/.test(icon || '') ? icon : 'assets/category-icons/' + (presets.has(icon) ? icon : 'network') + '.svg';
  return new URL(path, root).href;
}
export function showCategoryIcon(image, icon) {
  image.onerror = () => {image.onerror = null; image.src = categoryIconURL('network');};
  image.style.objectFit = 'contain';
  image.src = categoryIconURL(icon);
}
