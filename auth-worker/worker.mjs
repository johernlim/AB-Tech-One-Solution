import {handleStaff} from './staff.mjs';
import {handleCustomer} from './customer.mjs';
import {publicCategoryOrder} from './category-order.mjs';
const cookieName = '__Host-abtech_oauth_state';
const clearCookie = `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const baseHeaders = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'};
function message(text, status = 400) {
  return new Response(text, {status, headers: {...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Set-Cookie': clearCookie}});
}
function popup(origin, payload, status = 'success') {
  const nonce = crypto.randomUUID();
  const safe = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>AB Tech staff login</title><p>Completing sign-in. You can close this window after the editor opens.</p><script nonce="${nonce}">
    const target = ${safe(origin)};
    const result = ${safe('authorization:github:' + status + ':' + JSON.stringify(payload))};
    if (window.opener) {
      function receive(event) {
        if (event.origin !== target || event.source !== window.opener || event.data !== 'authorizing:github') return;
        window.removeEventListener('message', receive);
        window.opener.postMessage(result, target);
        window.close();
      }
      window.addEventListener('message', receive);
      window.opener.postMessage('authorizing:github', target);
    }
  </script></html>`;
  return new Response(html, {headers: {...baseHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearCookie, 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`}});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/public/category-order') return publicCategoryOrder(request, env);
    if (url.pathname.startsWith('/customer/')) return handleCustomer(request, env);
    if (url.pathname.startsWith('/staff/')) return handleStaff(request, env);
    if (request.method !== 'GET') return message('Method not allowed.', 405);
    if (!['/auth', '/callback', '/health', '/status'].includes(url.pathname)) return message('Not found.', 404);
    if (url.pathname === '/health') return message('AB Tech login service is running.', 200);
    const required = ['ALLOWED_ORIGIN', 'GITHUB_REPO', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
    const missing = required.filter(name => !env[name]);
    const invalid = [];
    let origin;
    try {
      origin = new URL(env.ALLOWED_ORIGIN);
      if (origin.protocol !== 'https:' || origin.origin !== env.ALLOWED_ORIGIN) throw new Error();
    } catch { if (env.ALLOWED_ORIGIN) invalid.push('ALLOWED_ORIGIN'); origin = null; }
    if (env.GITHUB_REPO && !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO)) invalid.push('GITHUB_REPO');
    const configured = missing.length === 0 && invalid.length === 0;
    if (url.pathname === '/status') {
      return new Response(JSON.stringify({configured, missing, invalid}), {headers: {
        ...baseHeaders, 'Content-Type': 'application/json',
        ...(origin ? {'Access-Control-Allow-Origin': origin.origin, Vary: 'Origin'} : {})
      }});
    }
    if (!configured) return message('Login service needs owner configuration.', 503);
    if (url.pathname === '/auth') {
      if (url.searchParams.get('provider') && url.searchParams.get('provider') !== 'github') return message('Unsupported login provider.');
      // Ignore caller-supplied scope and redirect URLs; only this repo's public access is needed.
      const state = crypto.randomUUID();
      const github = new URL('https://github.com/login/oauth/authorize');
      github.search = new URLSearchParams({client_id: env.GITHUB_CLIENT_ID, redirect_uri: url.origin + '/callback', scope: 'public_repo', state}).toString();
      return new Response(null, {status: 302, headers: {...baseHeaders, Location: github.href, 'Set-Cookie': `${cookieName}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
    }
    const state = url.searchParams.get('state');
    const cookie = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!state || !cookie || state !== cookie) return message('Sign-in expired or could not be verified. Close this window and try again.');
    if (url.searchParams.has('error') || !url.searchParams.get('code')) return popup(origin.origin, {message: 'GitHub sign-in was cancelled.'}, 'error');
    try {
      const exchange = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: url.origin + '/callback'})
      });
      if (!exchange.ok) throw new Error();
      const token = await exchange.json();
      if (!token.access_token) throw new Error();
      const repository = await fetch('https://api.github.com/repos/' + env.GITHUB_REPO, {
        headers: {Authorization: 'Bearer ' + token.access_token, Accept: 'application/vnd.github+json', 'User-Agent': 'AB-Tech-Catalogue-Admin', 'X-GitHub-Api-Version': '2022-11-28'}
      });
      if (!repository.ok || !(await repository.json()).permissions?.push) return popup(origin.origin, {message: 'Your GitHub account needs write access to the catalogue repository.'}, 'error');
      return popup(origin.origin, {token: token.access_token, provider: 'github'});
    } catch {
      return popup(origin.origin, {message: 'Sign-in could not complete. Please retry or contact the website owner.'}, 'error');
    }
  }
};
