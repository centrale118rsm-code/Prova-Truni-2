// ═══════════════════════════════════════════════════════════════════════════
// CALCOLI — le formule del file Excel, una per una:
//  • ore lavorate (CONTEGGI ORARI) e saldo settimanale rispetto alle 36 ore
//  • ferie, residui, permessi a giorni e a ore (righe 2-5 del foglio TURNI)
//  • reperibilità a 4 fasce (colonne AQ-AT) e ore per il quadro mensile
//  • festivi lavorati, non goduti, non lavorati (tabella FESTIVI)
//  • coperture giornaliere (colonne B-G) e controlli
//  • turno / diurno / casa (GRAFICO TURNI)
// ═══════════════════════════════════════════════════════════════════════════
import { store } from './store.js';
import { DEFAULT_SHIFTS, DEFAULT_ABSENCES, DEFAULT_REP_BANDS, LINE_COLORS } from './profile.js';
import { addDays, daysBetween, dow, mondayOf, rangeDays, monthDays, ym, yearOf, hm, fmtShort } from './util.js';

const EPOCH = '2026-01-01';   // giorno 0 per i colori delle linee (come la riga 8 del foglio)

let _sh = null, _shKey = null, _ab = null, _abKey = null;
export function shifts() {
  const list = store.config && store.config.shifts || store.profile.shifts || DEFAULT_SHIFTS;
  if (_shKey !== list) { _shKey = list; _sh = new Map(list.map(s => [s.code, s])); }
  return _sh;
}
export const shiftList = () => [...shifts().values()];
export function absences() {
  const list = store.config && store.config.absences || store.profile.absences || DEFAULT_ABSENCES;
  if (_abKey !== list) { _abKey = list; _ab = new Map(list.map(a => [a.code, a])); }
  return _ab;
}
export const absList = () => [...absences().values()];
export const repBands = () => (store.config && store.config.repBands) || DEFAULT_REP_BANDS;

export function shiftInfo(code) {
  if (!code) return null;
  const m = shifts();
  return m.get(code) || m.get(code.trim()) || (code.trim() === 'R' ? m.get('R') : null) || guessShift(code);
}
function guessShift(code) {
  // codici scritti a mano non in tabella: deduce il tipo dalle lettere
  const c = code.trim();
  const rep = c.includes('/R');
  if (/^(MAT|POM|NOTT|SM)/.test(c)) return { code: c, label: c, group: 'T', min: 0, rep, cnt: [], unknown: true };
  if (/^(matt|mat|pom)/.test(c)) return { code: c, label: c, group: 'D', min: 432, rep, cnt: [], unknown: true };
  if (/ripo/i.test(c)) return { code: c, label: 'Riposo', group: 'R', min: 0, cnt: [] };
  return { code: c, label: c, group: rep ? 'X' : 'O', min: 0, rep, cnt: [], unknown: true };
}
export function absInfo(code) {
  if (!code) return null;
  const m = absences();
  return m.get(code) || m.get(String(code).toLowerCase()) || { code, label: code, bg: '#ddd', fg: '#333', kind: 'altro', unknown: true };
}
const absKind = c => c && c.a ? (absInfo(c.a).kind) : null;

// ── Linea del ciclo turnisti (colore del testo nel foglio) ─────────────────
export const dayIndex = date => daysBetween(EPOCH, date);
export function lineOf(code, date) {
  const s = shiftInfo(code); if (!s || s.group !== 'T' && !(s.group === 'R' && code.trim() === 'R') || s.pos == null) return null;
  return ((dayIndex(date) - s.pos) % 5 + 5) % 5;
}
export const lineColor = (code, date) => { const l = lineOf(code, date); return l == null ? null : LINE_COLORS[l]; };
// Il ciclo del profilo: per ogni posizione il primo codice "semplice" (POM, MAT, NOTT, SM, R oppure P, M, N, S, R)
export function cycle() { const out = []; for (let p = 0; p < 5; p++) { const s = shiftList().find(x => x.pos === p && !x.rep && (x.cnt || []).length <= 1); out.push(s ? s.code : ''); } return out; }
export const codeForLine = (line, date) => cycle()[((dayIndex(date) - line) % 5 + 5) % 5];
// Codici diurni del profilo: mattina (dm), pomeriggio (dp), riposo (rip)
export const diurnoCode = k => { const s = shiftList().find(x => (x.cnt || []).length === 1 && x.cnt[0] === k && !x.rep); return s ? s.code : ''; };
export const repCodeOf = code => { const c = code + '/R'; return shifts().has(c) ? c : null; };
export const isNightCode = code => { const s = shiftInfo(code); return !!(s && (s.cnt || []).includes('tn')); };
export const isSmontoCode = code => { const s = shiftInfo(code); return !!(s && s.pos === 3 && s.group === 'T'); };
export const coverageWant = () => Object.assign({ tm: 1, tp: 1, tn: 1 }, store.profile.coverageWant || {}, (store.config && store.config.rules && store.config.rules.coverageWant) || {});

// ── Ore ─────────────────────────────────────────────────────────────────
export const workedMin = c => { if (!c || !c.s) return 0; const s = shiftInfo(c.s); return s ? (s.min || 0) : 0; };
// Ore accreditate: valore scritto nella casella, oppure ore di permesso, oppure (profilo infermieri)
// le ore di contratto del giorno per un'assenza giustificata: ore settimanali ÷ 6 da lunedì a sabato.
export function creditMin(c, d) {
  if (!c) return 0;
  if (c.cr != null) return c.cr;
  if (c.ph) return c.ph * 60;
  if (c.a && d && store.profile.creditMode === 'six' && !isRest(c) && !(c.s && workedMin(c))) return dow(d) === 0 ? 0 : Math.round(store.profile.weeklyMin / 6);
  return 0;
}
export const dayMin = (c, d) => workedMin(c) + creditMin(c, d);
export const isRest = c => !!(c && c.s && /^r/i.test(c.s.trim()) && !c.s.includes('/R'));   // "R*" come COUNTIFS (non distingue maiuscole)
export const isWork = c => { const s = c && c.s && shiftInfo(c.s); return !!(s && (s.group === 'T' || s.group === 'D') && s.min > 0); };
export const hasRep = c => !!(c && c.s && c.s.includes('/R'));

// Turno "teorico" del giorno: serve per proporre le ore da accreditare a un'assenza
export function expectedCode(op, date) {
  for (let k = 1; k <= 12; k++) for (const d of [addDays(date, -k), addDays(date, k)]) {
    const c = store.cell(op, d); const l = c && c.s ? lineOf(c.s, d) : null;
    if (l != null) return codeForLine(l, date);
    if (c && c.s && shiftInfo(c.s).group === 'D') { const wd = dow(date); return wd === 0 || wd === 6 ? diurnoCode('rip') : diurnoCode('dm'); }
  }
  return null;
}
export function suggestedCredit(op, date, prevCell) {
  if (store.profile.creditMode === 'six') return dow(date) === 0 ? 0 : Math.round(((store.op(op) || {}).weeklyMin || store.profile.weeklyMin) / 6);
  if (prevCell && prevCell.s && !isRest(prevCell)) { const m = workedMin(prevCell); if (m) return m; }
  const e = expectedCode(op, date); if (e) return (shiftInfo(e) || {}).min || 0;
  const wd = dow(date); return wd === 0 || wd === 6 ? 0 : store.profile.contractDayMin;
}

// ── Saldo settimanale (CONTEGGI ORARI: H10 = H9 − 36 + saldo precedente) ───
export function weeks(op, year = store.config.year) {
  const o = store.op(op); if (!o) return [];
  const first = mondayOf(`${year}-01-01`), last = addDays(mondayOf(`${year}-12-31`), 6);
  const out = []; let bal = o.initBalance || 0;
  const weekly = o.weeklyMin || store.profile.weeklyMin;
  for (let m = first; m <= last; m = addDays(m, 7)) {
    let worked = 0, credit = 0; const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(m, i);
      if (yearOf(d) < year) continue;
      const c = store.cell(op, d); const w = workedMin(c), cr = creditMin(c, d);
      worked += w; credit += cr; days.push({ d, c, w, cr });
    }
    if (m < `${year}-01-01`) {
      const prevHas = rangeDays(m, `${year - 1}-12-31`).some(d => store.cell(op, d));
      if (prevHas) for (const d of rangeDays(m, `${year - 1}-12-31`)) { const c = store.cell(op, d); worked += workedMin(c); credit += creditMin(c, d); }
      else credit += o.prevWeek || 0;
    }
    // in servizio dal / fino al: le settimane fuori servizio non contano, quelle a metà si proporzionano
    const act = activeDays(o, m, addDays(m, 6));
    if (!act) { out.push({ monday: m, sunday: addDays(m, 6), worked, credit, total: worked + credit, delta: 0, balance: bal, days, off: true }); continue; }
    const due = act === 7 ? weekly : Math.round(weekly * act / 7);
    const total = worked + credit;
    bal = bal + total - due;
    out.push({ monday: m, sunday: addDays(m, 6), worked, credit, total, delta: total - due, balance: bal, days, due });
  }
  return out;
}
// Giorni in servizio nell'intervallo (campi "from" e "to" dell'operatore)
export function activeDays(o, a, b) { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (inService(o, d)) n++; return n; }
export const inService = (o, d) => !!o && (!o.from || d >= o.from) && (!o.to || d <= o.to);
export function balanceAt(op, date) {
  const w = weeks(op, yearOf(date)); let b = (store.op(op) || {}).initBalance || 0;
  for (const x of w) { if (x.sunday <= date) b = x.balance; }
  return b;
}
export function monthHours(op, y, m) {
  let worked = 0, credit = 0;
  for (const d of monthDays(y, m)) { const c = store.cell(op, d); worked += workedMin(c); credit += creditMin(c, d); }
  return { worked, credit, total: worked + credit };
}

// ── Reperibilità ────────────────────────────────────────────────────────
export function repHolder(date) {
  for (const o of store.ops(true)) if (hasRep(store.cell(o.id, date))) return o.id;
  return '';
}
export function repHolders(date) { return store.ops(true).filter(o => hasRep(store.cell(o.id, date))).map(o => o.id); }
export function repDefault(date) { const p = repHolder(addDays(date, -1)), t = repHolder(date); return [p, p, t, t]; }
export function repOf(date) { return store.repOverride(date) || repDefault(date); }
export const repIsOverride = (date, i) => { const o = store.repOverride(date); if (!o) return false; return o[i] !== repDefault(date)[i]; };
export function repMinutes(op, from, to) {
  const bands = repBands(); let min = 0, count = 0;
  for (const d of rangeDays(from, to)) { const r = repOf(d); r.forEach((x, i) => { if (x === op) min += bands[i].min; }); if (hasRep(store.cell(op, d))) count++; }
  return { min, count };
}
// Ore di reperibilità per giorno (foglio CONTEGGI ORE REP / quadro mensile)
export function repDayHours(op, date) { const bands = repBands(); return repOf(date).reduce((a, x, i) => a + (x === op ? bands[i].min : 0), 0); }

// ── Statistiche annuali per operatore ───────────────────────────────────
export function yearStats(op, year = store.config.year) {
  const o = store.op(op) || { params: {} }; const p = Object.assign({}, store.profile.defaults, o.params || {});
  const days = rangeDays(`${year}-01-01`, `${year}-12-31`);
  const st = {
    turno: 0, diurno: 0, casa: 0, notti: 0, smonti: 0, mattine: 0, pomeriggi: 0, weekend: 0, sabati: 0, domeniche: 0,
    festLav: 0, oreFestLav: 0, fng: 0, fnl: 0, festR: 0, rep: 0, repMin: 0,
    ferieUsate: 0, ferieAPUsate: 0, vNext: 0, permGg: 0, pn: 0, permOre: 0, malattia: 0, recuperi: 0, absByCode: {},
    worked: 0, credit: 0, empty: 0
  };
  const bands = repBands();
  for (const d of days) {
    const c = store.cell(op, d); const s = c && c.s ? shiftInfo(c.s) : null;
    const fest = store.isFestivo(d), wd = dow(d);
    if (s && s.group === 'T' && s.min > 0) st.turno++;
    else if (s && s.group === 'D' && s.min > 0) st.diurno++;
    if (c && c.s) {
      const code = c.s.trim();
      if (isNightCode(code)) st.notti++;
      if (isSmontoCode(code)) st.smonti++;
      if (s && s.cnt && (s.cnt.includes('tm') || s.cnt.includes('dm'))) st.mattine++;
      if (s && s.cnt && (s.cnt.includes('tp') || s.cnt.includes('dp'))) st.pomeriggi++;
      if (isWork(c) && (wd === 0 || wd === 6)) { st.weekend++; if (wd === 6) st.sabati++; else st.domeniche++; }
      if (hasRep(c)) st.rep++;
    }
    if (!c || (!c.s && !c.a && !c.ph)) st.empty++;
    if (fest) {
      if (c && c.s && c.s.trim() !== 'R') st.festLav++;
      if (c && c.s && c.s.trim() === 'R') st.festR++;
      if (c && c.a === 'ng') st.fng++;
      if (c && c.a === 'nl') st.fnl++;
      st.oreFestLav += workedMin(c);
    }
    st.worked += workedMin(c); st.credit += creditMin(c, d);
    if (c && c.a) {
      const a = String(c.a); const k = absKind(c);
      st.absByCode[a.toLowerCase()] = (st.absByCode[a.toLowerCase()] || 0) + 1;
      if ((a === 'f' || a === 'F') && !isRest(c)) st.ferieUsate++;
      if ((a === 'v' || a === 'V') && !isRest(c)) st.ferieAPUsate++;
      if (/^p/i.test(a)) st.permGg++;
      if (a === 'pn') st.pn++;
      if (k === 'mal') st.malattia++;
      if (k === 'rec') st.recuperi++;
    }
    if (c && c.ph) st.permOre += c.ph;
    repOf(d).forEach((x, i) => { if (x === op) st.repMin += bands[i].min; });
  }
  // gennaio dell'anno dopo: residuo "v" usato (riga 2, colonna L del foglio)
  const fn = store.profile.ferieNext || { codes: ['v'], until: '01-31' };
  for (const d of rangeDays(`${year + 1}-01-01`, `${year + 1}-${fn.until}`)) { const c = store.cell(op, d); if (c && c.a && fn.codes.includes(String(c.a).toLowerCase()) && !isRest(c)) st.vNext++; }
  st.casa = days.length - st.turno - st.diurno;
  st.ferieSpettanti = p.ferie; st.ferieRestanti = p.ferie - st.ferieUsate - st.vNext;
  st.ferieAP = p.ferieAP || 0; st.ferieAPRestanti = store.profile.hasFerieAP === false && !p.ferieAP ? null : (p.ferieAP || 0) - st.ferieAPUsate;
  st.permOreSpettanti = p.permOre; st.permOreRestanti = p.permOre - st.permOre;
  st.permGgSpettanti = p.permGg; st.permGgRestanti = p.permGg - st.permGg;
  return st;
}

// ── Coperture del giorno (colonne B-G) ──────────────────────────────────
export function coverage(date) {
  const cov = { tm: 0, tp: 0, tn: 0, dm: 0, dp: 0, rip: 0, rep: 0 };
  for (const o of store.ops()) {
    const c = store.cell(o.id, date); if (!c || !c.s) continue;
    const s = shiftInfo(c.s); if (!s) continue;
    for (const k of s.cnt || []) cov[k] = (cov[k] || 0) + 1;
    if (hasRep(c)) cov.rep++;
  }
  return cov;
}
// colori della scala come la formattazione condizionale del foglio
export function covStyle(key, v, cov) {
  if (key === 'tm' || key === 'tp' || key === 'tn') { const w = coverageWant()[key]; return v === w ? { bg: '#00B050', fg: w === 1 ? '#00B050' : '#fff' } : v > w ? { bg: '#FFC000', fg: '#000' } : { bg: '#FF5050', fg: '#fff' }; }
  if (key === 'dm' || key === 'dp') {
    const other = key === 'dm' ? cov.dp : cov.dm;
    if (v === 2 && other === 0) return { bg: '#FF0000', fg: '#fff' };
    return [{ bg: '#99FF66', fg: '#333' }, { bg: '#00EE00', fg: '#033' }, { bg: '#00B050', fg: '#fff' }, { bg: '#00FFFF', fg: '#033' }][Math.min(v, 3)];
  }
  if (key === 'rip') return v > 3 ? { bg: '#FF0000', fg: '#fff' } : [{ bg: '#61E7FF', fg: '#61E7FF' }, { bg: '#00B0F0', fg: '#fff' }, { bg: '#087CFF', fg: '#fff' }, { bg: '#0432FF', fg: '#fff' }][v];
  return { bg: '#eee', fg: '#333' };
}

// ── Controlli ("Da controllare") ────────────────────────────────────────
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export function validate(from, to) {
  const issues = [];
  const rules = store.config.rules || {};
  const ops = store.ops();
  for (const d of rangeDays(from, to)) {
    const cov = coverage(d);
    const lbl = fmtShort(d);
    if (rules.requireCoverage !== false) {
      const want = coverageWant();
      for (const [k, name] of [['tm', 'mattina turnista'], ['tp', 'pomeriggio turnista'], ['tn', 'notte']]) {
        if (cov[k] === 0) issues.push({ date: d, level: 'err', cat: 'Copertura', msg: `${lbl}: manca la ${name}` });
        else if (cov[k] < want[k]) issues.push({ date: d, level: 'err', cat: 'Copertura', msg: `${lbl}: ${name} con ${cov[k]} su ${want[k]}` });
        else if (cov[k] > want[k]) issues.push({ date: d, level: want[k] === 1 ? 'err' : 'warn', cat: 'Copertura', msg: `${lbl}: ${cov[k]} operatori di ${name} (previsti ${want[k]})` });
      }
      if (cov.rep === 0) issues.push({ date: d, level: 'warn', cat: 'Reperibilità', msg: `${lbl}: nessun reperibile (/R)` });
      if (cov.rep > 1) issues.push({ date: d, level: 'warn', cat: 'Reperibilità', msg: `${lbl}: ${cov.rep} reperibili nello stesso giorno` });
      if ((cov.dm === 2 && cov.dp === 0) || (cov.dp === 2 && cov.dm === 0)) issues.push({ date: d, level: 'warn', cat: 'Diurni', msg: `${lbl}: diurni sbilanciati (${cov.dm} mattina, ${cov.dp} pomeriggio)` });
      if (cov.rip > 3) issues.push({ date: d, level: 'warn', cat: 'Riposi', msg: `${lbl}: ${cov.rip} riposi diurni` });
    }
    const seen = {};
    for (const o of ops) {
      const c = store.cell(o.id, d); const nm = store.opName(o.id, true);
      if (!inService(o, d)) continue;
      if (!c || (!c.s && !c.a && !c.ph)) { issues.push({ date: d, op: o.id, level: 'info', cat: 'Caselle vuote', msg: `${lbl}: ${nm} senza turno` }); continue; }
      if (!c.s) continue;
      const s = shiftInfo(c.s);
      if (s.unknown) issues.push({ date: d, op: o.id, level: 'warn', cat: 'Codici', msg: `${lbl}: ${nm} ha un codice non in tabella («${c.s}»)` });
      if (s.group === 'T' && coverageWant().tm === 1 && !isSmontoCode(c.s) && c.s.trim() !== 'R') { (seen[c.s.trim()] = seen[c.s.trim()] || []).push(nm); }
      if (s.needs) for (const [k, n] of Object.entries(s.needs)) if ((cov[k] || 0) < n) issues.push({ date: d, op: o.id, level: 'err', cat: 'Regole', msg: `${lbl}: ${nm} «${c.s}» richiede almeno ${n} diurni (${k === 'dm' ? 'mattina' : 'pomeriggio'})` });
      const nx = store.cell(o.id, addDays(d, 1));
      if (rules.nightThenSmonto !== false && isNightCode(c.s) && s.group === 'T' && !(nx && (nx.s && isSmontoCode(nx.s) || nx.a))) issues.push({ date: d, op: o.id, level: 'warn', cat: 'Sequenze', msg: `${lbl}: ${nm} dopo la notte non ha lo smonto` });
      // riposo tra un turno e il successivo
      if (nx && nx.s && s.to && (s.group === 'T' || s.group === 'D')) {
        const ns = shiftInfo(nx.s);
        if (ns && ns.from && (ns.group === 'T' || ns.group === 'D') && !isSmontoCode(nx.s)) {
          const gap = 1440 - toMin(s.to) + toMin(ns.from);
          if (gap < (rules.minRestHours || 11) * 60) issues.push({ date: d, op: o.id, level: 'warn', cat: 'Riposo minimo', msg: `${lbl}: ${nm} solo ${hm(gap)} h tra «${c.s}» e «${nx.s}»` });
        }
      }
    }
    for (const [code, who] of Object.entries(seen)) if (who.length > 1) issues.push({ date: d, level: 'err', cat: 'Doppioni', msg: `${lbl}: «${code}» assegnato a ${who.join(', ')}` });
  }
  // giorni lavorativi consecutivi
  const maxC = rules.maxConsecutive || 6;
  for (const o of ops) {
    let run = 0, startRun = null;
    for (const d of rangeDays(addDays(from, -maxC), to)) {
      const c = store.cell(o.id, d);
      if (isWork(c) || (c && c.s && isSmontoCode(c.s))) { if (!run) startRun = d; run++; if (run === maxC + 1 && d >= from) issues.push({ date: d, op: o.id, level: 'warn', cat: 'Riposo minimo', msg: `${fmtShort(d)}: ${store.opName(o.id, true)} ha lavorato ${run} giorni di fila (dal ${fmtShort(startRun)})` }); }
      else run = 0;
    }
  }
  return issues;
}

// ── Equità ──────────────────────────────────────────────────────────────
export function equity(year = store.config.year) {
  const rows = store.ops().map(o => ({ op: o, st: yearStats(o.id, year) }));
  const keys = ['notti', 'weekend', 'domeniche', 'festLav', 'rep', 'repMin', 'turno', 'diurno'];
  const avg = {}; for (const k of keys) avg[k] = rows.reduce((a, r) => a + r.st[k], 0) / Math.max(1, rows.length);
  return { rows, avg, keys };
}

// ── Chi è libero (uscite di gruppo) ─────────────────────────────────────
export function busyWindows(op, date) {
  const out = [];
  const c = store.cell(op, date);
  if (c && c.a && !c.s) return [{ from: 0, to: 1440, why: absInfo(c.a).label }];
  if (c && c.s) { const s = shiftInfo(c.s); if (s && s.from && s.to) out.push({ from: toMin(s.from), to: toMin(s.to) || 1440, why: c.s }); }
  return out;
}
export function freeFor(op, date, from, to) {
  return !busyWindows(op, date).some(w => w.from < to && w.to > from);
}

// ── Testo descrittivo di una casella ────────────────────────────────────
export function describe(c) {
  if (!c) return 'nessun turno';
  const p = [];
  if (c.s) { const s = shiftInfo(c.s); p.push(s ? `${s.label}${s.from ? ` (${s.from}–${s.to})` : ''}` : c.s); }
  if (c.a) p.push(absInfo(c.a).label);
  if (c.ph) p.push(`permesso ${c.ph} h`);
  return p.join(' · ') || 'vuota';
}
export const shortCell = c => !c ? '—' : [c.a ? absInfo(c.a).code : '', c.s || '', c.ph ? c.ph + 'h' : ''].filter(Boolean).join(' ') || '—';
export { ym };

// ── Domeniche (foglio "Domeniche" del file infermieri) ─────────────────
// non lavorate = vuote (assenze o da assegnare) + smonto + riposo; lavorate = tutte le altre
export function sundays(op, year = store.config.year) {
  const out = { tot: 0, lavorate: 0, vuote: 0, sm: 0, rip: 0, non: 0 };
  for (const d of rangeDays(`${year}-01-01`, `${year}-12-31`)) {
    if (dow(d) !== 0 || !inService(store.op(op), d)) continue; out.tot++;
    const c = store.cell(op, d); const s = c && c.s ? c.s.trim() : '';
    if (!s) out.vuote++; else if (isSmontoCode(s)) out.sm++; else if (/^r/i.test(s)) out.rip++;
  }
  out.non = out.vuote + out.sm + out.rip; out.lavorate = out.tot - out.non;
  return out;
}

// ── DIADE: quante volte due colleghi lavorano insieme nella stessa fascia ──
// (il file infermieri conta le notti: coppie "N" nello stesso giorno)
export function diade(kind = 'tn', year = store.config.year, ops = store.ops()) {
  const days = rangeDays(`${year}-01-01`, `${year}-12-31`);
  const inKind = (c, d) => { if (!c || !c.s) return false; const s = shiftInfo(c.s); if (!s) return false; return kind === 'all' ? workedMin(c) > 0 : (kind === 'tn' ? c.s.trim() === cycle()[2] : (s.cnt || []).includes(kind)); };
  const on = {}; for (const o of ops) on[o.id] = new Set(days.filter(d => inKind(store.cell(o.id, d), d)));
  const m = {}; let pairs = 0, done = 0;
  for (let i = 0; i < ops.length; i++) for (let j = 0; j < i; j++) {
    const a = ops[i].id, b = ops[j].id; let n = 0; for (const d of on[a]) if (on[b].has(d)) n++;
    m[a + '|' + b] = n; pairs++; if (n > 0) done++;
  }
  return { matrix: m, pairs, done, ops };
}
