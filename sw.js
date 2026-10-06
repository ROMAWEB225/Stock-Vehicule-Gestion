const CACHE_NAME = "stock-vehicules-v3";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js",
  "https://cdn.jsdelivr.net/npm/docx@8.0.0/build/index.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("fetch", event => {
  // Ne pas intercepter Firebase, Cloudinary, ni les requêtes dynamiques
  if (event.request.url.includes("firestore.googleapis.com") ||
      event.request.url.includes("firebaseapp.com") ||
      event.request.url.includes("gstatic.com/firebasejs") ||
      event.request.url.includes("cloudinary.com")) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});
