/*!
 * DOM-Mind presence worker v2.1.0
 *
 * Rewrites same-origin HTML navigations to load dom-mind.js, so a mission keeps
 * running across pages without the bookmarklet being clicked again.
 *
 * Host this file at the root of the origin it should cover (for the bench:
 * http://127.0.0.1:8123/presence-sw.js). A bookmarklet cannot register a worker
 * on somebody else's site: the spec requires the script URL to be same-origin
 * and http(s), so blob: and data: are rejected. Presence therefore works on
 * origins you serve yourself, and only there.
 *
 * Remove it at any time: the HUD's "Disable presence" button unregisters this
 * scope (and only this scope) through navigator.serviceWorker.getRegistrations().
 */
'use strict';

const PAYLOAD = '/dom-mind.js';
const MARK = 'data-dom-mind-presence';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'claim') event.waitUntil(self.clients.claim());
});

function passthrough(response, html) {
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function inject(response) {
  const type = response.headers.get('content-type') || '';
  if (!/text\/html/i.test(type)) return response;
  const html = await response.text();
  if (html.indexOf(MARK) !== -1) return passthrough(response, html);

  const tag = '<script src="' + PAYLOAD + '" ' + MARK + '="' + Date.now() + '" defer></script>';
  const at = html.lastIndexOf('</body>');
  const out = at === -1 ? html + tag : html.slice(0, at) + tag + html.slice(at);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  headers.delete('last-modified');
  return new Response(out, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === PAYLOAD) return;

  event.respondWith((async () => {
    try {
      return await inject(await fetch(request));
    } catch (err) {
      return fetch(request);
    }
  })());
});
