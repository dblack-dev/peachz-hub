/* Peachz Hub — Service Worker
 * - Precache App Shell (./, ./index.html, ./manifest.json)
 * - Network-first for page navigation & HTML
 * - Bypass Firestore / Firebase Auth / Gemini API / Google APIs
 */
const VERSION = 'v1.6.0';
const CACHE_NAME = 'peachz-hub-' + VERSION;
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icon-256.png'
];

const BYPASS_HOSTS = new Set([
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'generativelanguage.googleapis.com',
  'translation.googleapis.com',
  'apis.google.com',
  'accounts.google.com'
]);

const CDN_HOSTS = new Set([
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('peachz-hub-') && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (
    BYPASS_HOSTS.has(url.hostname) ||
    url.hostname.includes('firebase') ||
    (url.hostname.includes('googleapis.com') && !CDN_HOSTS.has(url.hostname)) ||
    (url.hostname.includes('gstatic.com') && !CDN_HOSTS.has(url.hostname))
  ) {
    return;
  }

  // Page navigation or HTML requests: network-first with cached fallback
  const acceptHeader = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || (url.origin === self.location.origin && (url.pathname.endsWith('.html') || acceptHeader.includes('text/html')))) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && url.origin === self.location.origin) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html', { ignoreSearch: true });
        return cached || new Response('ออฟไลน์อยู่ และยังไม่มีข้อมูลในแคช', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Same-origin assets & CDN stale-while-revalidate
  if (url.origin === self.location.origin || CDN_HOSTS.has(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await caches.match(req, { ignoreSearch: true });
      const fetchPromise = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone());
        }
        return res;
      }).catch(() => null);
      return cached || await fetchPromise || new Response('', { status: 504 });
    })());
  }
});
