/*!
 * DOM-Mind presence for any origin (MV3 content script).
 *
 * The bookmarklet cannot register a service worker on a site it does not serve,
 * so on third-party origins the payload has to be present before it can run.
 * This content script supplies that presence: it injects the same payload the
 * bookmarklet loads, on every http(s) page, once per page.
 *
 * Point PAYLOAD at your own build (a tag, not main, once you have released).
 * The injected script tag is subject to the page's CSP, exactly like the
 * bookmarklet; a page that forbids the origin will not load it.
 */
(() => {
  'use strict';

  const PAYLOAD = 'https://raw.githack.com/aomsinjaroensuk15-stack/dom-mind/main/dom-mind.js';

  if (window.__DOMMIND__) return;
  if (document.querySelector('script[data-dom-mind-presence]')) return;

  const script = document.createElement('script');
  script.src = PAYLOAD + '?v=' + Date.now();
  script.setAttribute('data-dom-mind-presence', 'extension');
  script.onerror = () => {
    // Most likely the page CSP blocks the payload origin. Nothing to do here:
    // failing loudly on every page would be worse than staying quiet.
  };
  (document.head || document.documentElement).appendChild(script);
})();
