// ═══ Utilità: date, ore, festività, testo, file ═══════════════════════════════

export const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
export const WD = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
export const WD_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

// Le date sono stringhe ISO "AAAA-MM-GG" ovunque: niente fusi orari, confronti diretti.
export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const dow = s => parse(s).getDay();
export const ym = s => s.slice(0, 7);
export const dayNum = s => Number(s.slice(8, 10));
export const monthIdx = s => Number(s.slice(5, 7)) - 1;
export const yearOf = s => Number(s.slice(0, 4));
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export function rangeDays(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
export function monthDays(y, m) { const n = daysInMonth(y, m); const out = []; for (let i = 1; i <= n; i++) out.push(`${y}-${pad(m + 1)}-${pad(i)}`); return out; }
export const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
export const fmtDate = (s, opt = {}) => {
  const d = parse(s);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`;
  return (opt.wd ? WD_LONG[d.getDay()] + ' ' : '') + base + (opt.year ? ' ' + d.getFullYear() : '');
};
export const fmtShort = s => { const d = parse(s); return `${WD[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; };

// Ore in minuti → "7:25"; negativo → "-1:39" (come il foglio CONTEGGI ORARI)
export function hm(min, opt = {}) {
  if (min == null || isNaN(min)) return '';
  const neg = min < 0; const a = Math.abs(Math.round(min));
  const s = `${Math.floor(a / 60)}:${pad(a % 60)}`;
  return neg ? '-' + s : (opt.plus && min > 0 ? '+' + s : s);
}
export function parseHM(s) {
  if (s == null) return null; s = String(s).trim(); if (!s) return null;
  const neg = s.startsWith('-'); s = s.replace(/^[-+]/, '');
  let m;
  if ((m = s.match(/^(\d{1,3})[:.,](\d{1,2})$/))) { const v = Number(m[1]) * 60 + Number(m[2]); return neg ? -v : v; }
  if ((m = s.match(/^\d+$/))) { const v = Number(s) * 60; return neg ? -v : v; }
  return null;
}

// ── Festività della Repubblica di San Marino ──────────────────────────────
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
export function holidaysSM(y) {
  const e = easter(y);
  const list = [
    [`${y}-01-01`, 'Capodanno'], [`${y}-01-06`, 'Epifania'], [`${y}-02-05`, "Sant'Agata"],
    [`${y}-03-25`, "Anniversario dell'Arengo"], [`${y}-04-01`, 'Investitura Capitani Reggenti'],
    [e, 'Pasqua'], [addDays(e, 1), "Lunedì dell'Angelo"], [`${y}-05-01`, 'Festa dei lavoratori'],
    [addDays(e, 60), 'Corpus Domini'], [`${y}-07-28`, 'Caduta del Fascismo'], [`${y}-08-15`, 'Assunzione'],
    [`${y}-09-03`, 'San Marino — Fondazione'], [`${y}-10-01`, 'Investitura Capitani Reggenti'],
    [`${y}-11-01`, 'Ognissanti'], [`${y}-11-02`, 'Commemorazione dei defunti'], [`${y}-12-08`, 'Immacolata'],
    [`${y}-12-25`, 'Natale'], [`${y}-12-26`, 'Santo Stefano']
  ];
  return list.sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, name]) => ({ date, name }));
}

// ── Testo ────────────────────────────────────────────────────────────────
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = arr => arr.reduce((a, b) => a + (b || 0), 0);
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const deepClone = o => JSON.parse(JSON.stringify(o));
export const initials = s => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// Colore del testo leggibile su uno sfondo
export function contrast(hex) {
  const h = String(hex || '#fff').replace('#', '');
  if (h.length < 6) return '#000';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff';
}

// Password e PIN: PBKDF2 (150.000 passaggi, sale casuale). Le vecchie impronte SHA-256 restano valide
// e vengono convertite al primo accesso riuscito.
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
export async function pbkdf2Hex(pass, saltHex, iter = 150000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: iter, hash: 'SHA-256' }, key, 256));
}
export async function hashPass(pass) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2$150000$${salt}$${await pbkdf2Hex(pass, salt, 150000)}`;
}
export async function verifyPass(pass, stored, legacyPrefix = '') {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2$')) { const [, it, salt, h] = stored.split('$'); return (await pbkdf2Hex(pass, salt, +it)) === h; }
  return (await sha256(legacyPrefix + pass)) === stored;
}
export const fingerprint = stored => String(stored || '').slice(-24);

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function download(name, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Impossibile caricare ' + src));
    document.head.appendChild(s);
  });
}

export const vibrate = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };

export function relTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'adesso';
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`;
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const stamp = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
