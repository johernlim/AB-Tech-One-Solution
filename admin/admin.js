'use strict';
const demo = new URLSearchParams(location.search).get('demo') === '1';
const categories = ['CCTV Systems', 'Alarm Systems', 'Door Access Control', 'Computers & Laptops', 'POS Systems', 'Network Infrastructure', 'WiFi Solutions', 'Server Solutions', 'Software Solutions', 'Digital Signage'];
const liveButton = document.getElementById('open-live');

function config(settings, isDemo) {
  return {
    load_config_file: false,
    backend: isDemo ? {name: 'test-repo'} : {name: 'github', repo: settings.repo, branch: settings.branch, base_url: settings.auth_base_url, auth_endpoint: 'auth'},
    media_folder: 'assets/uploads', public_folder: 'assets/uploads',
    site_url: new URL('../', location.href).href,
    display_url: new URL('../catalogue.html', location.href).href,
    logo_url: new URL('../assets/logo.png', location.href).href,
    collections: [{
      name: 'catalogue', label: 'Product catalogue', description: 'Open Products, expand an item to edit, or use Add product. Save publishes the whole catalogue. Keep Example enabled until information is verified.',
      files: [{name: 'products', label: 'Products', file: 'data/products.json', fields: [{
        name: 'products', label: 'Products', widget: 'list', label_singular: 'Product', summary: '{{fields.name}} — {{fields.category}}', collapsed: true,
        fields: [
          {name: 'id', label: 'Product ID', widget: 'string', hint: 'A unique short ID, such as indoor-camera-4mp.', pattern: ['^[a-z0-9]+(?:-[a-z0-9]+)*$', 'Use lowercase letters, numbers and hyphens.']},
          {name: 'name', label: 'Product name', widget: 'string'},
          {name: 'category', label: 'Category', widget: 'select', options: categories},
          {name: 'description', label: 'Description', widget: 'text'},
          {name: 'image', label: 'Main photo', widget: 'image', allow_multiple: false, choose_url: false, hint: 'Upload a compressed JPG, PNG or WebP. Aim for less than 500 KB.'},
          {name: 'gallery', label: 'Extra photos', widget: 'list', required: false, field: {name: 'photo', label: 'Photo', widget: 'image', allow_multiple: false, choose_url: false}},
          {name: 'price_mode', label: 'Price display', widget: 'select', options: [{label: 'Fixed price', value: 'fixed'}, {label: 'From this price', value: 'from'}, {label: 'Request a quote', value: 'quote'}], default: 'fixed'},
          {name: 'price', label: 'Price (RM)', widget: 'number', value_type: 'float', min: 0, step: 0.01, default: 0, hint: 'Ignored when Price display is Request a quote.'},
          {name: 'specifications', label: 'Specifications', widget: 'list', required: false, field: {name: 'specification', label: 'Specification', widget: 'string'}},
          {name: 'installation', label: 'Installation note', widget: 'string', default: 'Installation quoted separately.'},
          {name: 'availability', label: 'Availability', widget: 'string', default: 'Contact us to confirm availability'},
          {name: 'published', label: 'Visible in catalogue', widget: 'boolean', default: false, hint: 'Hidden items remain in the public repository and JSON file. Do not store confidential information here.'},
          {name: 'example', label: 'Example product', widget: 'boolean', default: true, hint: 'Turn off only after the product, image and price have been confirmed.'}
        ]
      }]}]
    }]
  };
}

async function openEditor(settings, isDemo) {
  try {
    if (isDemo) {
      const response = await fetch('../data/products.json');
      if (!response.ok) throw new Error('Could not load example products.');
      // Seed Decap's in-memory test repository. This never writes to GitHub.
      window.repoFiles = {data: {'products.json': {path: 'data/products.json', content: JSON.stringify(await response.json())}}};
    }
    document.getElementById('admin-home').hidden = true;
    document.getElementById('editor-notice').hidden = false;
    document.getElementById('editor-notice-text').textContent = isDemo ? 'DEMO — Changes stay in this tab and reset on reload. The public catalogue is unchanged.' : 'LIVE EDITOR — Saving publishes to GitHub. Allow time for the website deployment.';
    document.body.classList.add('editor-open');
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/decap-cms@3.16.3/dist/decap-cms.js';
    await new Promise((resolve, reject) => {script.onload = resolve; script.onerror = () => reject(new Error('The editor could not download. Check your connection and reload.')); document.head.append(script);});
    window.CMS.init({config: config(settings, isDemo)});
    window.CMS.registerPreviewStyle(new URL('../styles.css', location.href).href);
    window.CMS.registerPreviewStyle(new URL('../catalogue.css', location.href).href);
    window.CMS.registerPreviewTemplate('products', ({entry, getAsset}) => {
      const list = entry.getIn(['data', 'products']);
      const items = list ? list.toJS() : [];
      const h = window.h;
      return h('div', {style: {padding: '24px', background: '#16232c', minHeight: '100vh'}},
        h('h2', {style: {marginBottom: '12px'}}, 'Catalogue preview'),
        h('p', {style: {marginBottom: '24px', fontSize: '12px'}}, 'Only visible products appear on the public website.'),
        h('div', {className: 'products-grid', style: {gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))'}}, ...items.filter(p => p.published).map((p, index) => {
          let image = p.image || '';
          if (image.startsWith('assets/products/')) image = new URL('../' + image, location.href).href;
          else if (image) image = String(getAsset(image));
          return h('article', {className: 'product-card', key: index},
            h('img', {src: image, alt: p.name || '', style: {width: '100%', aspectRatio: '16/11', objectFit: 'contain'}}),
            h('div', {className: 'product-card-copy'},
              h('span', {className: 'product-category'}, p.category),
              h('h3', null, p.name), h('p', null, p.description),
              h('p', {style: {color: '#d4fcee', fontSize: '20px'}}, p.price_mode === 'quote' ? 'Request a quote' : (p.price_mode === 'from' ? 'From ' : '') + new Intl.NumberFormat('en-MY', {style: 'currency', currency: 'MYR'}).format(p.price || 0)),
              p.example ? h('span', {className: 'sample-badge'}, 'EXAMPLE PRODUCT') : null));
        })));
    });
  } catch (error) {
    const message = document.getElementById('editor-error'); message.hidden = false; message.textContent = error.message;
  }
}
if (demo) {
  openEditor(null, true);
} else {
  fetch('settings.json', {cache: 'no-store'}).then(response => {if (!response.ok) throw new Error(); return response.json();}).then(async settings => {
    if (!settings.auth_base_url) {
      liveButton.textContent = 'Login setup pending';
      document.getElementById('setup-status').textContent = 'The owner needs to connect GitHub login once. You can try the editor demo now.';
      return;
    }
    const authURL = new URL(settings.auth_base_url);
    if (authURL.protocol !== 'https:') throw new Error();
    const response = await fetch(new URL('/status', authURL), {cache: 'no-store', signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error();
    const status = await response.json();
    if (!status.configured) {
      liveButton.textContent = 'Login setup pending';
      document.getElementById('setup-status').textContent = 'Login settings need attention: ' + [...status.missing, ...status.invalid].join(', ') + '. The editor demo is still available.';
      return;
    }
    document.getElementById('setup-status').textContent = 'GitHub login is connected. Sign in with an account that has write access to the catalogue repository.';
    liveButton.disabled = false; liveButton.textContent = 'Open live editor ↗';
    liveButton.addEventListener('click', () => openEditor(settings, false), {once: true});
  }).catch(() => {
    liveButton.textContent = 'Connection unavailable';
    document.getElementById('setup-status').textContent = 'The login service could not be reached. Use the admin page on ab-tech-one-solution.pages.dev and try again shortly. The editor demo is still available.';
  });
}
