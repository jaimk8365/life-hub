/* Life Hub service worker — network-first with offline fallback to cache. */
const CACHE = 'lifehub-v40';
const PRECACHE = [
  './finance/app.html', './finance/standalone.js', './finance/manifest.webmanifest',
  './', './index.html', './manifest.webmanifest', './sync.js', './theme-jaimi.css', './theme-matthew.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './hub/index.html', './finance/index.html', './partner/index.html', './plan/index.html',
  './partner-sync.js', './finance/money-map.js', './finance/money-map.css', './finance/csv-batch.js', './finance/account-migrations.js', './finance/shared-budget.js', './finance/ui-safety.js', './finance/wealth-coach.js',
  './quest/index.html', './course/index.html', './task-engine/index.html',
  './task-engine/models/index.mjs', './task-engine/logic/index.mjs', './task-engine/store/index.mjs', './task-engine/ui/index.mjs'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => /^lifehub-v\d+$/.test(k) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Never intercept authenticated Gist/API requests or other apps' resources.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}));
        }
        return res;
      })
      .catch(async error => {
        const cached = await (await caches.open(CACHE)).match(e.request, { ignoreSearch: true });
        if (cached) return cached;
        throw error;
      })
  );
});
