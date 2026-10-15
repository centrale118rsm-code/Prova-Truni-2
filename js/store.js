// ═══════════════════════════════════════════════════════════════════════════
// DATI — un solo "negozio" in memoria con due possibili archivi:
//   • locale  → localStorage del dispositivo (funziona subito, anche offline)
//   • cloud   → Firebase Firestore (tutti i dispositivi condividono gli stessi turni)
// Struttura (identica nei due archivi):
//   <ns>_data/config            impostazioni, operatori, festività, password (hash)
//   <ns>_data/m_AAAA-MM         { cells: { "op|data": casella }, rep: { data: [4 fasce] } }
//   <ns>_data/agenda_<op>       disponibilità e note personali
//   <ns>_requests/<id>          richieste (ferie, permessi, cambi, cessioni)
//   <ns>_log/<id>               registro modifiche
//   <ns>_notif/<id>             notifiche agli operatori
//   <ns>_sess/<id>              accessi
// Casella: { s: turno, a: assenza, ph: ore permesso, cr: minuti accreditati,
//            mk: 'serv'|'pers' (bordo rosso/blu), n: nota }
// ═══════════════════════════════════════════════════════════════════════════
import { PROFILES, OPERATOR_PALETTE } from './profile.js';
import { ym, uid, loadScript, deepClone, holidaysSM, addDays } from './util.js';

const LS = {
  get(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn('Spazio locale esaurito', e); return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};

// ── Archivio locale ───────────────────────────────────────────────────────
class LocalAdapter {
  constructor(ns) { this.ns = ns; this.kind = 'local'; this.watchers = []; window.addEventListener('storage', e => this.onStorage(e)); }
  k(name) { return `${this.ns}:d:${name}`; }
  kc(coll) { return `${this.ns}:c:${coll}`; }
  async init() { }
  async getDoc(name) { return LS.get(this.k(name)); }
  async setDoc(name, data) { LS.set(this.k(name), data); }
  async mergeDoc(name, data) { LS.set(this.k(name), Object.assign(LS.get(this.k(name)) || {}, data)); }
  async updateMap(name, field, entries) {
    const d = LS.get(this.k(name)) || {}; d[field] = d[field] || {};
    for (const [k, v] of Object.entries(entries)) { if (v === null) delete d[field][k]; else d[field][k] = v; }
    d.updatedAt = Date.now(); LS.set(this.k(name), d);
  }
  async listDocs(prefix) { const out = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); const p = this.k(prefix); if (key.startsWith(p)) out[key.slice(this.k('').length)] = LS.get(key); } return out; }
  async deleteDoc(name) { LS.del(this.k(name)); }
  watchDoc(name, cb) { this.watchers.push({ key: this.k(name), cb }); return () => { }; }
  watchColl(coll, cb) { this.watchers.push({ key: this.kc(coll), cb: v => cb(v || {}) }); return () => { }; }
  onStorage(e) { for (const w of this.watchers) if (w.key === e.key) w.cb(e.newValue ? JSON.parse(e.newValue) : null); }
  async addItem(coll, id, data) { const c = LS.get(this.kc(coll)) || {}; c[id] = data; this.trim(c, coll); LS.set(this.kc(coll), c); }
  async updateItem(coll, id, patch) { const c = LS.get(this.kc(coll)) || {}; c[id] = Object.assign(c[id] || {}, patch); LS.set(this.kc(coll), c); }
  async deleteItem(coll, id) { const c = LS.get(this.kc(coll)) || {}; delete c[id]; LS.set(this.kc(coll), c); }
  async listItems(coll) { return LS.get(this.kc(coll)) || {}; }
  trim(c, coll) {
    const max = { log: 4000, sess: 400, notif: 1500 }[coll];
    if (!max) return;
    const ids = Object.keys(c); if (ids.length <= max) return;
    ids.sort((a, b) => (c[a].ts || 0) - (c[b].ts || 0)).slice(0, ids.length - max).forEach(i => delete c[i]);
  }
}

// ── Archivio cloud (Firebase Firestore) ───────────────────────────────────
const FB_VER = '10.12.5';
class FirebaseAdapter {
  constructor(ns, cfg) { this.ns = ns; this.cfg = cfg; this.kind = 'cloud'; }
  async init() {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    await loadScript(base + 'firebase-app-compat.js');
    await loadScript(base + 'firebase-auth-compat.js');
    await loadScript(base + 'firebase-firestore-compat.js');
    const fb = window.firebase;
    this.fb = fb;
    this.app = fb.apps.find(a => a.name === 'gt2') || fb.initializeApp(this.cfg, 'gt2');
    this.db = this.app.firestore();
    try { await this.db.enablePersistence({ synchronizeTabs: true }); } catch (e) { }
    const auth = this.app.auth();
    // arrivo da un link di accesso via email: si completa l'accesso verificato
    try {
      if (auth.isSignInWithEmailLink(location.href)) {
        const email = LS.get('gt2:linkEmail') || window.prompt('Conferma la tua email per completare l’accesso');
        if (email) { await auth.signInWithEmailLink(email, location.href); LS.del('gt2:linkEmail'); history.replaceState(null, '', location.pathname + location.search.replace(/[?&](apiKey|oobCode|mode|lang)=[^&]*/g, '') + location.hash); }
      }
    } catch (e) { console.warn('Link di accesso non valido', e); }
    const user = await new Promise(r => { const off = auth.onAuthStateChanged(u => { off(); r(u); }); });
    if (!user) await auth.signInAnonymously();
    this.email = (auth.currentUser && auth.currentUser.email || '').toLowerCase() || null;
  }
  async sendLink(email) {
    await this.app.auth().sendSignInLinkToEmail(email, { url: location.href.split('#')[0], handleCodeInApp: true });
    LS.set('gt2:linkEmail', email);
  }
  async signOutEmail() { await this.app.auth().signOut(); await this.app.auth().signInAnonymously(); this.email = null; }
  d(name) { return this.db.collection(this.ns + '_data').doc(name); }
  c(coll) { return this.db.collection(this.ns + '_' + coll); }
  async getDoc(name) { const s = await this.d(name).get(); return s.exists ? s.data() : null; }
  async setDoc(name, data) { await this.d(name).set(data); }
  async mergeDoc(name, data) { await this.d(name).set(data, { merge: true }); }
  async updateMap(name, field, entries) {
    const FP = this.fb.firestore.FieldPath, FV = this.fb.firestore.FieldValue;
    const args = [];
    for (const [k, v] of Object.entries(entries)) args.push(new FP(field, k), v === null ? FV.delete() : v);
    args.push('updatedAt', Date.now());
    try { await this.d(name).update(...args); }
    catch (e) {
      // documento inesistente: lo crea con le sole voci da scrivere
      const obj = {}; for (const [k, v] of Object.entries(entries)) if (v !== null) obj[k] = v;
      await this.d(name).set({ [field]: obj, updatedAt: Date.now() }, { merge: true });
    }
  }
  async listDocs(prefix) {
    const out = {}; const snap = await this.db.collection(this.ns + '_data').get();
    snap.forEach(s => { if (s.id.startsWith(prefix)) out[s.id] = s.data(); }); return out;
  }
  async deleteDoc(name) { await this.d(name).delete(); }
  watchDoc(name, cb) { return this.d(name).onSnapshot(s => cb(s.exists ? s.data() : null), e => console.warn('watch', name, e)); }
  watchColl(coll, cb) {
    let q = this.c(coll);
    if (coll === 'notif' || coll === 'log') q = q.where('ts', '>', Date.now() - 60 * 864e5);
    return q.onSnapshot(s => { const o = {}; s.forEach(x => o[x.id] = x.data()); cb(o); }, e => console.warn('watch', coll, e));
  }
  async addItem(coll, id, data) { await this.c(coll).doc(id).set(data); }
  async updateItem(coll, id, patch) { await this.c(coll).doc(id).set(patch, { merge: true }); }
  async deleteItem(coll, id) { await this.c(coll).doc(id).delete(); }
  async listItems(coll, sinceTs) {
    let q = this.c(coll); if (sinceTs) q = q.where('ts', '>', sinceTs);
    const s = await q.get(); const o = {}; s.forEach(x => o[x.id] = x.data()); return o;
  }
}

// ── Il negozio ────────────────────────────────────────────────────────────
const listeners = new Set();
export const store = {
  profile: PROFILES.autisti,
  ns: 'gt2',
  adapter: null,
  cloudCfg: null,
  config: null,
  months: {},          // 'AAAA-MM' → { cells, rep }
  agenda: {},          // op → { data: { c, n } }
  requests: {},
  notif: {},
  pending: {},         // modifiche non ancora pubblicate: 'op|data' → casella|null ; 'rep|data' → [..]|null
  undoStack: [], redoStack: [],
  editing: false,
  me: null,            // id operatore scelto in "Chi sei?"
  role: 'guest',       // guest | operator | coord | admin
  online: navigator.onLine,
  loadedYears: new Set(),

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(what, info) { for (const fn of listeners) { try { fn(what, info); } catch (e) { console.error(e); } } },

  // ── Avvio ──
  async boot() {
    const local = LS.get('gt2:cloud');
    let shared = null;
    try { const r = await fetch('data/cloud.json', { cache: 'no-store' }); if (r.ok) shared = await r.json(); } catch (e) { }
    const cloud = (local && local.enabled !== undefined) ? local : shared;
    this.cloudCfg = cloud;
    // profilo: link con ?p=infermieri  >  ultima scelta su questo dispositivo  >  predefinito del cloud
    const qp = new URLSearchParams(location.search).get('p');
    if (qp && PROFILES[qp]) LS.set('gt2:profile', qp);
    this.profile = PROFILES[LS.get('gt2:profile') || (cloud && cloud.profile) || 'autisti'] || PROFILES.autisti;
    document.documentElement.dataset.profile = this.profile.key;
    // ogni profilo ha il suo archivio (in cloud: <prefisso> per gli autisti, <prefisso>inf per gli infermieri)
    const base = (cloud && cloud.ns) || 'gt2';
    this.ns = this.profile.key === 'autisti' ? base : base + 'inf';
    if (cloud && cloud.enabled && cloud.firebase) {
      try { this.adapter = new FirebaseAdapter(this.ns, cloud.firebase); await this.adapter.init(); }
      catch (e) { console.error('Cloud non raggiungibile, uso l’archivio locale', e); this.cloudError = String(e.message || e); this.adapter = new LocalAdapter(this.ns); }
    } else this.adapter = new LocalAdapter(this.ns);
    this.me = LS.get(`${this.ns}:me`);
    this.pending = LS.get(`${this.ns}:pending`) || {};
    let cfg = await this.adapter.getDoc('config');
    if (!cfg) cfg = await this.firstRun();
    this.config = this.normalizeConfig(cfg);
    await this.loadYear(this.config.year);
    await this.loadAgenda();
    this.requests = await this.adapter.listItems('requests') || {};
    this.notif = await this.adapter.listItems('notif', Date.now() - 90 * 864e5) || {};
    this.restoreRole();
    this.watchAll();
    window.addEventListener('online', () => { this.online = true; this.emit('net'); });
    window.addEventListener('offline', () => { this.online = false; this.emit('net'); });
    this.logSession();
  },

  normalizeConfig(c) {
    c.operators = (c.operators || []).map((o, i) => Object.assign({
      id: 'op' + i, surname: '', name: '', label: '', color: OPERATOR_PALETTE[i % OPERATOR_PALETTE.length], role: 'T', active: true,
      weeklyMin: this.profile.weeklyMin, params: Object.assign({}, this.profile.defaults), initBalance: 0, prevWeek: 0, phone: '', email: ''
    }, o));
    c.festivi = c.festivi || [];
    c.festNames = c.festNames || {};
    c.shifts = c.shifts || null;       // null = codici di default del profilo
    c.absences = c.absences || null;
    c.announcements = c.announcements || [];
    c.welcome = c.welcome || { active: false, title: '', text: '' };
    c.rules = Object.assign({ minRestHours: 11, maxConsecutive: 6, nightThenSmonto: true, requireCoverage: true }, c.rules || {});
    c.app = Object.assign({ title: this.profile.title, unit: this.profile.unit, entity: this.profile.entity }, c.app || {});
    return c;
  },

  async firstRun() {
    const y = new Date().getFullYear() >= 2026 ? 2026 : new Date().getFullYear();
    const cfg = { year: y, createdAt: Date.now(), operators: [], festivi: holidaysSM(y).map(h => h.date).concat(holidaysSM(y + 1).slice(0, 2).map(h => h.date)) };
    if (this.profile.seed) {
      try {
        const seed = await (await fetch(this.profile.seed)).json();
        cfg.year = seed.year;
        cfg.festivi = seed.festivi;
        cfg.operators = seed.operators.map((o, i) => ({
          id: o.id, surname: o.surname, name: o.name, label: o.label, color: o.color, active: true, order: i, from: o.from, to: o.to,
          role: 'T', weeklyMin: this.profile.weeklyMin,
          params: Object.assign({}, this.profile.defaults, seed.params[o.id] || {}),
          initBalance: seed.initBalance[o.id] || 0, prevWeek: (seed.prevWeek || {})[o.id] || 0
        }));
        const months = {};
        for (const [op, cells] of Object.entries(seed.cells)) for (const [d, c] of Object.entries(cells)) {
          const m = ym(d); (months[m] = months[m] || { cells: {}, rep: {} }).cells[op + '|' + d] = c;
        }
        for (const [d, r] of Object.entries(seed.rep || {})) { const m = ym(d); (months[m] = months[m] || { cells: {}, rep: {} }).rep[d] = r; }
        for (const [m, doc] of Object.entries(months)) await this.adapter.setDoc('m_' + m, Object.assign(doc, { updatedAt: Date.now() }));
        cfg.seededFrom = 'Autisti 2026.xlsm';
      } catch (e) { console.error('Seed non caricato', e); }
    }
    await this.adapter.setDoc('config', cfg);
    return cfg;
  },

  async loadYear(y) {
    const docs = await this.adapter.listDocs('m_');
    for (const [name, d] of Object.entries(docs)) this.months[name.slice(2)] = { cells: (d && d.cells) || {}, rep: (d && d.rep) || {} };
    this.loadedYears.add(y);
  },
  async loadAgenda() {
    const docs = await this.adapter.listDocs('agenda_');
    for (const [name, d] of Object.entries(docs)) this.agenda[name.slice(7)] = (d && d.days) || {};
  },

  watchAll() {
    const a = this.adapter;
    if (a.kind !== 'cloud') {
      // tra schede dello stesso browser
      a.watchDoc('config', d => { if (d) { this.config = this.normalizeConfig(d); this.emit('config'); } });
      return;
    }
    a.watchDoc('config', d => { if (d) { this.config = this.normalizeConfig(d); this.emit('config'); } });
    const y = this.config.year;
    const ms = []; for (let m = 1; m <= 12; m++) ms.push(`${y}-${String(m).padStart(2, '0')}`); ms.push(`${y + 1}-01`, `${y - 1}-12`);
    for (const m of ms) a.watchDoc('m_' + m, d => { this.months[m] = { cells: (d && d.cells) || {}, rep: (d && d.rep) || {} }; this.emit('cells', { month: m, remote: true }); });
    a.watchColl('requests', o => { this.requests = o; this.emit('requests'); });
    a.watchColl('notif', o => { this.notif = o; this.emit('notif'); });
  },

  // ── Ruoli ──
  // Accesso alla gestione: il gettone vale finché non scade (12 ore, o 30 giorni con "ricorda")
  // e solo se la password non è stata cambiata nel frattempo.
  restoreRole() {
    const tok = LS.get(`${this.ns}:auth`);
    const fp = h => String(h || '').slice(-24);
    // accesso verificato dal server (cloud): l'email del coordinatore decide il ruolo
    const em = this.adapter && this.adapter.email; const mg = em && (this.config.managers || []).find(x => x.email === em);
    if (mg) { this.role = mg.role === 'admin' ? 'admin' : 'coord'; return; }
    const valid = tok && tok.h && (!tok.exp || tok.exp > Date.now());
    if (valid && tok.role === 'admin' && tok.h === fp(this.config.adminHash)) this.role = 'admin';
    else if (valid && tok.role === 'coord' && (tok.h === fp(this.config.coordHash) || tok.h === fp(this.config.adminHash))) this.role = 'coord';
    else { if (tok && !valid) LS.del(`${this.ns}:auth`); this.role = this.me ? 'operator' : 'guest'; }
  },
  setAuth(role, stored, keep = false) {
    if (role) LS.set(`${this.ns}:auth`, { role, h: String(stored || '').slice(-24), exp: Date.now() + (keep ? 30 * 864e5 : 12 * 3600e3), keep });
    else LS.del(`${this.ns}:auth`);
    this.restoreRole(); this.emit('role');
  },
  // tentativi sbagliati: dopo 5 errori si aspetta, e l'attesa raddoppia
  lockState() { return LS.get(`${this.ns}:lock`) || { fails: 0, until: 0 }; },
  noteFail() { const l = this.lockState(); l.fails++; if (l.fails >= 5) l.until = Date.now() + 60e3 * Math.pow(2, Math.min(6, l.fails - 5)); LS.set(`${this.ns}:lock`, l); return l; },
  clearFails() { LS.del(`${this.ns}:lock`); },
  isManager() { return this.role === 'admin' || this.role === 'coord'; },
  setMe(id) { this.me = id; if (id) LS.set(`${this.ns}:me`, id); else LS.del(`${this.ns}:me`); if (!this.isManager()) this.role = id ? 'operator' : 'guest'; this.emit('me'); },
  whoName() {
    if (this.role === 'admin') return 'Amministratore';
    if (this.role === 'coord') return 'Coordinatore';
    const o = this.op(this.me); return o ? `${o.name} ${o.surname}`.trim() : 'Ospite';
  },

  // ── Operatori ──
  ops(all = false) { return [...this.config.operators].filter(o => all || o.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); },
  op(id) { return this.config.operators.find(o => o.id === id); },
  opName(id, short) { const o = this.op(id); if (!o) return id || ''; return short ? o.surname.charAt(0) + o.surname.slice(1).toLowerCase() : `${o.name} ${o.surname.charAt(0) + o.surname.slice(1).toLowerCase()}`; },

  // ── Caselle ──
  rawCell(op, date) { const m = this.months[ym(date)]; return (m && m.cells[op + '|' + date]) || null; },
  cell(op, date) {
    if (this.editing) { const k = op + '|' + date; if (k in this.pending) return this.pending[k]; }
    return this.rawCell(op, date);
  },
  repOverride(date) {
    if (this.editing && ('rep|' + date) in this.pending) return this.pending['rep|' + date];
    const m = this.months[ym(date)]; return (m && m.rep[date]) || null;
  },
  agendaOf(op, date) { return (this.agenda[op] || {})[date] || null; },
  isFestivo(date) { return this.config.festivi.includes(date); },

  // ── Modifiche (buffer con Annulla/Ripeti, poi "Pubblica") ──
  startEdit() { this.editing = true; this.emit('edit'); },
  stopEdit() { this.editing = false; this.emit('edit'); },
  pendingCount() { return Object.keys(this.pending).length; },
  // changes: [{ key:'op|data' | 'rep|data', val }]
  stage(changes, label = '', stroke = null) {
    if (!changes.length) return;
    const before = changes.map(c => ({ key: c.key, had: c.key in this.pending, val: this.pending[c.key] }));
    const last = this.undoStack[this.undoStack.length - 1];
    const merge = stroke && last && last.stroke === stroke;
    for (const c of changes) {
      const orig = c.key.startsWith('rep|') ? ((this.months[ym(c.key.slice(4))] || { rep: {} }).rep[c.key.slice(4)] || null)
        : this.rawCell(...c.key.split('|'));
      const v = clean(c.val);
      if (JSON.stringify(v) === JSON.stringify(orig)) delete this.pending[c.key];
      else this.pending[c.key] = v;
    }
    const after = changes.map(c => ({ key: c.key, val: clean(c.val) }));
    if (merge) {
      // stesso trascinamento: un solo passo di Annulla (si conserva il primo "prima" di ogni casella)
      for (const b of before) if (!last.before.some(x => x.key === b.key)) last.before.push(b);
      last.after = last.after.filter(a => !after.some(x => x.key === a.key)).concat(after);
    } else this.undoStack.push({ label, before, after, stroke });
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    this.savePending();
    this.emit('cells', { keys: changes.map(c => c.key) });
  },
  undo() {
    const s = this.undoStack.pop(); if (!s) return false;
    for (const b of s.before) { if (b.had) this.pending[b.key] = b.val; else delete this.pending[b.key]; }
    this.redoStack.push(s); this.savePending(); this.emit('cells', { keys: s.before.map(b => b.key) }); return s.label || true;
  },
  redo() {
    const s = this.redoStack.pop(); if (!s) return false;
    for (const a of s.after) { if (a.val === null && !this.origHas(a.key)) delete this.pending[a.key]; else this.pending[a.key] = a.val; }
    this.undoStack.push(s); this.savePending(); this.emit('cells', { keys: s.after.map(a => a.key) });
    return s.label || true;
  },
  origHas(key) {
    if (key.startsWith('rep|')) { const d = key.slice(4); return !!((this.months[ym(d)] || { rep: {} }).rep[d]); }
    return !!this.rawCell(...key.split('|'));
  },
  savePending() { LS.set(`${this.ns}:pending`, this.pending); },
  discard() { this.pending = {}; this.undoStack = []; this.redoStack = []; this.savePending(); this.emit('cells', {}); },

  // Pubblica: scrive per mese, registra lo storico e avvisa gli operatori coinvolti
  async publish(note = '', pend = this.pending) {
    const byMonth = {};
    const logs = [], touched = {};
    for (const [key, val] of Object.entries(pend)) {
      const isRep = key.startsWith('rep|');
      const date = isRep ? key.slice(4) : key.split('|')[1];
      const m = ym(date);
      byMonth[m] = byMonth[m] || { cells: {}, rep: {} };
      if (isRep) { byMonth[m].rep[date] = val; logs.push({ kind: 'rep', date, before: (this.months[m] || { rep: {} }).rep[date] || null, after: val }); }
      else {
        const [op] = key.split('|');
        byMonth[m].cells[key] = val;
        logs.push({ kind: 'cell', op, date, before: this.rawCell(op, date), after: val });
        (touched[op] = touched[op] || []).push(date);
      }
    }
    for (const [m, ch] of Object.entries(byMonth)) {
      const doc = this.months[m] = this.months[m] || { cells: {}, rep: {} };
      for (const [k, v] of Object.entries(ch.cells)) { if (v === null) delete doc.cells[k]; else doc.cells[k] = v; }
      for (const [k, v] of Object.entries(ch.rep)) { if (v === null) delete doc.rep[k]; else doc.rep[k] = v; }
      if (Object.keys(ch.cells).length) await this.adapter.updateMap('m_' + m, 'cells', ch.cells);
      if (Object.keys(ch.rep).length) await this.adapter.updateMap('m_' + m, 'rep', ch.rep);
    }
    const ts = Date.now(), by = this.whoName();
    const batch = uid('b');
    for (const l of logs) await this.adapter.addItem('log', uid('l'), Object.assign({ ts, by, batch, note }, l));
    for (const [op, dates] of Object.entries(touched)) {
      dates.sort();
      const n = { ts, op, read: false, kind: 'turni', title: 'I tuoi turni sono cambiati', dates, by, note };
      const id = uid('n'); this.notif[id] = n; await this.adapter.addItem('notif', id, n);
    }
    if (pend === this.pending) { this.pending = {}; this.undoStack = []; this.redoStack = []; this.savePending(); }
    this.emit('cells', { published: true });
    this.emit('notif');
    return logs.length;
  },
  // Scrittura diretta (es. richiesta approvata): passa dalla stessa pubblicazione
  async applyNow(changes, note) {
    const pend = {}; for (const c of changes) pend[c.key] = clean(c.val);
    return this.publish(note, pend);
  },

  // ── Configurazione ──
  async saveConfig(patch, what = 'Impostazioni') {
    Object.assign(this.config, patch);
    await this.adapter.setDoc('config', stripUndef(this.config));
    await this.adapter.addItem('log', uid('l'), { ts: Date.now(), by: this.whoName(), kind: 'config', note: what });
    this.emit('config');
  },

  // ── Agenda personale ──
  async setAgenda(op, date, val) {
    this.agenda[op] = this.agenda[op] || {};
    if (!val || (!val.c && !val.n)) delete this.agenda[op][date]; else this.agenda[op][date] = val;
    await this.adapter.updateMap('agenda_' + op, 'days', { [date]: val && (val.c || val.n) ? val : null });
    this.emit('agenda', { op });
  },

  // ── Richieste ──
  async saveRequest(r) {
    r.id = r.id || uid('r'); r.ts = r.ts || Date.now(); r.updatedAt = Date.now();
    this.requests[r.id] = r; await this.adapter.addItem('requests', r.id, stripUndef(r)); this.emit('requests');
    return r;
  },
  async deleteRequest(id) { delete this.requests[id]; await this.adapter.deleteItem('requests', id); this.emit('requests'); },

  // ── Notifiche ──
  async notify(op, title, body, extra = {}) {
    const id = uid('n'); const n = Object.assign({ ts: Date.now(), op, title, body, read: false, kind: 'info' }, extra);
    this.notif[id] = n; await this.adapter.addItem('notif', id, n); this.emit('notif');
  },
  myNotif() { return Object.entries(this.notif).filter(([, n]) => n.op === this.me || (n.op === '*') || (n.op === '@manager' && this.isManager())).sort((a, b) => b[1].ts - a[1].ts); },
  async markRead(ids) { for (const id of ids) { if (this.notif[id]) { this.notif[id].read = true; await this.adapter.updateItem('notif', id, { read: true }); } } this.emit('notif'); },

  // ── Storico e accessi ──
  async getLog() { return this.adapter.listItems('log', Date.now() - 120 * 864e5); },
  async getSessions() { return this.adapter.listItems('sess', Date.now() - 30 * 864e5); },
  logSession() {
    const id = sessionStorage.getItem('gt2:sid') || uid('s'); sessionStorage.setItem('gt2:sid', id);
    this.adapter.addItem('sess', id, { ts: Date.now(), who: this.whoName(), me: this.me || null, role: this.role, ua: navigator.userAgent.slice(0, 160), w: innerWidth, mode: this.adapter.kind }).catch(() => { });
  },

  // ── Copie di sicurezza ──
  async exportAll() {
    const data = { app: 'gt2', ns: this.ns, profile: this.profile.key, at: Date.now(), config: this.config, months: this.months, agenda: this.agenda, requests: this.requests };
    return data;
  },
  async importAll(data) {
    if (!data || !data.config || !data.months) throw new Error('File di backup non valido');
    await this.adapter.setDoc('config', data.config);
    for (const [m, d] of Object.entries(data.months)) await this.adapter.setDoc('m_' + m, { cells: d.cells || {}, rep: d.rep || {}, updatedAt: Date.now() });
    for (const [op, days] of Object.entries(data.agenda || {})) await this.adapter.setDoc('agenda_' + op, { days });
    for (const [id, r] of Object.entries(data.requests || {})) await this.adapter.addItem('requests', id, r);
    this.config = this.normalizeConfig(data.config); this.months = deepClone(data.months); this.agenda = data.agenda || {}; this.requests = data.requests || {};
    this.emit('config'); this.emit('cells', {});
  },
  async snapshot(label) {
    const id = 'snap_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const data = await this.exportAll(); data.label = label || 'Copia manuale';
    if (this.adapter.kind === 'local') {
      // sul dispositivo se ne tengono poche: lo spazio è limitato
      const all = await this.adapter.listItems('snap'); const ids = Object.keys(all).sort((a, b) => all[a].ts - all[b].ts);
      while (ids.length >= 4) await this.adapter.deleteItem('snap', ids.shift());
    }
    await this.adapter.addItem('snap', id, { json: JSON.stringify(data), label: data.label, ts: Date.now(), by: this.whoName() });
    return id;
  },
  async listSnapshots() { const d = await this.adapter.listItems('snap'); return Object.entries(d).map(([id, v]) => ({ id, label: v.label, ts: v.ts, by: v.by, size: (v.json || '').length })).sort((a, b) => b.ts - a.ts); },
  async restoreSnapshot(id) { const d = (await this.adapter.listItems('snap'))[id]; if (!d) throw new Error('Copia non trovata'); await this.importAll(JSON.parse(d.json)); },
  async deleteSnapshot(id) { await this.adapter.deleteItem('snap', id); },
  async resetAll() {
    const docs = await this.adapter.listDocs('');
    for (const name of Object.keys(docs)) await this.adapter.deleteDoc(name);
    for (const c of ['requests', 'log', 'notif']) { const items = await this.adapter.listItems(c); for (const id of Object.keys(items)) await this.adapter.deleteItem(c, id); }
    LS.del(`${this.ns}:pending`);
  },

  setCloud(cfg) { if (cfg) LS.set('gt2:cloud', cfg); else LS.del('gt2:cloud'); },
  setProfile(key) { LS.set('gt2:profile', key); },
  // passa da autisti a infermieri (e viceversa): stessa app, archivio separato, si ricarica la pagina
  switchProfile(key) {
    if (!PROFILES[key] || key === this.profile.key) return;
    LS.set('gt2:profile', key);
    const u = new URL(location.href); u.searchParams.set('p', key); u.hash = '';
    location.replace(u.toString());
  },
  lsGet: LS.get, lsSet: LS.set
};

// Casella vuota → null; toglie i campi vuoti
function clean(c) {
  if (!c || typeof c !== 'object') return c ?? null;
  if (Array.isArray(c)) return c.some(x => x) ? c : null;
  const o = {};
  for (const [k, v] of Object.entries(c)) if (v !== undefined && v !== null && v !== '' && !(k === 'cr' && v === 0 && false)) o[k] = v;
  return Object.keys(o).length ? o : null;
}
function stripUndef(o) { return JSON.parse(JSON.stringify(o)); }

export { addDays, FirebaseAdapter as FirebaseAdapterClass };
