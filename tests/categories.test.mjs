import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStaff} from '../auth-worker/staff.mjs';
const origin = 'https://ab-tech-one-solution.pages.dev';
const category = {name: 'Smart Home', slug: 'smart-home', description: 'Connected home devices.', icon: 'network'};
const existing = {name: 'CCTV Systems', slug: 'cctv', description: 'Cameras.', icon: 'cctv'};
const env = {ALLOWED_ORIGIN: origin, GITHUB_REPO: 'johernlim/AB-Tech-One-Solution', STAFF_PASSWORD_PEPPER: 'p'.repeat(32), GITHUB_CATALOGUE_TOKEN: 'test-only-token', STAFF_DB: {prepare() {return {bind() {return this;}, async first() {return {id: 'user', username: 'staff'};}};}}};
const request = (path, method, data, authenticated = true) => new Request('https://auth.test/staff/' + path, {method, headers: {Origin: origin, 'Content-Type': 'application/json', ...(authenticated ? {Authorization: 'Bearer ' + 'a'.repeat(64)} : {})}, ...(data ? {body: JSON.stringify(data)} : {})});
async function withGit(run, {reserved = false, conflict = false, initialCategory = existing, initialCategories = [initialCategory]} = {}) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.headers.Authorization, 'Bearer test-only-token');
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({url, method: options.method || 'GET', body});
    if (url.includes('/contents/data/categories.json?')) return Response.json({sha: 'b'.repeat(40), content: Buffer.from(JSON.stringify({categories: initialCategories})).toString('base64')});
    if (url.endsWith('/git/ref/heads/main')) return Response.json({object: {sha: 'c'.repeat(40)}});
    if (url.includes('/contents/data/categories/smart-home.json?')) return new Response('', {status: reserved ? 200 : 404});
    if (url.includes('/contents/data/categories/cctv.json?')) return Response.json({content: Buffer.from(JSON.stringify({products:[{id:'camera',category:existing.name,name:'Camera'}]})).toString('base64')});
    if (url.includes('/contents/data/pwp-offers.json?')) return Response.json({content: Buffer.from(JSON.stringify({offers:[{id:'kit',qualifiers:['CCTV Systems:camera'],addons:[{key:'PWP Products:card',price:20}]}]})).toString('base64')});
    if (url.includes('/contents/data/discount-promotions.json?')) return Response.json({content:Buffer.from(JSON.stringify({promotions:[{id:'sale',products:[{key:'CCTV Systems:camera',mode:'price',value:80,limit:100}]}]})).toString('base64')});
    if (url.endsWith('/git/commits/' + 'c'.repeat(40))) return Response.json({tree: {sha: 'd'.repeat(40)}});
    if (url.endsWith('/git/blobs')) return Response.json({sha: 'e'.repeat(40)});
    if (url.endsWith('/git/trees')) return Response.json({sha: 'f'.repeat(40)});
    if (url.endsWith('/git/commits')) return Response.json({sha: '1'.repeat(40)});
    if (url.endsWith('/git/refs/heads/main')) return new Response('', {status: conflict ? 422 : 200});
    throw new Error('Unexpected GitHub request: ' + url);
  };
  try {await run(calls);} finally {globalThis.fetch = original;}
}
test('Authenticated category add creates the list and empty product file in one non-forced commit', async () => {
  await withGit(async calls => {
    const response = await handleStaff(request('categories', 'POST', {sha: 'b'.repeat(40), category}), env);
    assert.equal(response.status, 201);
    const result = await response.json(); assert.equal(result.categories.length, 2);
    const tree = calls.find(c => c.url.endsWith('/git/trees')).body;
    assert.equal(tree.base_tree, 'd'.repeat(40));
    assert.deepEqual(tree.tree.map(t => t.path), ['data/categories.json', 'data/categories/smart-home.json']);
    assert.deepEqual(JSON.parse(tree.tree[1].content), {products: []});
    const blob = calls.find(c => c.url.endsWith('/git/blobs')).body;
    assert.equal(JSON.parse(Buffer.from(blob.content, 'base64')).categories[1].name, 'Smart Home');
    assert.deepEqual(calls.find(c => c.url.endsWith('/git/commits')).body.parents, ['c'.repeat(40)]);
    assert.equal(calls.at(-1).body.force, false);
  });
});
test('Removing a category updates only the shared list and preserves product files', async () => {
  await withGit(async calls => {
    const response = await handleStaff(request('categories/cctv', 'DELETE', {sha: 'b'.repeat(40)}), env);
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).categories, []);
    assert.deepEqual(calls.find(c => c.url.endsWith('/git/trees')).body.tree.map(t => t.path), ['data/categories.json']);
    assert.equal(calls.some(c => c.method === 'DELETE'), false);
  });
});
test('Missing authentication, invalid paths, duplicates and stale lists cannot publish categories', async () => {
  assert.equal((await handleStaff(request('categories', 'POST', {sha: 'b'.repeat(40), category}, false), env)).status, 401);
  for (const [data, status] of [[{sha: 'a'.repeat(40), category}, 409], [{sha: 'b'.repeat(40), category: existing}, 409], [{sha: 'b'.repeat(40), category: {...category, slug: '../secrets'}}, 400], [{sha: 'b'.repeat(40), category: {...category, icon: '../../secret'}}, 400]]) {
    await withGit(async calls => {assert.equal((await handleStaff(request('categories', 'POST', data), env)).status, status); assert.equal(calls.some(c => c.method === 'POST' || c.method === 'PATCH'), false);});
  }
});
test('Retired category IDs and concurrent branch changes are rejected', async () => {
  await withGit(async () => {assert.equal((await handleStaff(request('categories', 'POST', {sha: 'b'.repeat(40), category}), env)).status, 409);}, {reserved: true});
  await withGit(async () => {assert.equal((await handleStaff(request('categories', 'POST', {sha: 'b'.repeat(40), category}), env)).status, 409);}, {conflict: true});
});
test('Product editing uses the shared list and rejects removed categories', async () => {
  await withGit(async () => {assert.equal((await handleStaff(request('categories/smart-home', 'PUT', {sha: 'a'.repeat(40), products: []}), env)).status, 404);});
});
test('Category rename atomically updates product and PWP references and preserves old cart/link names',async()=>{
  await withGit(async calls=>{
    const response=await handleStaff(request('categories/cctv','PATCH',{sha:'b'.repeat(40),category:{...existing,name:'Security Cameras',description:'Updated description.'}}),env);
    assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.categories[0].aliases,['CCTV Systems']);
    const tree=calls.find(c=>c.url.endsWith('/git/trees')).body.tree;
    assert.deepEqual(tree.map(t=>t.path),['data/categories.json','data/categories/cctv.json','data/pwp-offers.json','data/discount-promotions.json']);
    assert.equal(JSON.parse(tree[3].content).promotions[0].products[0].key,'Security Cameras:camera');
    assert.equal(JSON.parse(tree[1].content).products[0].category,'Security Cameras');assert.equal(JSON.parse(tree[2].content).offers[0].qualifiers[0],'Security Cameras:camera');
    assert.equal(calls.at(-1).body.force,false);
  });
});
test('Category editing keeps IDs fixed, checks conflicts and requires staff authentication',async()=>{
  assert.equal((await handleStaff(request('categories/cctv','PATCH',{sha:'b'.repeat(40),category:existing},false),env)).status,401);
  await withGit(async()=>{assert.equal((await handleStaff(request('categories/cctv','PATCH',{sha:'b'.repeat(40),category:{...existing,slug:'renamed'}}),env)).status,400);});
  await withGit(async()=>{assert.equal((await handleStaff(request('categories/cctv','PATCH',{sha:'a'.repeat(40),category:existing}),env)).status,409);});
  await withGit(async calls=>{
    assert.equal((await handleStaff(request('categories/cctv','PATCH',{sha:'b'.repeat(40),category:{...existing,icon:'alarm',description:'Updated.'}}),env)).status,200);
    assert.deepEqual(calls.find(c=>c.url.endsWith('/git/trees')).body.tree.map(t=>t.path),['data/categories.json']);
  });
});

test('Visibility can hide and restore categories without rewriting products; editing preserves hidden state',async()=>{
  for(const [initialCategory,patch,expected] of [[existing,{...existing,visible:false},false],[{...existing,visible:false},{...existing,visible:true},true],[{...existing,visible:false},{...existing,description:'Edited.'},false]]){
    await withGit(async calls=>{
      const response=await handleStaff(request('categories/cctv','PATCH',{sha:'b'.repeat(40),category:patch}),env);
      assert.equal(response.status,200);assert.equal((await response.json()).categories[0].visible,expected);
      assert.deepEqual(calls.find(c=>c.url.endsWith('/git/trees')).body.tree.map(t=>t.path),['data/categories.json']);
    },{initialCategory});
  }
  await withGit(async()=>{assert.equal((await handleStaff(request('categories/cctv','PATCH',{sha:'b'.repeat(40),category:{...existing,visible:'false'}}),env)).status,400);});
  await withGit(async()=>{const result=await handleStaff(request('categories','POST',{sha:'b'.repeat(40),category}),env);assert.equal((await result.json()).categories[1].visible,true);});
});

test('Custom category icons persist on create and edit; unsafe paths and unsupported formats are rejected',async()=>{
  const icon='assets/uploads/custom-icon.png';
  await withGit(async()=>{const response=await handleStaff(request('categories','POST',{sha:'b'.repeat(40),category:{...category,icon}}),env);assert.equal(response.status,201);assert.equal((await response.json()).categories[1].icon,icon);});
  await withGit(async()=>{const response=await handleStaff(request('categories/cctv','PATCH',{sha:'b'.repeat(40),category:{...existing,icon:'network'}}),env);assert.equal(response.status,200);assert.equal((await response.json()).categories[0].icon,'network');},{initialCategory:{...existing,icon}});
  for(const icon of ['https://evil.test/image.png','assets/uploads/../image.png','assets/uploads/icon.svg','assets/uploads/icon.jpg','assets/uploads/icon.png?x=1'])await withGit(async()=>{assert.equal((await handleStaff(request('categories','POST',{sha:'b'.repeat(40),category:{...category,icon}}),env)).status,400);});
});
