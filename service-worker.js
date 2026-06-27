const CACHE = 'fincraft-v3';
const ASSETS = [
  './',
  './index.html',
  // CSS — full bundle now
  './css/tokens.css',
  './css/components.css',
  './css/app.css',
  './css/login.css',
  './css/fincraft-shell.css', 
  // Core JS
  './js/app.js',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/router.js',
  './js/store.js',
  './js/ui.js',
  './js/utils.js',
  './js/data.js',
  './js/cmd.js',
  './js/remit.js',
  './js/modal-init.js',
  // Assets
  './manifest.json',
  './favicon.svg',
  // Modal HTML
  './views/modals.html'
];

self.addEventListener('install', e =>
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(err => console.warn('[SW] Some assets failed to cache:', err)))
      .then(() => self.skipWaiting())
  )
);

// Clean up any old caches when the new SW activates
self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Never cache API calls — always go to the network
  if (u.pathname.includes('/fineract-provider/')) return;
  // Network-first for HTML (so updates ship immediately) — cache-first otherwise
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});