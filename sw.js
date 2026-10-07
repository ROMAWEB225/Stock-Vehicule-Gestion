/* ============================================================
   NTR GARAGE — Service Worker
   Cache PWA + mode hors-ligne
   ============================================================ */

const CACHE_STATIC = 'ntr-static-v1';
const CACHE_DYNAMIC = 'ntr-dynamic-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/docx@8.0.0/build/index.min.js'
];

// Domaines a NE JAMAIS mettre en cache (temps reel + uploads)
const NO_CACHE_HOSTS = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'identitytoolkit.googleapis.com',
  'api.cloudinary.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Cache fail:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (NO_CACHE_HOSTS.some((h) => url.hostname.includes(h))) return;
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_DYNAMIC).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.hostname.includes('res.cloudinary.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_DYNAMIC).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_DYNAMIC).then((c) => c.put(req, copy));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const copy = res.clone();
          caches.open(CACHE_DYNAMIC).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
