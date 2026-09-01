// Camargos Finance — service worker.
// Estratégia: network-first para o HTML/JS (para as correções chegarem depressa),
// cache-first para o resto. O Firestore trata dos dados offline sozinho.
const CACHE = 'camargos-finance-v11';
const BASE = new URL('./', self.location).pathname;
const ESSENCIAIS = [
  BASE, BASE + 'index.html', BASE + 'app.js', BASE + 'manifest.json',
  BASE + 'icon-192.png', BASE + 'icon-512.png', BASE + 'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca interceptar chamadas ao Firestore/Auth — teriam de ir sempre à rede
  // e o SDK já sabe funcionar offline.
  if (url.hostname.indexOf('googleapis.com') >= 0 ||
      url.hostname.indexOf('firebaseio.com') >= 0 ||
      url.hostname.indexOf('firebaseapp.com') >= 0) return;

  const mesmaOrigem = url.origin === self.location.origin;

  if (mesmaOrigem) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return r;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(BASE + 'index.html')))
    );
    return;
  }

  // SDK do Firebase servido pelo gstatic: cache-first, para arrancar sem rede.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copia));
      return r;
    }))
  );
});
