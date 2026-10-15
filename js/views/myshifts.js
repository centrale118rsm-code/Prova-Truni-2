// ═══════════════════════════════════════════════════════════════════════════
// I MIEI TURNI — una vista pensata per chi lavora a turni, non per chi li compila:
//  • Quadrante 24 ore: il turno di oggi e la reperibilità come archi su un orologio,
//    con la lancetta "adesso" e lo stato in tempo reale (in turno, libero, reperibile…)
//  • Radar: conto alla rovescia al prossimo turno, prossimo weekend libero,
//    la serie di giorni liberi più lunga in arrivo, ore della settimana
//  • Nastro della settimana: ogni giorno è una striscia di 24 ore con i turni
//    disegnati all'ora vera (le notti attraversano la mezzanotte), la reperibilità
//    tratteggiata e — se vuoi — i turni di un collega in trasparenza per confrontarli
//  • Mosaico dell'anno: 365 tessere colorate per tipo di giornata
//  • Scheda del giorno con colleghi, reperibilità e azioni rapide
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, WD_LONG, today, addDays, fmtDate, hm, dow, mondayOf, pad, yearOf, monthIdx, rangeDays, daysBetween } from '../util.js';
import { ic, modal, toast, avatar, opChip, cap1 } from '../ui.js';
import { shiftInfo, absInfo, repOf, repBands, workedMin, creditMin, weeks, hasRep, isSmontoCode, yearStats } from '../calc.js';
import { exportICS, statusPill } from './me.js';
import { chipFor } from '../ui.js';

// Categorie della giornata, con una palette propria (non quella del foglio)
const CAT = {
  mattina:    { label: 'Mattina',     c: '#F5A524', soft: '#FEF3C7', icon: 'wb_sunny' },
  pomeriggio: { label: 'Pomeriggio',  c: '#EF6F51', soft: '#FFE4DC', icon: 'wb_twilight' },
  notte:      { label: 'Notte',       c: '#4F46E5', soft: '#E0E7FF', icon: 'dark_mode' },
  smonto:     { label: 'Smonto',      c: '#8B5CF6', soft: '#EDE9FE', icon: 'bedtime' },
  riposo:     { label: 'Riposo',      c: '#10B981', soft: '#D1FAE5', icon: 'spa' },
  ferie:      { label: 'Ferie',       c: '#0EA5E9', soft: '#E0F2FE', icon: 'beach_access' },
  malattia:   { label: 'Malattia',    c: '#F43F5E', soft: '#FFE4E6', icon: 'healing' },
  assenza:    { label: 'Assenza',     c: '#64748B', soft: '#F1F5F9', icon: 'event_busy' },
  rep:        { label: 'Solo reperibilità', c: '#DB2777', soft: '#FCE7F3', icon: 'phone_in_talk' },
  vuoto:      { label: 'Nessun turno', c: '#CBD5E1', soft: 'transparent', icon: 'remove' }
};
export function catOf(c) {
  if (!c || (!c.s && !c.a && !c.ph)) return 'vuoto';
  if (c.a && (!c.s || /^r/i.test(c.s.trim()))) {
    const k = absInfo(c.a).kind; return k === 'ferie' || k === 'ferieAP' ? 'ferie' : k === 'mal' ? 'malattia' : 'assenza';
  }
  const s = c.s ? shiftInfo(c.s) : null; const code = (c.s || '').trim();
  if (!s) return 'vuoto';
  if (isSmontoCode(code)) return 'smonto';
  if (s.group === 'R') return 'riposo';
  if (s.group === 'X') return 'rep';
  const cnt = s.cnt || [];
  if (cnt.includes('tn') && !cnt.includes('tm') && !cnt.includes('dm')) return 'notte';
  if (cnt.includes('tp') || cnt.includes('dp')) return 'pomeriggio';
  if (cnt.includes('tm') || cnt.includes('dm')) return 'mattina';
  return s.from && +s.from.slice(0, 2) >= 12 ? 'pomeriggio' : 'mattina';
}
const toM = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
// Segmenti orari di un giorno: turno e fasce di reperibilità
function segments(op, d) {
  const out = []; const c = store.cell(op, d);
  if (c && c.s) { const s = shiftInfo(c.s); if (s && s.from && s.to && s.min > 0) out.push({ kind: 'shift', from: toM(s.from), to: toM(s.to) || 1440, cat: catOf(c), code: c.s.trim() }); }
  const bands = repBands(); repOf(d).forEach((x, i) => { if (x === op) out.push({ kind: 'rep', from: toM(bands[i].from), to: toM(bands[i].to) || 1440 }); });
  return out;
}
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

// Stato in questo momento
function liveStatus(op) {
  const d = today(), t = nowMin();
  const segs = segments(op, d);
  const cur = segs.find(s => s.kind === 'shift' && s.from <= t && t < s.to);
  const rep = segs.find(s => s.kind === 'rep' && s.from <= t && t < s.to);
  // prossimo inizio turno
  let next = null;
  for (let k = 0; k < 40 && !next; k++) { const dd = addDays(d, k); for (const s of segments(op, dd)) if (s.kind === 'shift' && (k > 0 || s.from > t)) { next = { d: dd, s, at: k * 1440 + s.from - t }; break; } }
  const c = store.cell(op, d);
  if (cur) return { tone: 'work', title: `In turno · ${cur.code}`, sub: `finisce alle ${hmClock(cur.to)} · mancano ${dur(cur.to - t)}`, progress: (t - cur.from) / (cur.to - cur.from), cat: cur.cat, next, rep };
  if (rep) return { tone: 'rep', title: 'Reperibile', sub: `fino alle ${hmClock(rep.to)} · tieni il telefono a portata`, cat: 'rep', next, rep };
  if (c && c.a && !c.s) return { tone: 'off', title: absInfo(c.a).label, sub: next ? `si riparte ${relDay(next.d)} con ${next.s.code}` : '', cat: catOf(c), next };
  return { tone: 'off', title: 'Libero', sub: next ? `prossimo turno ${next.s.code} ${relDay(next.d)} alle ${hmClock(next.s.from)}` : 'nessun turno in programma', cat: 'riposo', next };
}
const hmClock = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
function dur(m) { m = Math.max(0, Math.round(m)); const g = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60; return g ? `${g} g ${h} h` : h ? `${h} h ${pad(mm)} min` : `${mm} min`; }
function relDay(d) { const n = daysBetween(today(), d); return n === 0 ? 'oggi' : n === 1 ? 'domani' : n === 2 ? 'dopodomani' : `${WD_LONG[dow(d)]} ${+d.slice(8)}`; }

// Il quadrante: 24 ore in cerchio, mezzanotte in alto
function dial(op, d, size = 260) {
  const R = size / 2 - 22, cx = size / 2, cy = size / 2;
  const pt = (m, r) => { const a = (m / 1440) * 2 * Math.PI - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const arc = (from, to, r, color, w, dash = '') => { if (to <= from) return ''; const [x0, y0] = pt(from, r), [x1, y1] = pt(Math.min(to, 1439.9), r); const large = to - from > 720 ? 1 : 0; return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`; };
  let g = `<circle cx="${cx}" cy="${cy}" r="${R}" stroke="var(--ms-track)" stroke-width="18" fill="none"/>`;
  // notte e giorno sullo sfondo
  g += arc(0, 360, R, 'var(--ms-night)', 18) + arc(1200, 1440, R, 'var(--ms-night)', 18);
  for (let h = 0; h < 24; h++) { const [x0, y0] = pt(h * 60, R - 15), [x1, y1] = pt(h * 60, R - (h % 6 ? 19 : 25)); g += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="var(--faint)" stroke-width="${h % 6 ? 1 : 2}"/>`; if (h % 6 === 0) { const [tx, ty] = pt(h * 60, R - 36); g += `<text x="${tx}" y="${ty + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--muted)">${pad(h)}</text>`; } }
  for (const s of segments(op, d)) {
    if (s.kind === 'shift') g += arc(s.from, s.to, R, CAT[s.cat].c, 18);
    else g += arc(s.from, s.to, R + 14, CAT.rep.c, 5, '2 5');
  }
  if (d === today()) { const t = nowMin(); const [x, y] = pt(t, R + 14); const [xi, yi] = pt(t, R - 30); g += `<line x1="${xi}" y1="${yi}" x2="${x}" y2="${y}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="5" fill="var(--ink)"/>`; }
  return `<svg viewBox="0 0 ${size} ${size}" width="100%" style="max-width:${size}px">${g}</svg>`;
}

export function myShifts(el, params, ctx) {
  let op = params.op || store.me;
  if (!op || !store.op(op)) {
    el.innerHTML = `<div class="page"><div class="card"><div class="empty">${ic('person_search')}<div style="font-weight:700;color:var(--ink);margin:6px 0">Di chi vuoi vedere i turni?</div><div class="row wrap" style="justify-content:center;margin-top:12px">${store.ops().map(o => `<button class="btn" data-op="${o.id}">${avatar(o.id)} ${esc(o.name)} ${esc(cap1(o.surname))}</button>`).join('')}</div></div></div></div>`;
    el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { if (!store.isManager()) store.setMe(b.dataset.op); ctx.go('turni', { op: b.dataset.op }); });
    return;
  }
  const o = store.op(op); const Y = store.config.year;
  let wk = mondayOf(today()); let mate = ''; let timer = null;
  ctx.setTitle(op === store.me ? 'I miei turni' : `Turni di ${o.name} ${cap1(o.surname)}`, 'adesso, questa settimana, tutto l’anno');

  const draw = () => {
    const st = liveStatus(op); const tm = today();
    const weeksArr = weeks(op, Y); const curW = weeksArr.find(x => x.monday <= tm && x.sunday >= tm);
    const radar = insights(op);
    el.innerHTML = `<div class="page ms-page">
      <section class="ms-now ms-${st.tone}">
        <div class="ms-dial">${dial(op, tm)}<div class="ms-dial-c"><div class="ms-clock" id="ms-clock">${hmClock(nowMin())}</div><div class="ms-dial-d">${esc(WD[dow(tm)])} ${+tm.slice(8)} ${esc(MONTHS[monthIdx(tm)].slice(0, 3).toLowerCase())}</div></div></div>
        <div class="ms-now-txt">
          <div class="ms-who">${avatar(op)}<span>${esc(o.name)} ${esc(cap1(o.surname))}</span>${store.isManager() ? `<select class="inp sm" id="ms-op" style="width:auto">${store.ops().map(x => `<option value="${x.id}" ${x.id === op ? 'selected' : ''}>${esc(cap1(x.surname))}</option>`).join('')}</select>` : ''}</div>
          <div class="ms-state"><span class="ms-dot" style="background:${CAT[st.cat].c}"></span>${esc(st.title)}</div>
          <div class="ms-sub">${esc(st.sub)}</div>
          ${st.progress != null ? `<div class="ms-prog"><i style="width:${Math.round(st.progress * 100)}%;background:${CAT[st.cat].c}"></i></div>` : ''}
          ${st.next ? `<div class="ms-count"><div><span class="ms-big" id="ms-cd">${dur(st.next.at)}</span><span class="ms-cap">al prossimo turno · <b>${esc(st.next.s.code)}</b> ${esc(relDay(st.next.d))} ${hmClock(st.next.s.from)}–${hmClock(st.next.s.to)}</span></div></div>` : ''}
          <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn" id="ms-ics">${ic('event_upcoming')}Sincronizza col telefono</button><button class="btn" id="ms-req">${ic('swap_horiz')}Chiedi un cambio</button></div>
        </div>
      </section>

      <section class="ms-radar">${radar.map(r => `<div class="ms-r" style="--c:${r.c}"><span class="ms ms-r-i">${r.icon}</span><div><div class="ms-r-v">${r.v}</div><div class="ms-r-l">${esc(r.l)}</div></div></div>`).join('')}</section>

      ${numbers(op)}
      <section class="card ms-week">
        <div class="ms-week-h"><div><h3>La settimana in ore</h3><div class="small muted">${esc(fmtDate(wk))} → ${esc(fmtDate(addDays(wk, 6)))}${curW && wk === curW.monday ? ` · ${hm(curW.total)} su ${hm(o.weeklyMin || store.profile.weeklyMin)}` : ''}</div></div>
          <div class="row wrap" style="gap:6px"><select class="inp sm" id="ms-mate" style="width:auto"><option value="">Confronta con…</option>${store.ops().filter(x => x.id !== op).map(x => `<option value="${x.id}" ${mate === x.id ? 'selected' : ''}>${esc(x.name)} ${esc(cap1(x.surname))}</option>`).join('')}</select>
          <button class="ibtn" data-w="-7">${ic('chevron_left')}</button><button class="btn sm" data-w="0">Oggi</button><button class="ibtn" data-w="7">${ic('chevron_right')}</button></div></div>
        <div class="ms-ruler"><span></span>${[0, 3, 6, 9, 12, 15, 18, 21].map(h => `<i style="left:${h / 24 * 100}%">${pad(h)}</i>`).join('')}</div>
        <div class="ms-rows" id="ms-rows">${Array.from({ length: 7 }, (_, i) => weekRow(op, addDays(wk, i), mate)).join('')}</div>
        <div class="ms-leg">${['mattina', 'pomeriggio', 'notte', 'smonto'].map(k => `<span><i style="background:${CAT[k].c}"></i>${CAT[k].label}</span>`).join('')}<span><i class="ms-rep-i"></i>Reperibilità</span>${mate ? `<span><i style="background:transparent;border:2px dashed var(--muted)"></i>${esc(cap1(store.op(mate).surname))}</span>` : ''}</div>
      </section>

      ${todayAndRequests(op)}
      <section class="card ms-year">
        <div class="ms-week-h"><div><h3>Il tuo ${Y} a mosaico</h3><div class="small muted">Ogni tessera è un giorno: tocca per i dettagli</div></div></div>
        <div class="ms-mosaic-wrap">${mosaic(op, Y)}</div>
        <div class="ms-leg">${Object.entries(CAT).filter(([k]) => k !== 'vuoto').map(([k, v]) => `<span><i style="background:${v.c}"></i>${v.label} <b>${countCat(op, Y, k)}</b></span>`).join('')}</div>
      </section>
    </div>`;
    const sel = el.querySelector('#ms-op'); if (sel) sel.onchange = () => ctx.go('turni', { op: sel.value });
    el.querySelector('#ms-ics').onclick = () => exportICS(op);
    el.querySelector('#ms-req').onclick = () => ctx.go('richieste', { new: 1 });
    el.querySelector('#ms-mate').onchange = e => { mate = e.target.value; draw(); };
    el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { wk = +b.dataset.w === 0 ? mondayOf(today()) : addDays(wk, +b.dataset.w); draw(); });
    el.querySelectorAll('[data-day]').forEach(b => b.onclick = () => daySheet(op, b.dataset.day, ctx));
    // scorrimento a sinistra/destra sul nastro per cambiare settimana
    const rows = el.querySelector('#ms-rows'); let x0 = null;
    rows.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    rows.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) { wk = addDays(wk, dx < 0 ? 7 : -7); draw(); } x0 = null; });
  };
  draw();
  // orologio e conto alla rovescia vivi
  timer = setInterval(() => { const c = el.querySelector('#ms-clock'); if (!c) return; c.textContent = hmClock(nowMin()); if (new Date().getSeconds() < 30 && new Date().getMinutes() % 5 === 0) draw(); }, 30000);
  const off = store.on(w => { if (w === 'cells' || w === 'config') draw(); });
  return () => { clearInterval(timer); off(); };
}

function weekRow(op, d, mate) {
  const c = store.cell(op, d); const cat = catOf(c); const tm = today();
  const segs = segments(op, d); const mseg = mate ? segments(mate, d).filter(s => s.kind === 'shift') : [];
  const bars = segs.map(s => s.kind === 'shift'
    ? `<b class="ms-bar" style="left:${s.from / 14.4}%;width:${(s.to - s.from) / 14.4}%;background:${CAT[s.cat].c}"><span>${esc(s.code)} · ${hmClock(s.from)}–${hmClock(s.to)}</span></b>`
    : `<b class="ms-repbar" style="left:${s.from / 14.4}%;width:${(s.to - s.from) / 14.4}%"></b>`).join('');
  const ghost = mseg.map(s => `<b class="ms-ghost" style="left:${s.from / 14.4}%;width:${(s.to - s.from) / 14.4}%;border-color:${CAT[s.cat].c}"></b>`).join('');
  const overlap = mseg.some(m => segs.some(s => s.kind === 'shift' && s.from < m.to && m.from < s.to));
  const allDay = !segs.some(s => s.kind === 'shift') && cat !== 'vuoto' ? `<b class="ms-allday" style="background:${CAT[cat].soft};color:${CAT[cat].c}">${ic(CAT[cat].icon)}${esc(c && c.a ? absInfo(c.a).label : CAT[cat].label)}</b>` : '';
  const now = d === tm ? `<i class="ms-now-line" style="left:${nowMin() / 14.4}%"></i>` : '';
  return `<button class="ms-row ${d === tm ? 'is-today' : ''} ${store.isFestivo(d) ? 'is-fest' : ''}" data-day="${d}">
    <span class="ms-day"><b>${WD[dow(d)]}</b><span>${+d.slice(8)}</span></span>
    <span class="ms-track">${[6, 12, 18].map(h => `<i class="ms-grid" style="left:${h / 24 * 100}%"></i>`).join('')}${allDay}${bars}${ghost}${now}</span>
    <span class="ms-tail">${mate ? (overlap ? `<span class="pill acc" title="In turno insieme">${ic('group')}</span>` : '') : (hasRep(c) ? `<span class="pill" style="background:#FCE7F3;color:#DB2777">REP</span>` : '')}<span class="small muted">${workedMin(c) + creditMin(c, d) ? hm(workedMin(c) + creditMin(c, d)) : ''}</span></span></button>`;
}

function mosaic(op, Y) {
  const start = mondayOf(`${Y}-01-01`), end = `${Y}-12-31`;
  const cols = Math.ceil((daysBetween(start, end) + 1) / 7);
  let monthsHead = '', grid = '';
  for (let w = 0; w < cols; w++) {
    const m0 = addDays(start, w * 7);
    const firstOfMonth = rangeDays(m0, addDays(m0, 6)).find(d => d.endsWith('-01') && d.startsWith(String(Y)));
    monthsHead += `<span>${firstOfMonth ? MONTHS[monthIdx(firstOfMonth)].slice(0, 3) : ''}</span>`;
    let col = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(m0, i);
      if (d < `${Y}-01-01` || d > end) { col += '<i class="ms-t ms-t-out"></i>'; continue; }
      const c = store.cell(op, d); const k = catOf(c);
      col += `<i class="ms-t ${d === today() ? 'ms-t-today' : ''}" data-day="${d}" title="${esc(fmtDate(d, { wd: true }))}: ${esc(c ? (c.s || (c.a ? absInfo(c.a).label : '')) : '—')}" style="background:${k === 'vuoto' ? 'var(--bg-2)' : CAT[k].c};${hasRep(c) ? 'box-shadow:inset 0 0 0 2px #DB2777' : ''}"></i>`;
    }
    grid += `<div class="ms-col">${col}</div>`;
  }
  return `<div class="ms-mosaic"><div class="ms-mhead" style="grid-template-columns:repeat(${cols},1fr)">${monthsHead}</div><div class="ms-mbody"><div class="ms-wd">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div><div class="ms-grid-y" style="grid-template-columns:repeat(${cols},1fr)">${grid}</div></div></div>`;
}
function countCat(op, Y, k) { let n = 0; for (const d of rangeDays(`${Y}-01-01`, `${Y}-12-31`)) if (catOf(store.cell(op, d)) === k) n++; return n; }

// Suggerimenti calcolati sui turni futuri
function insights(op) {
  const tm = today(); const out = [];
  const isFree = d => !workedMin(store.cell(op, d));
  // prossimo weekend completamente libero
  let wkd = null; for (let d = tm, k = 0; k < 120; d = addDays(d, 1), k++) if (dow(d) === 6 && isFree(d) && isFree(addDays(d, 1))) { wkd = d; break; }
  out.push({ icon: 'weekend', l: 'Prossimo weekend libero', v: wkd ? `${+wkd.slice(8)}-${+addDays(wkd, 1).slice(8)} ${MONTHS[monthIdx(wkd)].slice(0, 3).toLowerCase()}` : '—', c: '#10B981' });
  // serie di giorni liberi più lunga nei prossimi 60 giorni
  let best = { n: 0, d: null }, run = 0, rs = null;
  for (let d = tm, k = 0; k < 60; d = addDays(d, 1), k++) { if (isFree(d)) { if (!run) rs = d; run++; if (run > best.n) best = { n: run, d: rs }; } else run = 0; }
  out.push({ icon: 'hiking', l: best.d ? `Più giorni liberi di fila, dal ${+best.d.slice(8)}/${+best.d.slice(5, 7)}` : 'Più giorni liberi di fila', v: best.n ? `${best.n} giorn${best.n === 1 ? 'o' : 'i'}` : '—', c: '#0EA5E9' });
  // notti nei prossimi 30 giorni
  let nights = 0, reps = 0; for (let d = tm, k = 0; k < 30; d = addDays(d, 1), k++) { const c = store.cell(op, d); if (catOf(c) === 'notte') nights++; if (hasRep(c)) reps++; }
  out.push({ icon: 'dark_mode', l: 'Notti nei prossimi 30 giorni', v: nights, c: '#4F46E5' });
  out.push({ icon: 'phone_in_talk', l: 'Reperibilità nei prossimi 30 giorni', v: reps, c: '#DB2777' });
  // saldo ore
  const w = weeks(op, store.config.year); const last = [...w].reverse().find(x => x.sunday < tm);
  return out;
}

function daySheet(op, d, ctx) {
  const c = store.cell(op, d); const k = catOf(c); const s = c && c.s ? shiftInfo(c.s) : null; const bands = repBands(); const r = repOf(d);
  const mates = store.ops().filter(x => x.id !== op).map(x => ({ x, c: store.cell(x.id, d) })).filter(z => z.c && z.c.s && workedMin(z.c) > 0)
    .map(z => ({ ...z, cat: catOf(z.c) }));
  const same = mates.filter(z => z.cat === k);
  const m = modal({
    title: fmtDate(d, { wd: true, year: true }), icon: CAT[k].icon,
    body: `<div class="col" style="gap:14px">
      <div class="ms-sheet-top" style="background:${CAT[k].soft};border-color:${CAT[k].c}"><div class="ms-sheet-dial">${dial(op, d, 150)}</div><div><div style="font-size:26px;font-weight:800;color:${CAT[k].c}">${esc(c && c.s ? c.s : CAT[k].label)}</div><div class="small" style="color:var(--ink-2)">${s && s.from ? `${s.from} – ${s.to} · ${hm(s.min)} ore` : (c && c.a ? esc(absInfo(c.a).label) : '')}${store.isFestivo(d) ? ' · festivo' : ''}</div>${c && c.n ? `<div class="small mt">${ic('sticky_note_2')} ${esc(c.n)}</div>` : ''}</div></div>
      <div><div class="sec-t" style="margin:0 0 8px">Reperibilità del giorno</div><div class="ms-bands">${bands.map((b, i) => `<div class="${r[i] === op ? 'me' : ''}"><small>${b.from}–${b.to === '24:00' ? '24' : b.to}</small><b>${esc(store.opName(r[i], true) || '—')}</b></div>`).join('')}</div></div>
      <div><div class="sec-t" style="margin:0 0 8px">${same.length ? 'Nella tua stessa fascia' : 'Colleghi in servizio'}</div><div class="col" style="gap:6px">${(same.length ? same : mates).map(z => `<div class="row">${avatar(z.x.id)}<span class="grow"><b>${esc(z.x.name)} ${esc(cap1(z.x.surname))}</b><div class="small muted">${esc(z.c.s)}${z.x.phone ? ' · ' + esc(z.x.phone) : ''}</div></span>${z.x.phone ? `<a class="ibtn" href="tel:${esc(z.x.phone)}" title="Chiama">${ic('call')}</a>` : ''}</div>`).join('') || '<span class="muted">nessuno</span>'}</div></div>
      ${op === store.me ? `<div class="row wrap"><button class="btn" data-a="cambio">${ic('swap_horiz')}Cambio turno</button><button class="btn" data-a="perm">${ic('event_available')}Permesso</button><button class="btn" data-a="nota">${ic('edit_note')}Nota personale</button></div>` : ''}</div>`
  });
  m.body.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    m.close();
    if (b.dataset.a === 'nota') { const { promptBox } = await import('../ui.js'); const cur = store.agendaOf(op, d) || {}; const v = await promptBox('Nota personale · ' + fmtDate(d), { value: cur.n || '', textarea: true }); if (v != null) { await store.setAgenda(op, d, Object.assign({}, cur, { n: v.trim() || undefined })); toast('Nota salvata'); } return; }
    ctx.go('richieste', { new: 1, d });
  });
}

// ── I miei numeri: saldo, settimana, ferie, permessi, reperibilità, festivi ──
function numbers(op) {
  const o = store.op(op); const tm = today(); const st = yearStats(op, store.config.year);
  const w = weeks(op, store.config.year); const cur = w.find(x => x.monday <= tm && x.sunday >= tm); const last = [...w].reverse().find(x => x.sunday < tm);
  const bal = last ? last.balance : (o.initBalance || 0);
  const tiles = [
    ['Saldo ore', hm(bal, { plus: true }), last ? `al ${fmtDate(last.sunday)}` : 'iniziale', bal >= 0 ? '#10B981' : '#F43F5E', 'account_balance', 'conteggi/ore'],
    ['Questa settimana', cur ? hm(cur.total) : '—', `su ${hm(o.weeklyMin || store.profile.weeklyMin)}`, '#3B82F6', 'date_range', 'conteggi/ore'],
    ['Ferie rimaste', st.ferieRestanti, `su ${st.ferieSpettanti}${st.ferieAPRestanti != null && st.ferieAP ? ` · residuo ${st.ferieAPRestanti}` : ''}`, '#EAB308', 'beach_access', 'conteggi/ferie'],
    ['Permessi', `${st.permGgRestanti} gg · ${st.permOreRestanti} h`, `pn usati ${st.pn}`, '#22C55E', 'event_available', 'conteggi/ferie'],
    ['Reperibilità', st.rep, `${hm(st.repMin)} ore nell’anno`, '#DB2777', 'phone_in_talk', 'conteggi/reperibilita'],
    ['Festivi lavorati', st.festLav, `non goduti ${st.fng}`, '#06B6D4', 'celebration', 'conteggi/festivi']
  ];
  return `<section class="ms-nums">${tiles.map(([l, v, sub, c, icon, link]) => `<a class="ms-num" href="#/${link}" style="--c:${c}"><span class="ms">${icon}</span><span class="ms-num-l">${esc(l)}</span><b>${esc(String(v))}</b><small>${esc(sub)}</small></a>`).join('')}</section>`;
}
// ── Oggi in servizio con me + le mie richieste ──
function todayAndRequests(op) {
  const tm = today(); const c = store.cell(op, tm);
  const mates = c && c.s && workedMin(c) ? store.ops().filter(x => x.id !== op).map(x => ({ x, c: store.cell(x.id, tm) })).filter(z => z.c && z.c.s && workedMin(z.c) > 0 && catOf(z.c) === catOf(c)) : [];
  const reqs = Object.values(store.requests).filter(r => r.op === op && r.type !== 'offerta').sort((a, b) => b.ts - a.ts).slice(0, 4);
  return `<section class="grid g2">
    <div class="card"><div class="card-h"><span class="ms ico">groups</span><h3>Oggi nel tuo turno</h3></div><div class="card-b flush">${mates.length ? mates.map(z => `<div class="list-i">${avatar(z.x.id)}<span class="grow"><b>${esc((z.x.name ? z.x.name + ' ' : '') + cap1(z.x.surname))}</b>${z.x.phone ? `<div class="small muted">${esc(z.x.phone)}</div>` : ''}</span>${chipFor(z.c, tm)}${z.x.phone ? `<a class="ibtn" href="tel:${esc(z.x.phone)}" title="Chiama">${ic('call')}</a>` : ''}</div>`).join('') : `<div class="empty" style="padding:18px">${ic('weekend')}${c && c.s && workedMin(c) ? 'Nessun collega nella tua fascia' : 'Oggi non sei in turno'}</div>`}</div></div>
    <div class="card"><div class="card-h"><span class="ms ico">assignment</span><h3 class="grow">Le mie richieste</h3><a class="btn sm ghost" href="#/richieste/mie">Tutte</a></div><div class="card-b flush">${reqs.length ? reqs.map(r => `<div class="list-i"><span class="grow"><b>${esc(r.title || r.type)}</b><div class="small muted">${esc(r.from ? fmtDate(r.from) : '')}${r.to && r.to !== r.from ? ' → ' + esc(fmtDate(r.to)) : ''}</div></span>${statusPill(r.status)}</div>`).join('') : `<div class="empty" style="padding:18px">${ic('inbox')}Nessuna richiesta</div>`}</div></div>
  </section>`;
}
