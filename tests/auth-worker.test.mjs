import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../auth-worker/worker.mjs';

const env = {ALLOWED_ORIGIN: 'https://catalogue.pages.dev', GITHUB_REPO: 'johernlim/AB-Tech-One-Solution', GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret'};
const request = (path, cookie) => new Request('https://auth.workers.dev' + path, {headers: cookie ? {Cookie: cookie} : {}});

test('Unconfigured service refuses login', async () => {
  assert.equal((await worker.fetch(request('/auth'), {})).status, 503);
});
test('Auth uses fixed scope, callback and secure state cookie', async () => {
  const response = await worker.fetch(request('/auth?provider=github&scope=repo&redirect_uri=https://evil.example'), env);
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get('Location'));
  assert.equal(target.origin, 'https://github.com');
  assert.equal(target.searchParams.get('scope'), 'public_repo');
  assert.equal(target.searchParams.get('redirect_uri'), 'https://auth.workers.dev/callback');
  assert.ok(target.searchParams.get('state'));
  const cookie = response.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  assert.ok(cookie.includes(target.searchParams.get('state')));
});
test('Unsupported provider and unsafe origin configuration are rejected', async () => {
  assert.equal((await worker.fetch(request('/auth?provider=gitlab'), env)).status, 400);
  assert.equal((await worker.fetch(request('/auth'), {...env, ALLOWED_ORIGIN: 'https://catalogue.pages.dev/path'})).status, 503);
});
test('Callback rejects missing or mismatched state before contacting GitHub', async () => {
  assert.equal((await worker.fetch(request('/callback?code=fake&state=one'), env)).status, 400);
  const response = await worker.fetch(request('/callback?code=fake&state=one', '__Host-abtech_oauth_state=two'), env);
  assert.equal(response.status, 400);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});
test('Cancelled login returns an error only to the configured opener', async () => {
  const response = await worker.fetch(request('/callback?error=access_denied&state=one', '__Host-abtech_oauth_state=one'), env);
  const html = await response.text();
  assert.match(html, /authorization:github:error/);
  assert.ok(html.includes('event.origin !== target || event.source !== window.opener'));
  assert.ok(html.includes('https://catalogue.pages.dev'));
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});
test('Only accounts with repository push access receive a token', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const push of [false, true]) {
      globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('access_token') ? {access_token: 'test-access-token'} : {permissions: {push}}), {headers: {'Content-Type': 'application/json'}});
      const response = await worker.fetch(request('/callback?code=valid&state=one', '__Host-abtech_oauth_state=one'), env);
      const html = await response.text();
      assert.equal(html.includes('authorization:github:success'), push);
      assert.equal(html.includes('test-access-token'), push);
      assert.ok(!html.includes('test-secret'));
      assert.match(response.headers.get('Cache-Control'), /no-store/);
    }
  } finally { globalThis.fetch = originalFetch; }
});
