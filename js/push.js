// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICHE SUL TELEFONO
//  • subito, senza server: quando arriva una notifica per te e l'app è aperta o in background,
//    il telefono la mostra come notifica di sistema;
//  • con il cloud collegato (e la chiave VAPID in data/cloud.json) il telefono si iscrive alle
//    notifiche "push": il motore su GitHub le manda anche ad app chiusa.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from './store.js';
import { sha256 } from './util.js';

export const notifSupported = () => 'Notification' in window;
export const notifState = () => !notifSupported() ? 'non supportate' : Notification.permission;
const pushReady = () => !!(store.adapter.kind === 'cloud' && store.cloudCfg && store.cloudCfg.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && location.protocol === 'https:');

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Chiede il permesso e, se possibile, iscrive il telefono alle notifiche push
export async function enableNotifications() {
  if (!notifSupported()) throw new Error('Questo browser non supporta le notifiche. Su iPhone installa prima l’app sulla schermata Home.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permesso negato: puoi riattivarlo dalle impostazioni del browser');
  store.lsSet(`${store.ns}:notifOn`, true);
  if (!pushReady()) return 'local';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(store.cloudCfg.vapidPublicKey) });
  const id = (await sha256(sub.endpoint)).slice(0, 32);
  await store.adapter.addItem('push', id, { ts: Date.now(), op: store.me || null, manager: store.isManager(), profile: store.profile.key, sub: JSON.parse(JSON.stringify(sub)), ua: navigator.userAgent.slice(0, 120) });
  store.lsSet(`${store.ns}:pushId`, id);
  return 'push';
}
export async function disableNotifications() {
  store.lsSet(`${store.ns}:notifOn`, false);
  const id = store.lsGet(`${store.ns}:pushId`);
  if (id) { try { await store.adapter.deleteItem('push', id); } catch (e) { } store.lsSet(`${store.ns}:pushId`, null); }
  if ('serviceWorker' in navigator) { try { const reg = await navigator.serviceWorker.getRegistration(); const s = reg && await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch (e) { } }
}

async function show(title, body, tag) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    const opt = { body, tag, icon: 'assets/icon-118-192.png', badge: 'assets/icon-118-192.png', data: { url: location.href.split('#')[0] + '#/notifiche' } };
    if (reg) await reg.showNotification(title, opt); else new Notification(title, opt);
  } catch (e) { console.warn('Notifica non mostrata', e); }
}

// Notifiche locali: mostra quelle nuove arrivate mentre l'app è aperta (anche in un'altra scheda o in background)
export function watchLocalNotifications() {
  const seen = new Set(store.lsGet(`${store.ns}:notifShown`) || []);
  const bootTs = Date.now() - 5 * 60e3;
  const check = () => {
    if (!notifSupported() || Notification.permission !== 'granted' || store.lsGet(`${store.ns}:notifOn`) === false) return;
    for (const [id, n] of store.myNotif()) {
      if (n.read || seen.has(id) || n.ts < bootTs) continue;
      seen.add(id);
      if (document.visibilityState === 'visible' && document.hasFocus()) continue;   // già visibile nell'app
      const body = n.body || (n.dates ? `${n.dates.length} giorn${n.dates.length === 1 ? 'o' : 'i'} modificat${n.dates.length === 1 ? 'o' : 'i'}` : '');
      show(n.title, body, n.kind || 'turni');
    }
    store.lsSet(`${store.ns}:notifShown`, [...seen].slice(-300));
  };
  store.on(w => { if (w === 'notif') check(); });
  check();
}
