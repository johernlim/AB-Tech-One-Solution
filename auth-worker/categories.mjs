export const categoryIcons = ['cctv', 'alarm', 'door-access', 'computers', 'pos', 'network', 'wifi', 'servers', 'software', 'signage'];
const encoder = new TextEncoder();
function api(env, path, options = {}) {
  return fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/' + path, {...options, headers: {Authorization: 'Bearer ' + env.GITHUB_CATALOGUE_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'AB-Tech-Staff', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'}});
}
const decode = content => new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0)));
const encode = text => btoa(String.fromCharCode(...encoder.encode(text)));
export function validCategory(category) {
  return category && typeof category.name === 'string' && category.name === category.name.trim() && category.name.length >= 2 && category.name.length <= 80 &&
    typeof category.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.slug) && category.slug.length <= 64 &&
    typeof category.description === 'string' && category.description.trim().length > 0 && category.description.length <= 500 &&
    categoryIcons.includes(category.icon) && (!category.code || typeof category.code === 'string' && category.code.length <= 32);
}
export async function readCategories(env, ref = 'main') {
  const response = await api(env, 'contents/data/categories.json?ref=' + encodeURIComponent(ref));
  if (!response.ok) throw new Error('Category list could not load from GitHub.');
  const file = await response.json();
  const {categories} = JSON.parse(decode(file.content));
  if (!Array.isArray(categories) || categories.length > 50 || !categories.every(validCategory)) throw new Error('Invalid category list.');
  return {categories, sha: file.sha};
}
export async function changeCategories(env, user, method, slug, data) {
  const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store'}});
  if (!/^[a-f0-9]{40}$/.test(data.sha || '')) return json({error: 'Reload categories before publishing.'}, 400);
  const refResponse = await api(env, 'git/ref/heads/main');
  if (!refResponse.ok) return json({error: 'Could not load the publishing branch.'}, 502);
  const head = (await refResponse.json()).object.sha;
  const current = await readCategories(env, head);
  if (current.sha !== data.sha) return json({error: 'Categories changed since you opened them. Reload the list and try again.'}, 409);
  let categories = current.categories;
  const additions = [];
  if (method === 'POST') {
    if (!validCategory(data.category)) return json({error: 'Check the category name, description, ID and icon.'}, 400);
    const category = {name: data.category.name, slug: data.category.slug, description: data.category.description, icon: data.category.icon, code: 'SYS / ' + data.category.slug.toUpperCase().slice(0, 24)};
    if (categories.length >= 50) return json({error: 'You can have up to 50 categories.'}, 400);
    if (categories.some(c => c.slug === category.slug || c.name.toLowerCase() === category.name.toLowerCase())) return json({error: 'This category name or ID already exists.'}, 409);
    const existing = await api(env, 'contents/data/categories/' + category.slug + '.json?ref=' + head);
    if (existing.status !== 404) return json({error: existing.ok ? 'This ID belongs to a saved category. Choose a new category ID.' : 'Could not verify the category ID. Please try again.'}, existing.ok ? 409 : 502);
    categories = [...categories, category];
    additions.push({path: 'data/categories/' + category.slug + '.json', mode: '100644', type: 'blob', content: '{"products":[]}\n'});
  } else {
    if (!categories.some(c => c.slug === slug)) return json({error: 'Category not found.'}, 404);
    categories = categories.filter(c => c.slug !== slug);
  }
  const commitResponse = await api(env, 'git/commits/' + head);
  if (!commitResponse.ok) return json({error: 'Could not prepare the category update.'}, 502);
  const baseTree = (await commitResponse.json()).tree.sha;
  const registryResponse = await api(env, 'git/blobs', {method: 'POST', body: JSON.stringify({content: encode(JSON.stringify({categories}, null, 2) + '\n'), encoding: 'base64'})});
  if (!registryResponse.ok) return json({error: 'Could not save the category list.'}, 502);
  const registrySha = (await registryResponse.json()).sha;
  const treeResponse = await api(env, 'git/trees', {method: 'POST', body: JSON.stringify({base_tree: baseTree, tree: [{path: 'data/categories.json', mode: '100644', type: 'blob', sha: registrySha}, ...additions]})});
  if (!treeResponse.ok) return json({error: 'Could not prepare category files.'}, 502);
  const treeSha = (await treeResponse.json()).sha;
  const newCommitResponse = await api(env, 'git/commits', {method: 'POST', body: JSON.stringify({message: (method === 'POST' ? 'Add ' + data.category.name : 'Remove ' + slug) + ' category by ' + user.username, tree: treeSha, parents: [head]})});
  if (!newCommitResponse.ok) return json({error: 'Could not create the category update.'}, 502);
  const newCommit = (await newCommitResponse.json()).sha;
  const update = await api(env, 'git/refs/heads/main', {method: 'PATCH', body: JSON.stringify({sha: newCommit, force: false})});
  if ([409, 422].includes(update.status)) return json({error: 'The website changed during publishing. Reload categories and try again.'}, 409);
  if (!update.ok) return json({error: 'Could not publish the category update.'}, 502);
  return json({categories, sha: registrySha, message: 'Published to GitHub. The homepage and catalogue will update after deployment.'}, method === 'POST' ? 201 : 200);
}
