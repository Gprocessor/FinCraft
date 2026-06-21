const CACHE = 'fincraft-v1';
const ASSETS = ['./','./index.html','./css/tokens.css','./css/components.css','./css/login.css',
  './js/app.js','./js/config.js','./js/api.js','./js/auth.js','./js/router.js','./js/store.js',
  './js/ui.js','./js/utils.js','./js/data.js','./js/cmd.js','./js/remit.js',
  './manifest.json','./favicon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.includes('/fineract-provider/')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
