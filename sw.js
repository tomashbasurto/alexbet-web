// AlexBet · service worker: la app abre sin conexión y siempre intenta traer la versión más nueva primero.
const CACHE = 'alexbet-shell-v38-9';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'premium.js', 'tenis.js', 'combinadas.js', 'oficial.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return; // ESPN, football-data, etc. van directo a la red
  e.respondWith(
    fetch(new Request(r.url, {cache: 'no-cache', credentials: 'same-origin'})).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(r).then(m => m || caches.match('index.html')))
  );
});
// Notificaciones de AlexBet (Firebase Cloud Messaging): el servidor manda título y texto, aquí se muestran.
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = {notification: {title: 'AlexBet', body: e.data ? e.data.text() : ''}}; }
  const n = d.notification || d.data || {}, data = d.data || {};
  e.waitUntil(self.registration.showNotification(n.title || 'AlexBet', {body: n.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: data.tag || undefined, data: {link: data.link || './'}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
