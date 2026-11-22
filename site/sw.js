// Opens like an app and shows Kevin offline; talking to him always needs the network.
const CACHE = 'kevin-v3';
const SHELL = ['/', '/app.js', '/link.js', '/card.js', '/favicon.svg', '/fonts/shrikhand.woff2', '/fonts/archivo.woff2', '/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/verdicts')) return;
  // network first so a new Kevin shows up at once; the cache only covers being offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && SHELL.includes(u.pathname)) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(u.pathname, copy)); }
    return r;
  }).catch(() => caches.match(u.pathname === '/' || e.request.mode === 'navigate' ? '/' : u.pathname)));
});
