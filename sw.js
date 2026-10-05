/* Service worker: offline app shell. Only same-origin GETs are cached; AI API calls are never touched. */
const CACHE = 'bizzle-designer-v1.3.1';
const SHELL = ['./', './index.html', './css/styles.css', './js/fallback-data.js', './js/generator.js', './js/ai.js', './js/app.js',
  './data/trends.json', './manifest.webmanifest', './icons/icon.svg', './img/bizzle.jpg', './img/jinxy.jpg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('/data/trends.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  if (networkFirst) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
});
