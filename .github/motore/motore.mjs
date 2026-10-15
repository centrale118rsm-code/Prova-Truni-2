// Motore dei calendari in abbonamento e delle notifiche push (gira su GitHub Actions).
// Per ogni reparto (autisti, infermieri):
//  1. apre l'app pubblicata in un browser invisibile con ?server=1&p=<reparto>;
//  2. legge i dati con GT2SERVER.export() (turni già calcolati dall'app stessa: nessuna formula duplicata);
//  3. scrive cal/<reparto>/<operatore>.ics, il calendario che il telefono controlla da solo;
//  4. manda come notifica push le notifiche nuove dell'app (cambi turno, richieste, avvisi).
// La chiave privata VAPID sta solo nei secrets del repository, mai nei file.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import webpush from 'web-push';

const ROOT = process.cwd();
const APP_URL = process.env.APP_URL;
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE || '').trim();
const cloud = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cloud.json'), 'utf8'));
const VAPID_PUBLIC = cloud.vapidPublicKey || '';
const STATE_FILE = path.join(ROOT, 'push', 'state.json');
const log = (...a) => console.log('[motore]', ...a);

async function readProfile(browser, profile) {
  const page = await (await browser.newContext({ timezoneId: 'Europe/Rome', locale: 'it-IT' })).newPage();
  page.on('pageerror', e => log(profile, 'errore nella pagina:', e.message));
  await page.goto(`${APP_URL}?server=1&p=${profile}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.GT2SERVER && window.GT2SERVER.ready, null, { timeout: 120000, polling: 1000 });
  await page.waitForTimeout(4000);
  const X = await page.evaluate(() => window.GT2SERVER.export());
  return { X, removeSubs: ids => page.evaluate(ids => window.GT2SERVER.removeSubs(ids), ids) };
}

function writeCalendars(profile, X) {
  const dir = path.join(ROOT, 'cal', profile); fs.mkdirSync(dir, { recursive: true });
  let changed = 0;
  for (const [id, ics] of Object.entries(X.ics)) {
    const f = path.join(dir, id + '.ics');
    // il DTSTAMP cambia ogni giorno: si confronta senza, per non fare commit inutili
    const strip = t => t.replace(/DTSTAMP:[^\r\n]*/g, '');
    const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    if (strip(old) !== strip(ics)) { fs.writeFileSync(f, ics); changed++; }
  }
  log(`${profile}: ${Object.keys(X.ics).length} calendari, aggiornati ${changed}`);
}

async function sendPush(profile, X, state, removeSubs) {
  const sent = state.sent[profile] = state.sent[profile] || {};
  const fresh = X.notif.filter(n => !sent[n.id]).sort((a, b) => a.ts - b.ts);
  const first = !state.started || !state.started[profile];
  (state.started = state.started || {})[profile] = true;
  for (const n of fresh) sent[n.id] = Date.now();
  if (first) { log(`${profile}: primo giro, ${fresh.length} notifiche esistenti segnate come già inviate`); return; }
  if (!fresh.length) { log(`${profile}: nessuna notifica nuova`); return; }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { log(`${profile}: ${fresh.length} notifiche pronte ma mancano le chiavi VAPID`); state.problem = 'Mancano le chiavi VAPID: le notifiche push non partono.'; return; }
  webpush.setVapidDetails('mailto:noreply@turni118.invalid', VAPID_PUBLIC, VAPID_PRIVATE);
  const subs = Object.entries(X.subs || {});
  const dead = new Set(); let ok = 0;
  for (const n of fresh) {
    const targets = subs.filter(([, s]) => n.op === '*' || (n.op === '@manager' ? s.manager : s.op === n.op));
    for (const [id, s] of targets) {
      if (dead.has(id)) continue;
      try { await webpush.sendNotification(s.sub, JSON.stringify({ title: n.title, body: n.body, tag: n.kind || 'turni', url: X.url + '#/notifiche' }), { TTL: 6 * 3600 }); ok++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.add(id); else log('invio non riuscito', e.statusCode || '', e.body || e.message); }
    }
  }
  if (dead.size) await removeSubs([...dead]);
  log(`${profile}: ${fresh.length} notifiche, ${ok} consegnate, ${dead.size} telefoni non più validi`);
}

async function main() {
  if (!APP_URL) throw new Error('APP_URL mancante');
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { sent: {} };
  state.sent = state.sent || {}; delete state.problem;
  const browser = await chromium.launch();
  try {
    for (const profile of ['autisti', 'infermieri']) {
      try {
        const { X, removeSubs } = await readProfile(browser, profile);
        if (X.cloud !== 'cloud') { log(`${profile}: l'app non è collegata al cloud, salto`); continue; }
        if (!X.people || X.people.length < 2) { log(`${profile}: dati incompleti, non tocco niente`); continue; }
        if (cloud.calendars !== false) writeCalendars(profile, X);
        await sendPush(profile, X, state, removeSubs);
      } catch (e) { log(`${profile}: errore`, e.message); state.problem = `${profile}: ${e.message}`; }
    }
  } finally { await browser.close(); }
  // si tengono solo gli invii degli ultimi 10 giorni
  const limit = Date.now() - 10 * 864e5;
  for (const p of Object.keys(state.sent)) for (const [k, t] of Object.entries(state.sent[p])) if (t < limit) delete state.sent[p][k];
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
}

main().catch(e => { console.error('[motore] errore:', e); process.exit(1); });
