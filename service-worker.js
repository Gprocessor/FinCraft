const CACHE = 'fincraft-v12'; // bumped: this session touched several core files (chart loader,
// create->approve->activate handlers, group/center/client modals+wiring) — bumping forces the
// activate-phase cache cleanup below to run and guarantees no stale mix of old/new assets.
const ASSETS = [
  './',
  './index.html',
  // CSS — full bundle now
  './css/tokens.css',
  './css/cards.css',
  './css/tables.css',
  './css/forms.css',
  './css/modals.css',
  './css/components.css',
  './css/app.css',
  './css/login.css',
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
  // Modal HTML — split into domain partials (see js/ui/shell.js)
  './views/modals/clients.html',
  './views/modals/loans.html',
  './views/modals/savings-deposits.html',
  './views/modals/shares.html',
  './views/modals/groups-centers.html',
  './views/modals/accounting.html',
  './views/modals/organization.html',
  './views/modals/admin.html',
  './views/modals/products.html',
  './views/modals/integrations.html',
  './views/modals/system.html'
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
  // Network-first for EVERYTHING we control (HTML, JS, CSS), falling back to
  // the cache only when the network is unavailable. This used to be
  // cache-first for JS/CSS, which meant a broken deploy (missing/half-cloned
  // frontend, wrong config.js, etc.) got cached in the browser and kept
  // being served — blank screen — even after the server-side issue was
  // fixed, until this service-worker.js file itself changed. Network-first
  // means a fix on the server is picked up on the very next load.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || (
        (e.request.mode === 'navigate' || e.request.destination === 'document')
          ? caches.match('./index.html')
          : undefined
      )))
  );
});