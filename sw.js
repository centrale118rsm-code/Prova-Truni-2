// Service worker: l'app si apre anche senza rete. I file dell'app vengono serviti
// subito dalla cache e aggiornati in background (alla riapertura c'è l'ultima versione).
// Riceve anche le notifiche push mandate dal motore su GitHub.
const CACHE = 'turni118-v2';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css', './css/myshifts.css', './css/extra.css',
  './js/app.js', './js/store.js', './js/calc.js', './js/util.js', './js/ui.js', './js/profile.js', './js/excel.js', './js/push.js', './js/gen.js',
  './js/views/calendar.js', './js/views/me.js', './js/views/myshifts.js', './js/views/requests.js', './js/views/counts.js', './js/views/sheets.js', './js/views/team.js', './js/views/admin.js', './js/views/market.js', './js/views/pay.js',
  './assets/icon-118-192.png', './assets/apple-touch-icon.png', './data/seed-autisti-2026.json', './data/seed-infermieri-2026.json'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/data/cloud.json') || url.pathname.includes('/cal/')) return;   // sempre dalla rete
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// ── Notifiche push ──
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'Turni 118', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Turni 118', {
    body: d.body || '', tag: d.tag || 'turni', icon: 'assets/icon-118-192.png', badge: 'assets/icon-118-192.png',
    data: { url: d.url || './#/notifiche' }, renotify: true
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
