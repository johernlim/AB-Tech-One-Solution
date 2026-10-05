export const productsPerPage = 12;
export function paginateProducts(products, requestedPage = 1) {
  const pages = Math.ceil(products.length / productsPerPage);
  const requested = Number(requestedPage);
  const page = Math.min(Math.max(Number.isSafeInteger(requested) ? requested : 1, 1), Math.max(pages, 1));
  const start = (page - 1) * productsPerPage;
  return {page, pages, start, products:products.slice(start, start + productsPerPage)};
}
export function paginationMarkup(page, pages, pageURL) {
  if (pages <= 1) return '';
  const link = (number, label, current = false) => {
    const href = pageURL(number).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<a href="${href}" data-page="${number}" aria-label="${label === 'Previous' || label === 'Next' ? label + ' page' : 'Page ' + number}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
  };
  return (page > 1 ? link(page - 1, 'Previous') : '') + Array.from({length:pages}, (_, index) => link(index + 1, String(index + 1), index + 1 === page)).join('') + (page < pages ? link(page + 1, 'Next') : '');
}
