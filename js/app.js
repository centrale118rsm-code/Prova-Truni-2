// ═══════════════════════════════════════════════════════════════════════════
// APP — avvio, navigazione, struttura (barra laterale, intestazione, menu mobile),
// "Chi sei?", accesso coordinatore/amministratore, notifiche, avvisi.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from './store.js';
import { esc, sha256, hashPass, verifyPass, fmtDate, relTime, today, vibrate } from './util.js';
import { $, $$, ic, modal, toast, popover, avatar, confirmBox, chipFor, cap1 } from './ui.js';
import { yearStats } from './calc.js';
import { PROFILES } from './profile.js';
import * as Cal from './views/calendar.js';
import * as Me from './views/me.js';
import * as Req from './views/requests.js';
import * as Cnt from './views/counts.js';
import * as Sh from './views/sheets.js';
import * as Team from './views/team.js';
import * as Adm from './views/admin.js';
import * as My from './views/myshifts.js';
import * as Mk from './views/market.js';
import * as Pay from './views/pay.js';
import { watchLocalNotifications, enableNotifications, notifState } from './push.js';

const VERSION = '2.0.0';

// Sezioni del menu. Ogni sezione ha le sue schede (in alto nella pagina).
// role: all | me (serve aver scelto chi sei) | mgr (coordinatore o admin) | admin
const T = (id, label, icon, view, role = 'all', extra = {}) => Object.assign({ id, label, icon, view, role }, extra);
const unreadCount = () => store.myNotif().filter(([, n]) => !n.read).length || '';
const reqBadge = () => Object.values(store.requests).filter(r => r.status === 'collega' && r.peer === store.me).length || '';
const mgrReqBadge = () => Object.values(store.requests).filter(r => r.status === 'attesa').length || '';
const SECTIONS = [
  { g: 'Il mio lavoro' },
  { id: 'turni', icon: 'radar', label: 'I miei turni', role: 'me', view: My.myShifts },
  { id: 'calendario', icon: 'calendar_month', label: 'Calendario', role: 'all', tabs: [
    T('foglio', 'Foglio turni', 'grid_on', Cal.calendar, 'all', { full: true }),
    T('modifica', 'Modifica', 'edit_calendar', Cal.editor, 'mgr', { full: true, badge: () => store.pendingCount() || '' }),
    T('oggi', 'In servizio', 'badge', Sh.duty),
    T('anno', 'Anno', 'view_module', Sh.overview),
    T('cartellino', 'Cartellino', 'view_timeline', Sh.timecard)] },
  { id: 'richieste', icon: 'assignment', label: 'Richieste', role: 'me', tabs: [
    T('mie', 'Le mie richieste', 'person', Req.requests, 'me', { badge: reqBadge }),
    T('borsa', 'Borsa scambi', 'storefront', Mk.market, 'me', { badge: () => Mk.marketBadge() }),
    T('disponibilita', 'Disponibilità', 'event_available', Me.agenda, 'me'),
    T('gestione', 'Da approvare', 'inbox', Req.manage, 'mgr', { badge: mgrReqBadge })] },
  { id: 'conteggi', icon: 'functions', label: 'Conteggi', role: 'all', tabs: [
    T('ore', 'Ore e saldi', 'schedule', Cnt.hours),
    T('ferie', 'Ferie e permessi', 'beach_access', Cnt.leave),
    T('reperibilita', 'Reperibilità', 'phone_in_talk', Cnt.oncall),
    T('festivi', 'Festivi e domeniche', 'celebration', Cnt.holidays),
    T('statistiche', 'Equità', 'balance', Cnt.stats),
    T('paghe', 'Paghe', 'payments', Pay.pay, 'mgr')] },
  { id: 'squadra', icon: 'groups', label: 'Squadra', role: 'all', tabs: [
    T('bacheca', 'Bacheca', 'campaign', Team.board),
    T('uscite', 'Uscite di gruppo', 'restaurant', Team.outing),
    T('ruota', 'Ruota della sfiga', 'casino', Team.wheel)] },
  { g: 'Gestione', role: 'mgr' },
  { id: 'pannello', icon: 'dashboard', label: 'Pannello', role: 'mgr', tabs: [
    T('riepilogo', 'Riepilogo', 'dashboard', Adm.dashboard, 'mgr'),
    T('controlli', 'Da controllare', 'fact_check', Adm.checks, 'mgr'),
    T('bozza', 'Bozza automatica', 'auto_awesome', Adm.generator, 'mgr')] },
  { id: 'documenti', icon: 'folder_open', label: 'Stampe e dati', role: 'mgr', tabs: [
    T('stampe', 'Stampe e moduli', 'print', Adm.prints, 'mgr'),
    T('dati', 'Excel e backup', 'database', Adm.data, 'mgr'),
    T('storico', 'Storico modifiche', 'history', Adm.history, 'mgr')] },
  { id: 'impostazioni', icon: 'settings', label: 'Impostazioni', role: 'mgr', tabs: [
    T('operatori', 'Operatori', 'group', Adm.operators, 'mgr'),
    T('codici', 'Codici e regole', 'palette', Adm.codes, 'mgr'),
    T('generali', 'Generali e sicurezza', 'tune', Adm.settings, 'admin'),
    T('accessi', 'Accessi', 'devices', Adm.sessions, 'admin')] },
  // fuori dal menu: si apre dalla campanella e dalle notifiche push
  { id: 'notifiche', icon: 'notifications', label: 'Notifiche', role: 'me', view: Me.notifications, hidden: true }
];
// Vecchi indirizzi (link interni, notifiche) → sezione/scheda
const ALIAS = {
  calendario: 'calendario/foglio', modifica: 'calendario/modifica', servizio: 'calendario/oggi', insieme: 'calendario/anno', cartellino: 'calendario/cartellino',
  me: 'turni', richieste: 'richieste/mie', borsa: 'richieste/borsa', agenda: 'richieste/disponibilita', 'gestione-richieste': 'richieste/gestione',
  ore: 'conteggi/ore', ferie: 'conteggi/ferie', reperibilita: 'conteggi/reperibilita', festivi: 'conteggi/festivi', statistiche: 'conteggi/statistiche', paghe: 'conteggi/paghe',
  bacheca: 'squadra/bacheca', uscite: 'squadra/uscite', ruota: 'squadra/ruota',
  dashboard: 'pannello/riepilogo', controlli: 'pannello/controlli', bozza: 'pannello/bozza',
  stampe: 'documenti/stampe', dati: 'documenti/dati', storico: 'documenti/storico',
  operatori: 'impostazioni/operatori', codici: 'impostazioni/codici', impostazioni: 'impostazioni/generali', accessi: 'impostazioni/accessi'
};
const BNAV = [['turni', 'radar', 'I miei turni'], ['calendario', 'calendar_month', 'Calendario'], ['richieste', 'assignment', 'Richieste'], ['conteggi', 'functions', 'Conteggi'], ['__menu', 'menu', 'Altro']];

function canSee(item) {
  if (item.role === 'all' || !item.role) return true;
  if (item.role === 'me') return !!store.me || store.isManager();
  if (item.role === 'mgr') return store.isManager();
  if (item.role === 'admin') return store.role === 'admin';
  return false;
}
const sectionOf = id => SECTIONS.find(n => n.id === id);
const visibleTabs = sec => (sec.tabs || []).filter(canSee);
const badgeOf = sec => sec.tabs ? visibleTabs(sec).reduce((a, t) => a + (+(t.badge ? t.badge() : 0) || 0), 0) || '' : (sec.badge ? sec.badge() : '');
const homeFor = () => store.isManager() ? 'pannello/riepilogo' : (store.me ? 'turni' : 'calendario/foglio');

// ── Navigazione ──
let current = { id: null, tab: null, cleanup: null };
export function go(id, params = {}) {
  const path = id.includes('/') ? id : (ALIAS[id] || id);
  const q = new URLSearchParams(params).toString();
  const h = `#/${path}${q ? '?' + q : ''}`;
  if (location.hash === h) route(); else location.hash = h;
}
function parseHash() {
  const h = location.hash.replace(/^#\/?/, ''); const [path, q] = h.split('?');
  let [id, tab] = (path || '').split('/');
  if (id && !sectionOf(id) && ALIAS[id]) [id, tab] = ALIAS[id].split('/');
  return { id: id || '', tab: tab || '', params: Object.fromEntries(new URLSearchParams(q || '')) };
}
function route() {
  let { id, tab, params } = parseHash();
  let sec = sectionOf(id);
  if (!sec || sec.g || !canSee(sec)) {
    if (sec && (sec.role === 'mgr' || sec.role === 'admin')) askLogin(sec.role === 'admin' ? 'admin' : 'coord', () => go(id + (tab ? '/' + tab : ''), params));
    [id, tab] = homeFor().split('/'); sec = sectionOf(id);
    history.replaceState(null, '', `#/${id}${tab ? '/' + tab : ''}`);
  }
  let t = null;
  if (sec.tabs) {
    const vis = visibleTabs(sec);
    t = vis.find(x => x.id === tab);
    if (!t) {
      const wanted = sec.tabs.find(x => x.id === tab);
      if (wanted && !canSee(wanted)) askLogin(wanted.role === 'admin' ? 'admin' : 'coord', () => go(`${id}/${tab}`, params));
      t = vis[0]; history.replaceState(null, '', `#/${id}/${t.id}`);
    }
  }
  if (current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  current = { id, tab: t && t.id, cleanup: null };
  document.body.classList.remove('side-open');
  renderNav();
  const main = $('#main'); main.scrollTop = 0; main.innerHTML = '';
  $('#top-actions-view').innerHTML = '';
  setTitle(sec.label, '');
  try {
    if (!t) { current.cleanup = sec.view(main, params, ctx) || null; return; }
    // schede della sezione: una sola barra in alto, poi la pagina scelta
    const vis = visibleTabs(sec);
    main.innerHTML = `<div class="hub ${t.full ? 'full' : ''}">${vis.length > 1 ? `<nav class="hub-tabs" aria-label="${esc(sec.label)}">${vis.map(x => { const b = x.badge ? x.badge() : ''; return `<a href="#/${id}/${x.id}" class="${x.id === t.id ? 'on' : ''}">${ic(x.icon)}<span>${esc(x.label)}</span>${b ? `<span class="badge">${b}</span>` : ''}</a>`; }).join('')}</nav>` : ''}<div class="hub-body"></div></div>`;
    const sub = Object.assign({}, ctx, { setTitle: (title, crumb) => setTitle(sec.label, crumb || (title && title !== sec.label ? title : t.label)) });
    setTitle(sec.label, t.label);
    current.cleanup = t.view(main.querySelector('.hub-body'), params, sub) || null;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="page"><div class="note err">${ic('error')}<div><b>Errore nella pagina.</b><br>${esc(e.message)}</div></div></div>`;
  }
}
function setTitle(t, crumb) { $('#top-title h1').textContent = t; $('#top-title .crumb').textContent = crumb || ''; document.title = `${crumb || t} · ${store.config.app.title}`; }
function setActions(html) { const el = $('#top-actions-view'); el.innerHTML = typeof html === 'string' ? html : ''; if (typeof html !== 'string' && html) el.appendChild(html); return el; }
const ctx = { go, setTitle, setActions, askLogin, refreshNav: () => renderNav() };

// ── Struttura ──
function shell() {
  document.body.innerHTML = `
  <div id="app">
    <aside class="side" id="side">
      <div class="side-brand"><img src="assets/icon-118-192.png" alt=""><div><b>${esc(store.config.app.title)}</b><small>${esc(store.config.app.unit || '')}</small></div></div>
      <div class="prof-sw" id="prof-sw" role="tablist" aria-label="Reparto">${profSwitch()}</div>
      <nav class="side-nav" id="side-nav" aria-label="Sezioni"></nav>
      <div class="side-foot"><button class="who" id="who"></button></div>
    </aside>
    <header class="top">
      <button class="ibtn mob-only" id="btn-side" aria-label="Menu">${ic('menu')}</button>
      <button class="ibtn desk-only" id="btn-mini" aria-label="Riduci barra">${ic('left_panel_close')}</button>
      <div class="top-title" id="top-title"><h1></h1><span class="crumb"></span></div>
      <div class="top-actions"><span id="top-actions-view" class="row"></span>
        <button class="prof-pill mob-only" id="prof-pill" title="Cambia reparto">${ic(store.profile.icon)}<span>${esc(store.profile.short)}</span>${ic('swap_horiz')}</button>
        <span class="pill desk-only" id="net-pill"></span>
        <button class="ibtn" id="btn-bell" title="Notifiche" aria-label="Notifiche">${ic('notifications')}<span class="badge" id="bell-badge"></span></button>
      </div>
    </header>
    <main class="main" id="main"></main>
    <nav class="bnav" id="bnav"></nav>
  </div>
  <div class="scrim" id="scrim"></div>
  <div id="print-area"></div>`;
  $('#btn-side').onclick = () => document.body.classList.toggle('side-open');
  $('#scrim').onclick = () => document.body.classList.remove('side-open');
  $('#btn-mini').onclick = () => { document.body.classList.toggle('side-mini'); store.lsSet('gt2:mini', document.body.classList.contains('side-mini')); };
  if (store.lsGet('gt2:mini')) document.body.classList.add('side-mini');
  $('#btn-bell').onclick = e => bellMenu(e.currentTarget);
  $('#who').onclick = e => whoMenu(e.currentTarget);
  $('#prof-sw').onclick = e => { const b = e.target.closest('[data-p]'); if (b) switchTo(b.dataset.p); };
  $('#prof-pill').onclick = e => popover(e.currentTarget, Object.values(PROFILES).map(p => ({ icon: p.icon, label: 'Turni ' + p.short.toLowerCase(), right: p.key === store.profile.key ? ic('check') : '', run: () => switchTo(p.key) })));
  // scorciatoia da tastiera: Alt+A autisti, Alt+I infermieri
  document.addEventListener('keydown', e => { if (e.altKey && !e.ctrlKey && /^[ai]$/i.test(e.key)) { e.preventDefault(); switchTo(e.key.toLowerCase() === 'a' ? 'autisti' : 'infermieri'); } });
  window.addEventListener('hashchange', route);
}
function renderNav() {
  const nav = $('#side-nav'); if (!nav) return;
  let html = '', group = null;
  for (const n of SECTIONS) {
    if (n.g) { group = n; continue; }
    if (n.hidden) continue;
    const visible = canSee(n);
    if (!visible) {
      // area gestione chiusa: una sola voce con il lucchetto
      if (n.id === 'pannello') { if (group) html += `<div class="nav-g"><span>${esc(group.g)}</span></div>`; group = null; html += `<a class="nav-i locked" href="#/pannello">${ic('lock')}<span>Area gestione</span><span class="ms lk">chevron_right</span></a>`; }
      continue;
    }
    if (group) { html += `<div class="nav-g"><span>${esc(group.g)}</span></div>`; group = null; }
    const b = badgeOf(n);
    html += `<a class="nav-i ${current.id === n.id ? 'on' : ''}" href="#/${n.id}" title="${esc(n.label)}">${ic(n.icon)}<span>${esc(n.label)}</span>${b ? `<span class="badge">${b}</span>` : ''}</a>`;
  }
  nav.innerHTML = html;
  const o = store.op(store.me);
  $('#who').innerHTML = `${store.isManager() ? `<span class="av" style="background:var(--brand)">${ic(store.role === 'admin' ? 'shield_person' : 'supervisor_account')}</span>` : (o ? avatar(o.id) : `<span class="av" style="background:#475569">${ic('person')}</span>`)}
    <span class="who-txt grow"><b>${esc(store.whoName())}</b><small>${store.isManager() ? (o ? 'e ' + (o.name || '') + ' ' + cap1(o.surname) : 'Area gestione attiva') : (o ? 'Operatore' : 'Tocca per scegliere chi sei')}</small></span>${ic('unfold_more')}`;
  const bn = $('#bnav');
  bn.innerHTML = BNAV.filter(([id]) => id === '__menu' || canSee(sectionOf(id))).map(([id, icon, lb]) => {
    const sec = sectionOf(id); const b = sec ? badgeOf(sec) : '';
    return `<button data-id="${id}" class="${current.id === id ? 'on' : ''}">${ic(icon)}<span>${lb}</span>${b ? `<span class="badge">${b}</span>` : ''}</button>`;
  }).join('');
  bn.onclick = e => { const b = e.target.closest('button'); if (!b) return; vibrate(); if (b.dataset.id === '__menu') document.body.classList.add('side-open'); else go(b.dataset.id); };
  const u = unreadCount(); $('#bell-badge').textContent = u || '';
  // le schede aggiornano i contatori senza ridisegnare la pagina
  document.querySelectorAll('.hub-tabs a').forEach(a => { const tab = a.getAttribute('href').split('/')[2]; const sec = sectionOf(current.id); const t = sec && sec.tabs && sec.tabs.find(x => x.id === tab); if (!t || !t.badge) return; const v = t.badge(); let bd = a.querySelector('.badge'); if (v && !bd) { bd = document.createElement('span'); bd.className = 'badge'; a.appendChild(bd); } if (bd) bd.textContent = v || ''; });
  renderNet();
}
function renderNet() {
  const p = $('#net-pill'); if (!p) return;
  const cloud = store.adapter.kind === 'cloud';
  if (!store.online) p.innerHTML = `<span class="dot err"></span>Offline`, p.className = 'pill err desk-only';
  else if (cloud) p.innerHTML = `<span class="dot ok"></span>Cloud`, p.className = 'pill ok desk-only';
  else p.innerHTML = `${ic('smartphone')}Locale`, p.className = 'pill warn desk-only', p.title = 'I dati sono salvati solo su questo dispositivo: collega il cloud in Impostazioni';
}

// ── Reparto: autisti / infermieri ──
function profSwitch() {
  return Object.values(PROFILES).map(p => `<button data-p="${p.key}" role="tab" aria-selected="${p.key === store.profile.key}" class="${p.key === store.profile.key ? 'on' : ''}" title="Turni ${p.short.toLowerCase()} (Alt+${p.short[0]})">${ic(p.icon)}<span>${esc(p.short)}</span></button>`).join('');
}
function switchTo(key) {
  if (key === store.profile.key) return;
  if (store.pendingCount() && !confirm('Hai modifiche in bozza non pubblicate: restano salvate su questo dispositivo. Cambiare reparto?')) return;
  document.body.classList.add('prof-leaving');
  setTimeout(() => store.switchProfile(key), 160);
}

// ── Menu utente, tema, notifiche ──
function whoMenu(a) {
  const items = [];
  items.push({ icon: 'switch_account', label: store.me ? 'Cambia operatore' : 'Scegli chi sei', run: () => gate(true) });
  if (store.isManager()) items.push({ icon: 'logout', label: 'Esci dall’area gestione', run: () => { store.setAuth(null); toast('Area gestione chiusa'); go('calendario'); } });
  else { items.push({ icon: 'supervisor_account', label: 'Accedi come coordinatore', run: () => askLogin('coord', () => go('dashboard')) }); items.push({ icon: 'shield_person', label: 'Accedi come amministratore', run: () => askLogin('admin', () => go('dashboard')) }); }
  items.push('-'); items.push({ icon: 'contrast', label: 'Tema: chiaro, scuro o automatico', run: () => setTimeout(() => themeMenu(a), 0) });
  items.push({ icon: 'install_mobile', label: 'Installa sul telefono', run: installHelp });
  items.push({ icon: 'info', label: `Versione ${VERSION} · ${store.adapter.kind === 'cloud' ? 'cloud' : 'locale'}`, run: aboutBox });
  popover(a, items, { align: 'left' });
}
function themeMenu(a) {
  const cur = store.lsGet('gt2:theme') || 'auto';
  popover(a, [['auto', 'contrast', 'Automatico'], ['light', 'light_mode', 'Chiaro'], ['dark', 'dark_mode', 'Scuro']].map(([k, icon, lb]) => ({ icon, label: lb, right: cur === k ? ic('check') : '', run: () => { store.lsSet('gt2:theme', k); applyTheme(); } })));
}
export function applyTheme() { const t = store.lsGet('gt2:theme') || 'auto'; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
function bellMenu(a) {
  const list = store.myNotif().slice(0, 8);
  const html = list.length ? list.map(([id, n]) => `<div class="list-i" style="padding:10px 8px;${n.read ? 'opacity:.6' : ''}">${ic(n.kind === 'turni' ? 'event_repeat' : n.kind === 'richiesta' ? 'assignment' : 'notifications')}<div class="grow"><b style="font-size:13px">${esc(n.title)}</b><div class="small muted">${esc(n.body || (n.dates ? n.dates.map(d => fmtDate(d)).slice(0, 4).join(', ') + (n.dates.length > 4 ? '…' : '') : ''))}</div></div><span class="tiny muted nowrap">${relTime(n.ts)}</span></div>`).join('')
    : `<div class="empty" style="padding:24px">${ic('notifications_off')}Nessuna notifica</div>`;
  const p = popover(a, [{ html: `<div style="width:min(360px,86vw);max-height:60vh;overflow:auto">${html}</div>` }, '-', { icon: 'done_all', label: 'Segna tutte come lette', run: () => store.markRead(list.filter(([, n]) => !n.read).map(([id]) => id)) }, { icon: notifState() === 'granted' ? 'notifications_active' : 'add_alert', label: notifState() === 'granted' ? 'Notifiche sul telefono: attive' : 'Attiva le notifiche sul telefono', run: () => askNotifications() }, { icon: 'open_in_new', label: 'Tutte le notifiche', run: () => go('notifiche') }]);
  return p;
}
export async function askNotifications() {
  try { const how = await enableNotifications(); toast(how === 'push' ? 'Notifiche attive anche ad app chiusa' : 'Notifiche attive: arrivano quando l’app è aperta o in background (con il cloud anche ad app chiusa)'); }
  catch (e) { toast(e.message, 'warn', { ms: 6000 }); }
}
function aboutBox() {
  modal({
    title: store.config.app.title, icon: 'info', body: `<div class="col">
    <div class="row"><img src="assets/icon-118-192.png" style="width:56px;height:56px;border-radius:14px"><div><b>Gestionale turni 118</b><div class="small muted">Versione ${VERSION} · profilo ${esc(store.profile.roleMany)} · archivio ${store.adapter.kind === 'cloud' ? 'cloud (Firebase)' : 'locale su questo dispositivo'}</div></div></div>
    <div class="note">${ic('info')}<div>Riproduce tutte le funzioni del file <b>Autisti 2026.xlsm</b> (turni, reperibilità a fasce, conteggi orari, festivi, cartellino, quadro reperibilità ISS, grafico annuo) e del programma turni infermieri (area personale, richieste, notifiche, bozza automatica, controlli, storico, bacheca, uscite, ruota).</div></div>
    ${store.cloudError ? `<div class="note err">${ic('cloud_off')}<div>Cloud non raggiungibile: ${esc(store.cloudError)}</div></div>` : ''}</div>`
  });
}
function installHelp() {
  modal({ title: 'Installa sul telefono', icon: 'install_mobile', body: `<div class="col small" style="line-height:1.6"><div><b>iPhone (Safari):</b> tocca ${ic('ios_share')} Condividi → <i>Aggiungi alla schermata Home</i>.</div><div><b>Android (Chrome):</b> menu ⋮ → <i>Installa app</i> o <i>Aggiungi a schermata Home</i>.</div><div><b>Computer:</b> nella barra degli indirizzi tocca l’icona di installazione.</div></div>` });
}

// ── "Chi sei?" ──
export function gate(force = false) {
  if (!force && (store.me || store.isManager() || store.lsGet(`${store.ns}:guest`))) return;
  const g = document.createElement('div'); g.className = 'gate';
  const ops = store.ops();
  g.innerHTML = `<div class="gate-card">
    <div class="gate-l"><img src="assets/icon-118-192.png" alt=""><div><h1>${esc(store.config.app.title)}</h1><div style="opacity:.8;margin-top:6px">${esc(store.config.app.unit || '')} · ${store.config.year}</div></div>
      <ul><li>${ic('calendar_month')}Calendario identico al foglio Excel</li><li>${ic('phone_in_talk')}Reperibilità a fasce e quadro mensile</li><li>${ic('schedule')}Saldo ore settimanale sulle 36 ore</li><li>${ic('beach_access')}Ferie, permessi e richieste online</li><li>${ic('notifications_active')}Avvisi quando cambiano i tuoi turni</li></ul>
      <div class="sp"></div><div class="small" style="opacity:.6">${esc(store.config.app.entity || '')}</div></div>
    <div class="gate-r"><div class="prof-sw gate-sw">${profSwitch()}</div><div><h2 style="margin:0 0 4px">Chi sei?</h2><div class="muted">Scegli il tuo nome per vedere la tua pagina personale. Puoi cambiarlo quando vuoi.</div></div>
      <div class="gate-ops">${ops.map(o => `<button class="gate-op" data-op="${o.id}">${avatar(o.id)}<span><b>${esc(o.name)} ${esc(cap1(o.surname))}</b><small>${o.pinHash ? ic('lock') + ' con PIN' : esc(o.label || store.profile.roleOne)}</small></span></button>`).join('')}</div>
      <div class="row wrap" style="border-top:1px solid var(--line);padding-top:14px"><button class="btn" data-guest>${ic('visibility')}Entra senza scegliere</button><span class="sp"></span><button class="btn" data-coord>${ic('supervisor_account')}Coordinatore</button><button class="btn red" data-admin>${ic('shield_person')}Amministratore</button></div>
    </div></div>`;
  document.body.appendChild(g);
  g.querySelector('.gate-sw').onclick = e => { const b = e.target.closest('[data-p]'); if (b) switchTo(b.dataset.p); };
  const close = () => { g.remove(); renderNav(); route(); afterLogin(); };
  g.querySelector('[data-guest]').onclick = () => { store.lsSet(`${store.ns}:guest`, true); store.setMe(null); close(); };
  g.querySelector('[data-coord]').onclick = () => askLogin('coord', () => { g.remove(); go('dashboard'); });
  g.querySelector('[data-admin]').onclick = () => askLogin('admin', () => { g.remove(); go('dashboard'); });
  g.querySelectorAll('[data-op]').forEach(b => b.onclick = async () => {
    const o = store.op(b.dataset.op);
    if (o.pinHash) { const ok = await askPin(o); if (!ok) return; }
    else if (store.config.rules.pinRequired) { const ok = await createPin(o); if (!ok) return; }
    store.setMe(o.id); toast(`Ciao ${o.name}!`); history.replaceState(null, '', '#/turni'); close();
  });
}
// Primo accesso con PIN obbligatorio: l'operatore sceglie il suo PIN
function createPin(o) {
  return new Promise(res => {
    const m = modal({ title: 'Crea il tuo PIN', icon: 'password', foot: '', onClose: v => res(!!v), body: `<div class="col"><div class="muted small">Il coordinatore ha attivato il PIN personale: sceglilo ora (4 cifre), ti servirà per entrare come ${esc(o.name || cap1(o.surname))}.</div><div class="grid g2"><label class="field">PIN<input class="inp" id="p1" inputmode="numeric" maxlength="4" type="password"></label><label class="field">Ripeti il PIN<input class="inp" id="p2" inputmode="numeric" maxlength="4" type="password"></label></div><div class="small neg" id="pe"></div></div>` });
    m.foot.innerHTML = `<button class="btn pri">${ic('lock')}Salva il PIN</button>`;
    m.foot.firstChild.onclick = async () => {
      const a = m.body.querySelector('#p1').value, b = m.body.querySelector('#p2').value;
      if (!/^\d{4}$/.test(a)) return m.body.querySelector('#pe').textContent = 'Servono 4 cifre';
      if (/^(\d)\1{3}$|^(1234|0123|4321|2580)$/.test(a)) return m.body.querySelector('#pe').textContent = 'PIN troppo facile da indovinare';
      if (a !== b) return m.body.querySelector('#pe').textContent = 'I due PIN non coincidono';
      o.pinHash = await hashPass(a); await store.saveConfig({ operators: store.config.operators }, 'PIN creato da ' + o.surname); m.close(true); toast('PIN salvato');
    };
  });
}
function askPin(o) {
  return new Promise(res => {
    const m = modal({ title: `PIN di ${o.name || cap1(o.surname)}`, icon: 'lock', body: `<div class="col" style="align-items:center"><div class="muted small">Inserisci il tuo PIN di 4 cifre</div><div class="pin">${[0, 1, 2, 3].map(i => `<input inputmode="numeric" maxlength="1" data-i="${i}" autocomplete="off">`).join('')}</div><div class="small neg" id="pin-err"></div></div>`, onClose: v => res(!!v) });
    const ins = [...m.body.querySelectorAll('input')]; setTimeout(() => ins[0].focus(), 80);
    const errEl = m.body.querySelector('#pin-err');
    ins.forEach((inp, i) => {
      inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus(); });
      inp.addEventListener('input', async () => {
        inp.value = inp.value.replace(/\D/g, '').slice(-1);
        if (inp.value && i < 3) ins[i + 1].focus();
        const v = ins.map(x => x.value).join('');
        if (v.length < 4) return;
        const lk = store.lockState(); if (lk.until > Date.now()) { errEl.textContent = `Troppi tentativi: riprova tra ${Math.ceil((lk.until - Date.now()) / 1000)} secondi`; ins.forEach(x => x.value = ''); return; }
        if (await verifyPass(v, o.pinHash, o.id + ':')) {
          store.clearFails();
          if (!String(o.pinHash).startsWith('pbkdf2$')) { o.pinHash = await hashPass(v); store.saveConfig({ operators: store.config.operators }, 'PIN aggiornato alla cifratura PBKDF2').catch(() => { }); }
          m.close(true);
        } else { const l = store.noteFail(); errEl.textContent = l.until > Date.now() ? 'Troppi tentativi: accesso bloccato per qualche minuto' : `PIN errato (${Math.max(0, 5 - l.fails)} tentativi prima del blocco)`; ins.forEach(x => x.value = ''); ins[0].focus(); }
      });
    });
  });
}

// ── Accesso coordinatore / amministratore ──
// Password cifrate con PBKDF2; dopo 5 errori l'accesso si blocca e l'attesa raddoppia; la sessione
// scade dopo 12 ore (30 giorni con "ricorda") e dopo un periodo di inattività. Con il cloud collegato
// c'è anche l'accesso con link via email verificato da Firebase.
export function askLogin(role, then) {
  const cfg = store.config;
  const firstSetup = !cfg.adminHash;
  const cloudMail = store.adapter.kind === 'cloud' && (cfg.managers || []).length;
  const m = modal({
    title: firstSetup ? 'Prima configurazione' : (role === 'admin' ? 'Accesso amministratore' : 'Accesso coordinatore'), icon: firstSetup ? 'key' : 'lock', foot: '',
    body: firstSetup ? `<div class="col"><div class="note">${ic('info')}<div>È il primo accesso all’area gestione: scegli la <b>password dell’amministratore</b> (almeno 8 caratteri, con lettere e numeri). Potrai poi creare anche una password separata per il coordinatore in Impostazioni.</div></div>
      <label class="field">Nuova password amministratore<input class="inp" type="password" id="lg-1" autocomplete="new-password"></label>
      <div class="lockbar"><i id="lg-str" style="width:0"></i></div>
      <label class="field">Ripeti la password<input class="inp" type="password" id="lg-2" autocomplete="new-password"></label><div class="small neg" id="lg-err"></div></div>`
      : `<div class="col"><div class="muted small">${role === 'admin' ? 'Gestione completa: turni, operatori, impostazioni, cloud, accessi.' : 'Gestione turni, richieste, operatori e stampe.'}</div>
      <label class="field">Password<input class="inp" type="password" id="lg-1" autocomplete="current-password"></label>
      <label class="chk"><input type="checkbox" id="lg-keep"> Ricorda su questo dispositivo per 30 giorni</label><div class="small neg" id="lg-err"></div>
      ${cloudMail ? `<div class="note small">${ic('mail')}<div>Accesso verificato dal server: <button class="btn sm" id="lg-mail" type="button">${ic('forward_to_inbox')}Ricevi un link via email</button></div></div>` : ''}</div>`
  });
  m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('login')}${firstSetup ? 'Salva e accedi' : 'Accedi'}</button>`;
  const p1 = m.body.querySelector('#lg-1'); setTimeout(() => p1.focus(), 80);
  const err = t => m.body.querySelector('#lg-err').textContent = t;
  const strength = v => (v.length >= 8) + (v.length >= 12) + (/[a-z]/i.test(v) && /\d/.test(v)) + /[^a-z0-9]/i.test(v);
  if (firstSetup) p1.addEventListener('input', () => { const n = strength(p1.value); const bar = m.body.querySelector('#lg-str'); bar.style.width = n * 25 + '%'; bar.style.background = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'][n]; });
  const mail = m.body.querySelector('#lg-mail');
  if (mail) mail.onclick = async () => { const em = await promptEmail(); if (!em) return; try { await store.adapter.sendLink(em); toast('Ti abbiamo mandato un link: aprilo da questo dispositivo'); m.close(); } catch (e) { err(e.message); } };
  const submit = async () => {
    if (firstSetup) {
      const a = p1.value, b = m.body.querySelector('#lg-2').value;
      if (strength(a) < 2) return err('Password troppo debole: almeno 8 caratteri con lettere e numeri'); if (a !== b) return err('Le password non coincidono');
      const h = await hashPass(a); await store.saveConfig({ adminHash: h }, 'Password amministratore impostata');
      store.setAuth('admin', h); m.close(); toast('Password salvata: sei amministratore'); then && then(); return;
    }
    const lk = store.lockState();
    if (lk.until > Date.now()) return err(`Troppi tentativi sbagliati: riprova tra ${Math.ceil((lk.until - Date.now()) / 1000)} secondi`);
    const btn = m.foot.querySelector('[data-o]'); btn.disabled = true;
    let ok = null, stored = null;
    if (await verifyPass(p1.value, cfg.adminHash, 'gt2:')) { ok = 'admin'; stored = cfg.adminHash; }
    else if (role === 'coord' && cfg.coordHash && await verifyPass(p1.value, cfg.coordHash, 'gt2:')) { ok = 'coord'; stored = cfg.coordHash; }
    btn.disabled = false;
    if (!ok) { const l = store.noteFail(); err(l.until > Date.now() ? 'Troppi tentativi sbagliati: accesso bloccato per qualche minuto' : `Password errata (${Math.max(0, 5 - l.fails)} tentativi prima del blocco)`); p1.select(); return; }
    store.clearFails();
    // vecchia impronta SHA-256: si converte subito in PBKDF2
    if (!String(stored).startsWith('pbkdf2$')) { stored = await hashPass(p1.value); await store.saveConfig(ok === 'admin' ? { adminHash: stored } : { coordHash: stored }, 'Password aggiornata alla cifratura PBKDF2'); }
    store.setAuth(ok, stored, m.body.querySelector('#lg-keep').checked);
    m.close(); toast(ok === 'admin' ? 'Accesso amministratore' : 'Accesso coordinatore'); then && then();
  };
  p1.addEventListener('keydown', e => { if (e.key === 'Enter' && !firstSetup) submit(); });
  m.foot.querySelector('[data-c]').onclick = () => m.close();
  m.foot.querySelector('[data-o]').onclick = submit;
}
function promptEmail() {
  return new Promise(res => { const m = modal({ title: 'Accesso con link', icon: 'mail', foot: '', onClose: v => res(v || null), body: `<label class="field">La tua email (registrata dall’amministratore)<input class="inp" type="email" id="em"></label>` }); m.foot.innerHTML = `<button class="btn pri">Invia il link</button>`; m.foot.firstChild.onclick = () => m.close(m.body.querySelector('#em').value.trim()); });
}
// Blocco per inattività dell'area gestione (salvo "ricorda su questo dispositivo")
let idleT = null;
function armIdle() {
  clearTimeout(idleT);
  const min = (store.config && store.config.rules && store.config.rules.idleLockMin) ?? 30;
  if (!store.config || !store.isManager() || !min) return;
  const tok = store.lsGet(`${store.ns}:auth`) || {}; if (tok.keep) return;
  idleT = setTimeout(() => { if (store.isManager()) { store.setAuth(null); toast('Area gestione chiusa per inattività', 'info'); go('turni'); } }, min * 60e3);
}
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => armIdle(), { passive: true, capture: true }));

// ── Dopo l'accesso: avviso iniziale, bacheca, turni cambiati ──
function afterLogin() {
  const w = store.config.welcome;
  if (w && w.active && w.text && !sessionStorage.getItem('gt2:welcome')) {
    sessionStorage.setItem('gt2:welcome', '1');
    modal({ title: w.title || 'Avviso', icon: 'campaign', body: `<div style="white-space:pre-wrap;line-height:1.55">${esc(w.text)}</div>` });
  }
  const seen = store.lsGet(`${store.ns}:annSeen`) || {};
  const ann = (store.config.announcements || []).filter(a => a.popup && !seen[a.id] && (!a.until || a.until >= today()) && (!a.to || a.to === '*' || a.to === store.me));
  if (ann.length) {
    const a = ann[0]; seen[a.id] = 1; store.lsSet(`${store.ns}:annSeen`, seen);
    modal({ title: a.title, icon: 'campaign', body: `<div style="white-space:pre-wrap;line-height:1.55">${esc(a.text)}</div><div class="small muted mt">${esc(a.by || '')} · ${fmtDate(new Date(a.ts).toISOString().slice(0, 10), { year: true })}</div>` });
  }
  const changed = store.myNotif().filter(([, n]) => !n.read && n.kind === 'turni' && n.op === store.me);
  if (changed.length && !store.isManager()) {
    const dates = [...new Set(changed.flatMap(([, n]) => n.dates || []))].sort();
    const m = modal({
      title: 'I tuoi turni sono cambiati', icon: 'event_repeat', foot: '',
      body: `<div class="col"><div class="muted small">Il coordinatore ha modificato ${dates.length === 1 ? 'un giorno' : dates.length + ' giorni'} del tuo calendario. Ecco come sono adesso:</div>
      <div class="card"><div class="card-b flush">${dates.slice(0, 30).map(d => `<div class="list-i"><span class="grow">${esc(fmtDate(d, { wd: true }))}</span>${chipFor(store.cell(store.me, d), d)}</div>`).join('')}</div></div></div>`
    });
    m.foot.innerHTML = `<button class="btn" data-cal>${ic('calendar_month')}Apri il calendario</button><button class="btn pri" data-ok>${ic('done')}Ho visto</button>`;
    m.foot.querySelector('[data-ok]').onclick = () => { store.markRead(changed.map(([id]) => id)); m.close(); };
    m.foot.querySelector('[data-cal]').onclick = () => { store.markRead(changed.map(([id]) => id)); m.close(); go('me'); };
  }
}

// ── Avvio ──
async function start() {
  applyTheme();
  document.body.innerHTML = `<div style="display:grid;place-items:center;height:100vh;font-family:Inter,system-ui;color:#64748b"><div style="text-align:center"><img src="assets/icon-118-192.png" style="width:72px;height:72px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.15)"><div style="margin-top:14px;font-weight:600">Caricamento turni…</div></div></div>`;
  try { await store.boot(); }
  catch (e) {
    console.error(e);
    document.body.innerHTML = `<div style="padding:30px;font-family:system-ui"><h2>Impossibile avviare l'app</h2><pre style="white-space:pre-wrap">${esc(e.stack || e.message)}</pre><button onclick="localStorage.removeItem('gt2:cloud');location.reload()">Riprova in modalità locale</button></div>`;
    return;
  }
  if (new URLSearchParams(location.search).get('server') === '1') return serverMode();
  shell();
  store.on((what) => {
    if (['requests', 'notif', 'role', 'me', 'config', 'net', 'cells', 'edit'].includes(what)) renderNav();
    if (what === 'role' || what === 'me') route();
  });
  if (!location.hash) history.replaceState(null, '', '#/' + homeFor());
  route();
  if (!store.me && !store.isManager() && !store.lsGet(`${store.ns}:guest`)) gate();
  else afterLogin();
  // in locale (sviluppo) niente cache: si vedono subito le modifiche ai file
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.GT2 = { store, go, VERSION };
  watchLocalNotifications();
}
// Il motore (GitHub Actions) apre l'app con ?server=1 in un browser invisibile e legge questi dati
function serverMode() {
  document.body.innerHTML = '<pre style="padding:20px">Turni 118 · modalità server</pre>';
  window.GT2SERVER = {
    ready: true,
    async export() {
      const since = Date.now() - 3 * 864e5;
      return {
        profile: store.profile.key, team: store.config.app.title, cloud: store.adapter.kind, today: today(),
        url: location.href.split('?')[0],
        people: store.ops().map(o => ({ id: o.id, name: `${o.name} ${o.surname}`.trim() })),
        ics: Object.fromEntries(store.ops().map(o => [o.id, Me.buildICS(o.id, 60)])),
        notif: Object.entries(await store.adapter.listItems('notif', since)).map(([id, n]) => ({ id, op: n.op, title: n.title, body: n.body || (n.dates ? n.dates.length + ' giorni modificati' : ''), ts: n.ts, kind: n.kind })),
        subs: await store.adapter.listItems('push')
      };
    },
    async removeSubs(ids) { for (const id of ids) await store.adapter.deleteItem('push', id); return ids.length; }
  };
}
start();
