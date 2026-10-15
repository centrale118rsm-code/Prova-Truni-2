// ═══════════════════════════════════════════════════════════════════════════
// BOZZA AUTOMATICA INTELLIGENTE
// I turnisti seguono il ciclo a 5 linee (P → M → N → S → R): l'algoritmo sceglie la linea di
// ognuno cercando la combinazione migliore con una ricerca locale (scambi e spostamenti casuali,
// si tiene la soluzione con il punteggio più basso). Penalità:
//   • fascia scoperta (meno operatori del previsto in M, P o N)        100 per operatore mancante
//   • turno su un giorno in cui l'operatore è assente o "impossibile"    30
//   • cambio di linea rispetto al mese precedente (spezza il ciclo)     25
//   • linee sbilanciate (più o meno operatori del previsto)             15
//   • squilibrio di notti e weekend rispetto alla media dell'anno        1 per unità
// Poi si scrivono i turni, si assegna la reperibilità e si calcola il punteggio finale.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from './store.js';
import { monthDays, addDays, dow, rangeDays } from './util.js';
import { shiftInfo, lineOf, codeForLine, coverageWant, diurnoCode, repCodeOf, yearStats, cycle, isNightCode } from './calc.js';

export function detectRole(op, start) {
  for (let k = 1; k <= 10; k++) {
    const d = addDays(start, -k); const c = store.cell(op, d);
    if (c && c.s) { const l = lineOf(c.s, d); if (l != null) return 'L' + l; if (shiftInfo(c.s).group === 'D') return 'DA'; }
  }
  return 'skip';
}

// Giorni in cui l'operatore non può lavorare: assenze già scritte, "impossibile" in agenda,
// richieste di ferie/permesso ancora in attesa (se richiesto)
function blockedDays(op, days, opts) {
  const out = new Set();
  for (const d of days) {
    const c = store.cell(op, d);
    if (c && c.a) out.add(d);
    if (opts.respectAvail) { const a = store.agendaOf(op, d); if (a && a.c === 'x') out.add(d); }
  }
  if (opts.pendingRequests) for (const r of Object.values(store.requests)) {
    if (r.op !== op || r.status !== 'attesa' || !['ferie', 'ferieAP', 'permesso', 'recupero', 'malattia'].includes(r.type)) continue;
    for (const d of rangeDays(r.from, r.to || r.from)) if (days.includes(d)) out.add(d);
  }
  return out;
}

export function plan(y, m, roles, opts) {
  const days = monthDays(y, m); const want = coverageWant();
  const turnisti = Object.entries(roles).filter(([, v]) => v.startsWith('L') || v === 'AUTO').map(([op]) => op);
  const blocked = {}; for (const op of Object.keys(roles)) blocked[op] = blockedDays(op, days, opts);
  const prevLine = {}; for (const op of turnisti) { const r = detectRole(op, days[0]); prevLine[op] = r.startsWith('L') ? +r[1] : null; }
  // se il mese ha già turni scritti, la linea di riferimento è quella che compare più spesso
  if (opts.onlyEmpty) for (const op of turnisti) { const f = [0, 0, 0, 0, 0]; for (const d of days) { const c = store.cell(op, d); const l = c && c.s ? lineOf(c.s, d) : null; if (l != null) f[l]++; } const mx = Math.max(...f); if (mx >= 5) prevLine[op] = f.indexOf(mx); }
  // equità: notti e weekend già fatti nell'anno
  const ytd = {}; for (const op of turnisti) { const s = yearStats(op, store.config.year); ytd[op] = { n: s.notti, w: s.weekend }; }
  const fixed = {}; for (const op of turnisti) if (roles[op].startsWith('L') && !opts.optimize) fixed[op] = +roles[op][1];
  const perLine = Math.max(1, want.tm);

  // punteggio di un'assegnazione op → linea
  const score = asg => {
    let pen = 0; const cnt = [0, 0, 0, 0, 0];
    for (const op of turnisti) { cnt[asg[op]]++; if (prevLine[op] != null && prevLine[op] !== asg[op]) pen += 25; }
    // l'equilibrio tra le linee conta solo se si scrive il mese da zero (altrimenti decide la copertura reale)
    if (!opts.onlyEmpty) for (const c of cnt) pen += Math.abs(c - perLine) * 15;
    const nightsAdd = {};
    for (const d of days) {
      const cov = { tm: 0, tp: 0, tn: 0 };
      for (const op of turnisti) {
        // con "solo caselle vuote" i turni già scritti restano: contano quelli, non la linea
        const ex = opts.onlyEmpty ? store.cell(op, d) : null;
        const code = ex && ex.s ? ex.s.trim() : codeForLine(asg[op], d); const s = shiftInfo(code); if (!s) continue;
        if (ex && ex.s) { for (const k of s.cnt || []) if (k in cov) cov[k]++; if (isNightCode(code)) nightsAdd[op] = (nightsAdd[op] || 0) + 1; continue; }
        if (blocked[op].has(d)) { if (s.min > 0) pen += 30; continue; }
        for (const k of s.cnt || []) if (k in cov) cov[k]++;
        if (isNightCode(code)) nightsAdd[op] = (nightsAdd[op] || 0) + 1;
      }
      // i turni già scritti e non toccati contano per la copertura
      if (opts.onlyEmpty) for (const o of store.ops()) { if (roles[o.id] && roles[o.id] !== 'skip') continue; const c = store.cell(o.id, d); const s = c && c.s ? shiftInfo(c.s) : null; if (s) for (const k of s.cnt || []) if (k in cov) cov[k]++; }
      for (const k of ['tm', 'tp', 'tn']) pen += Math.max(0, want[k] - cov[k]) * 100;
    }
    const tot = turnisti.map(op => ytd[op].n + (nightsAdd[op] || 0)); const avg = tot.reduce((a, b) => a + b, 0) / Math.max(1, tot.length);
    pen += tot.reduce((a, b) => a + Math.abs(b - avg), 0);
    return pen;
  };

  // soluzione di partenza: linee del mese prima, poi riempimento delle linee più vuote
  let cur = {}; const cnt = [0, 0, 0, 0, 0];
  for (const op of turnisti) { const l = fixed[op] ?? prevLine[op]; if (l != null) { cur[op] = l; cnt[l]++; } }
  for (const op of turnisti) if (cur[op] == null) { const l = cnt.indexOf(Math.min(...cnt)); cur[op] = l; cnt[l]++; }
  let best = { ...cur }, bestS = score(cur), curS = bestS;
  if (opts.optimize && turnisti.length) {
    const free = turnisti.filter(op => fixed[op] == null);
    for (let it = 0; it < 2500 && free.length; it++) {
      const next = { ...cur };
      if (Math.random() < .5 && free.length > 1) { const a = free[Math.random() * free.length | 0], b = free[Math.random() * free.length | 0]; [next[a], next[b]] = [next[b], next[a]]; }
      else { const a = free[Math.random() * free.length | 0]; next[a] = Math.random() * 5 | 0; }
      const s = score(next);
      // si accetta anche qualche peggioramento all'inizio (ricottura simulata) per non restare bloccati
      const T = 40 * (1 - it / 2500);
      if (s <= curS || Math.random() < Math.exp((curS - s) / Math.max(1, T))) { cur = next; curS = s; if (s < bestS) { best = { ...next }; bestS = s; } }
    }
  }
  return { days, lines: best, score: bestS, blocked, turnisti, prevLine };
}

// Scrive i turni secondo il piano e assegna la reperibilità
export function build(y, m, roles, opts, p = plan(y, m, roles, opts)) {
  const { days, lines, blocked } = p; const ch = []; const repCount = {}; const conflicts = [];
  const ytdRep = {}; for (const op of Object.keys(roles)) ytdRep[op] = yearStats(op, store.config.year).rep;
  const morningT = cycle()[1];
  const dm = diurnoCode('dm') || 'matt', dp = diurnoCode('dp') || 'pome', rip = diurnoCode('rip') || 'ripo';
  for (const d of days) {
    const morning = [];
    for (const o of store.ops()) {
      const v = roles[o.id]; if (!v || v === 'skip') continue;
      const cur = store.cell(o.id, d);
      if (blocked[o.id].has(d)) { if (!(cur && cur.a)) conflicts.push({ op: o.id, d }); continue; }
      if (opts.keepAbs && cur && cur.a) continue;
      if (opts.onlyEmpty && cur && cur.s) { if (cur.s.trim() === morningT || cur.s.trim() === dm) morning.push({ o, code: cur.s.trim() }); continue; }
      let code;
      if (v.startsWith('L') || v === 'AUTO') code = codeForLine(lines[o.id], d);
      else {
        const w = dow(d); const wk = Math.floor((Date.parse(d) / 864e5 + 3) / 7);
        if ((w === 0 || w === 6) && opts.weekendDiurni === 'ripo') code = rip;
        else code = v === 'DM' ? dm : v === 'DP' ? dp : (wk % 2 ? dp : dm);
        const a = opts.respectAvail && store.agendaOf(o.id, d);
        if (a && a.c === 'm/' && code === dp) code = dm;
        if (a && a.c === '/p' && code === dm) code = dp;
      }
      const c = Object.assign({}, cur || {}, { s: code });
      ch.push({ key: o.id + '|' + d, val: c });
      if (code === morningT || code === dm) morning.push({ o, code, ref: c });
    }
    if (opts.rep !== 'no') {
      let pick = null;
      if (opts.rep === 'mat') pick = morning.find(x => x.code === morningT && x.ref) || morning.find(x => x.ref);
      else pick = morning.filter(x => x.ref).sort((a, b) => ((ytdRep[a.o.id] || 0) + (repCount[a.o.id] || 0) * 3) - ((ytdRep[b.o.id] || 0) + (repCount[b.o.id] || 0) * 3))[0];
      if (pick && repCodeOf(pick.code)) { pick.ref.s = repCodeOf(pick.code); repCount[pick.o.id] = (repCount[pick.o.id] || 0) + 1; }
    }
  }
  // punteggio finale leggibile
  const want = coverageWant(); const map = new Map(ch.map(c => [c.key, c.val]));
  let gaps = 0; for (const d of days) { const cov = { tm: 0, tp: 0, tn: 0 }; for (const o of store.ops()) { const c = map.get(o.id + '|' + d) || store.cell(o.id, d); const s = c && c.s ? shiftInfo(c.s) : null; if (s) for (const k of s.cnt || []) if (k in cov) cov[k]++; } for (const k of ['tm', 'tp', 'tn']) gaps += Math.max(0, want[k] - cov[k]); }
  const written = new Set(ch.map(c => c.key.split('|')[0]));
  const changedLines = p.turnisti.filter(op => written.has(op) && p.prevLine[op] != null && p.prevLine[op] !== lines[op]).length;
  const reps = Object.values(repCount); const repSpread = reps.length ? Math.max(...reps) - Math.min(...reps) : 0;
  return { changes: ch, lines, summary: { gaps, conflicts: conflicts.length, changedLines, repSpread }, conflicts };
}
