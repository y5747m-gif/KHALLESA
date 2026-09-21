/**
 * خَلِّصها — offline service worker.
 * Required for the browser's "Install app" prompt and makes the installed app
 * work with no connection (all user data already lives on the device).
 */
const VERSION = 'v__APP_VERSION__';
const CACHE = `khallesa-${VERSION}`;
const ROOT = new URL('./', self.location).href;

const OFFLINE_HOSTS = [
  /fonts\.(googleapis|gstatic)\.com$/,
  /unpkg\.com$/,
  /(^|\.)jsdelivr\.net$/,
  /tesseract\.projectnaptha\.com$/,
  /tessdata\.projectnaptha\.com$/,
];

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './logo.svg',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('khallesa-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin assets that make the app work offline: web fonts + the
  // Tesseract OCR engine/language data (fetched from CDN on first OCR use).
  // Everything else (including the optional AI API) stays untouched.
  if (url.origin !== self.location.origin) {
    if (OFFLINE_HOSTS.some((re) => re.test(url.hostname))) {
      event.respondWith(
        caches.open(`${CACHE}-cdn`).then(async (cache) => {
          const hit = await cache.match(req);
          if (hit) {
            void fetch(req)
              .then((res) => {
                if (res.ok || res.type === 'opaque') void cache.put(req, res.clone());
              })
              .catch(() => undefined);
            return hit;
          }
          const res = await fetch(req);
          if (res.ok || res.type === 'opaque') void cache.put(req, res.clone());
          return res;
        }),
      );
    }
    return;
  }

  // Navigation → network first (so updates appear), offline → cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match('./index.html')) ?? (await cache.match(ROOT)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets → cache first, refresh in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') void cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      return hit ?? (await network) ?? (await cache.match('./index.html')) ?? fetch(req);
    })(),
  );
});
