/* Life Hub service worker — network-first with offline fallback to cache. */
const CACHE = 'lifehub-v34';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './sync.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './hub/index.html', './quest/index.html', './course/index.html', './task-engine/index.html',
  './task-engine/models/index.mjs', './task-engine/logic/index.mjs', './task-engine/store/index.mjs', './task-engine/ui/index.mjs'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
