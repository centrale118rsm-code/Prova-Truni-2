// Service worker: l'app si apre anche senza rete. I file dell'app vengono serviti
// subito dalla cache e aggiornati in background (alla riapertura c'è l'ultima versione).
const CACHE = 'turni118-v1';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css', './css/myshifts.css', './js/views/myshifts.js',
  './js/app.js', './js/store.js', './js/calc.js', './js/util.js', './js/ui.js', './js/profile.js', './js/excel.js',
  './js/views/calendar.js', './js/views/me.js', './js/views/requests.js', './js/views/counts.js', './js/views/sheets.js', './js/views/team.js', './js/views/admin.js',
  './assets/icon-118-192.png', './assets/apple-touch-icon.png', './data/seed-autisti-2026.json'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/data/cloud.json')) return;   // configurazione cloud: sempre dalla rete
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
