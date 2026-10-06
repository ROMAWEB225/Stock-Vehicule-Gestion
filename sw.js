/* ============================================================
   NTR GARAGE - Service Worker
   Gestion cache PWA + mode hors-ligne
   ============================================================ */

const CACHE_NAME = 'ntr-garage-v1.0.0';
const CACHE_STATIC = 'ntr-static-v1';
const CACHE_DYNAMIC = 'ntr-dynamic-v1';

// Ressources statiques à mettre en cache immédiatement
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // CDN libs (mis en cache au 1er chargement)
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Domaines à ne JAMAIS mettre en cache (Firebase temps réel, Cloudinary upload)
const NO_CACHE_HOSTS = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'identitytoolkit.googleapis.com',
  'cloudinary.com',
  'api.cloudinary.com',
  'res.cloudinary.com'
];

// ============================================================
// INSTALLATION
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        // On met en cache ce qu'on peut (si une ressource échoue, on continue)
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Échec cache:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATION — nettoyage des anciens caches
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => {
            console.log('[SW] Suppression ancien cache:', k);
            return caches.delete(k);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — stratégie
// ============================================================
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Ignorer les requêtes non-GET (POST, PUT, DELETE...)
  if (req.method !== 'GET') return;

  // 2. Ignorer les API temps réel (Firestore, Cloudinary upload)
  if (NO_CACHE_HOSTS.some(h => url.hostname.includes(h))) return;

  // 3. Ignorer les chrome-extension / devtools
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;

  // 4. Navigation (index.html) → Network first, fallback cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_DYNAMIC).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 5. Images Cloudinary (res.cloudinary.com) → Cache first (elles changent rarement)
  if (url.hostname.includes('res.cloudinary.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_DYNAMIC).then(c => c.put(req, copy));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 6. Tout le reste (CSS, JS CDN, fonts) → Cache first, fallback réseau
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Rafraîchir en arrière-plan (stale-while-revalidate)
        fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_DYNAMIC).then(c => c.put(req, copy));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const copy = res.clone();
        caches.open(CACHE_DYNAMIC).then(c => c.put(req, copy));
        return res;
      }).catch(err => {
        console.warn('[SW] Fetch échoué:', req.url, err);
        // Fallback image par défaut si dispo
        return caches.match('./index.html');
      });
    })
  );
});

// ============================================================
// MESSAGES depuis la page (ex: forcer mise à jour)
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

// ============================================================
// SYNC en arrière-plan (si supporté)
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-rondes') {
    console.log('[SW] Sync rondes en attente...');
    // (Optionnel) Tu pourrais pousser ici les rondes faites hors-ligne
  }
});

// ============================================================
// NOTIFICATIONS (si tu veux alerter sur rondes manquantes plus tard)
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
