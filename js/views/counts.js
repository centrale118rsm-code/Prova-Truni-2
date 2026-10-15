// ═══════════════════════════════════════════════════════════════════════════
// CONTEGGI — i fogli di calcolo del file Excel:
//   Ore e saldi        → CONTEGGI ORARI (36 ore settimanali, saldo che si trascina)
//   Ferie e permessi   → righe 2-5 del foglio TURNI + legenda assenze
//   Reperibilità       → TRASPOSIZIONE REP, CONTEGGI ORE REP, quadro mensile ISS
//   Festivi            → tabella FESTIVI (lavorati, ore, non goduti, non lavorati, "R")
//   Statistiche        → GRAFICO TURNI (turno / diurno / casa) ed equità
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, today, addDays, fmtDate, fmtShort, hm, monthDays, dow, download, yearOf, monthIdx, rangeDays, holidaysSM, contrast } from '../util.js';
import { ic, modal, toast, confirmBox, promptBox, chipFor, opChip, avatar, cap1, shiftStyle, absStyle, barChart, donut } from '../ui.js';
import { shiftInfo, absInfo, absList, weeks, monthHours, yearStats, repOf, repBands, repDayHours, repIsOverride, workedMin, creditMin, equity, hasRep, isRest } from '../calc.js';
import { kpi } from './me.js';

const Y = () => store.config.year;
const opSelect = (cur, all = true) => `<select class="inp" id="op-sel" style="width:auto;min-width:200px">${all ? `<option value="__all" ${cur === '__all' ? 'selected' : ''}>Tutti gli operatori</option>` : ''}${store.ops().map(o => `<option value="${o.id}" ${cur === o.id ? 'selected' : ''}>${esc(o.name)} ${esc(cap1(o.surname))}</option>`).join('')}</select>`;
const monthSelect = (cur, id = 'mo-sel') => `<select class="inp" id="${id}" style="width:auto">${MONTHS.map((m, i) => `<option value="${i}" ${cur === i ? 'selected' : ''}>${m} ${Y()}</option>`).join('')}<option value="12" ${cur === 12 ? 'selected' : ''}>Gennaio ${Y() + 1}</option></select>`;
const ymOf = mi => mi === 12 ? [Y() + 1, 0] : [Y(), mi];
const curMonth = () => yearOf(today()) === Y() ? monthIdx(today()) : 0;
const letter = c => { if (!c) return ''; if (c.a && !c.s) return '-'; if (!c.s) return ''; const s = c.s.trim(); return ({ POM: 'P', MAT: 'M', 'MAT/R': 'M/R', NOTT: 'N', SM: 'S', R: 'R', matt: 'm', pome: 'p', 'matt/R': 'm/R', ripo: 'r', 'MAT+N': 'M+N', '/R': '/R' })[s] || s; };
function csv(rows) { return rows.map(r => r.map(v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n'); }

// ══ ORE E SALDI ══════════════════════════════════════════════════════════
export function hours(el, params, ctx) {
  let op = params.op || store.me || '__all'; let mode = params.v || (op === '__all' ? 'foglio' : 'settimane'); let mi = curMonth();
  const draw = () => {
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Ore e saldi</h2><p>Ore lavorate più ore accreditate (assenze, permessi) a confronto con le ${hm(store.profile.weeklyMin)} ore settimanali; il saldo si trascina di settimana in settimana, come nel foglio CONTEGGI ORARI.</p></div>
      <div class="acts">${opSelect(op)}<div class="seg" id="mode">${[['settimane', 'Settimane'], ['mesi', 'Mesi'], ['foglio', 'Vista foglio'], ['riepilogo', 'Riepilogo']].map(([k, l]) => `<button data-v="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div><button class="btn" id="csv">${ic('download')}CSV</button></div></div><div id="body"></div></div>`;
    el.querySelector('#op-sel').onchange = e => { op = e.target.value; if (op === '__all' && (mode === 'settimane' || mode === 'mesi')) mode = 'riepilogo'; if (op !== '__all' && mode === 'riepilogo') mode = 'settimane'; draw(); };
    el.querySelectorAll('#mode button').forEach(b => b.onclick = () => { mode = b.dataset.v; if ((mode === 'settimane' || mode === 'mesi') && op === '__all') op = store.me || store.ops()[0].id; draw(); });
    const body = el.querySelector('#body');
    if (mode === 'settimane') body.innerHTML = weekView(op);
    if (mode === 'mesi') body.innerHTML = monthView(op);
    if (mode === 'riepilogo') body.innerHTML = summaryView();
    if (mode === 'foglio') { body.innerHTML = `<div class="row mb">${monthSelect(mi)}<span class="small muted">Per ogni operatore: turno · ore · ore accreditate · saldo settimanale (alla domenica)</span></div><div id="sheet"></div>`; body.querySelector('#mo-sel').onchange = e => { mi = +e.target.value; body.querySelector('#sheet').innerHTML = sheetView(mi); }; body.querySelector('#sheet').innerHTML = sheetView(mi); }
    el.querySelector('#csv').onclick = () => exportHours(op, mode);
    body.querySelectorAll('[data-wk]').forEach(r => r.onclick = () => weekDetail(op, r.dataset.wk));
  };
  draw();
  return store.on(w => { if (w === 'cells' || w === 'config') draw(); });
}
function weekView(op) {
  const w = weeks(op); const tm = today(); const o = store.op(op);
  const last = [...w].reverse().find(x => x.sunday < tm) || w[0];
  const tot = w.reduce((a, x) => a + x.total, 0);
  return `<div class="grid g4 mb">${kpi('Saldo attuale', hm(last.balance, { plus: true }), `al ${fmtDate(last.sunday)}`, last.balance >= 0 ? 'var(--ok)' : 'var(--err)', 'account_balance')}${kpi('Saldo iniziale', hm(o.initBalance || 0, { plus: true }), 'riportato dall’anno prima', '#64748b', 'start')}${kpi('Ore nell’anno', hm(tot), `${w.length} settimane`, 'var(--accent)', 'schedule')}${kpi('Fine anno (proiezione)', hm(w[w.length - 1].balance, { plus: true }), 'con i turni già inseriti', '#7c3aed', 'trending_up')}</div>
  <div class="card"><div class="tbl-wrap" style="max-height:70vh"><table class="tbl"><thead><tr><th>Settimana</th>${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => `<th class="c">${d}</th>`).join('')}<th class="r">Lavorate</th><th class="r">Accreditate</th><th class="r">Totale</th><th class="r">Differenza</th><th class="r">Saldo</th></tr></thead><tbody>
  ${w.map(x => `<tr data-wk="${x.monday}" style="cursor:pointer;${x.monday <= tm && x.sunday >= tm ? 'background:var(--accent-soft)' : ''}"><td class="nowrap"><b>${fmtShort(x.monday)}</b> <span class="muted small">→ ${fmtShort(x.sunday)}</span></td>
    ${Array.from({ length: 7 }, (_, i) => { const d = addDays(x.monday, i); const c = store.cell(op, d); return `<td class="c" style="padding:4px">${d.slice(0, 4) == Y() ? chipFor(c, d) : '<span class="muted small">prec.</span>'}</td>`; }).join('')}
    <td class="r num">${hm(x.worked)}</td><td class="r num muted">${hm(x.credit)}</td><td class="r num b">${hm(x.total)}</td><td class="r num ${x.delta >= 0 ? 'pos' : 'neg'}">${hm(x.delta, { plus: true })}</td><td class="r num b ${x.balance >= 0 ? 'pos' : 'neg'}">${hm(x.balance, { plus: true })}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}
function weekDetail(op, monday) {
  const rows = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map(d => { const c = store.cell(op, d); const s = c && c.s ? shiftInfo(c.s) : null; return `<tr><td>${esc(fmtDate(d, { wd: true }))}</td><td>${chipFor(c, d)}</td><td class="small">${s && s.from ? s.from + '–' + s.to : ''}</td><td class="r num">${hm(workedMin(c))}</td><td class="r num">${hm(creditMin(c, d))}</td></tr>`; }).join('');
  modal({ title: `Settimana dal ${fmtDate(monday)}`, icon: 'date_range', size: 'wide', body: `<div class="card"><table class="tbl"><thead><tr><th>Giorno</th><th>Turno</th><th>Orario</th><th class="r">Ore</th><th class="r">Accreditate</th></tr></thead><tbody>${rows}</tbody></table></div>` });
}
function monthView(op) {
  const o = store.op(op); const months = Array.from({ length: 12 }, (_, m) => m);
  const data = months.map(m => { const h = monthHours(op, Y(), m); const days = monthDays(Y(), m); const exp = Math.round(days.length / 7 * (o.weeklyMin || store.profile.weeklyMin)); return Object.assign(h, { exp, m }); });
  return `<div class="card mb"><div class="card-h"><span class="ms ico">bar_chart</span><h3>Ore per mese</h3></div><div class="card-b">${barChart({ labels: months.map(m => MONTHS[m].slice(0, 3)), series: [{ name: 'Lavorate', values: data.map(d => Math.round(d.worked / 60)) }, { name: 'Accreditate', values: data.map(d => Math.round(d.credit / 60)) }], colors: ['#1f4bd8', '#f59e0b'], stacked: true })}</div></div>
  <div class="card"><table class="tbl"><thead><tr><th>Mese</th><th class="r">Lavorate</th><th class="r">Accreditate</th><th class="r">Totale</th><th class="r">Previste (proporzionali)</th><th class="r">Differenza</th></tr></thead><tbody>${data.map(d => `<tr><td><b>${MONTHS[d.m]}</b></td><td class="r num">${hm(d.worked)}</td><td class="r num">${hm(d.credit)}</td><td class="r num b">${hm(d.total)}</td><td class="r num muted">${hm(d.exp)}</td><td class="r num ${d.total - d.exp >= 0 ? 'pos' : 'neg'}">${hm(d.total - d.exp, { plus: true })}</td></tr>`).join('')}</tbody></table></div>`;
}
function summaryView() {
  const tm = today();
  const rows = store.ops().map(o => { const w = weeks(o.id); const last = [...w].reverse().find(x => x.sunday < tm) || w[0]; const cur = w.find(x => x.monday <= tm && x.sunday >= tm); return { o, last, cur, end: w[w.length - 1].balance, tot: w.reduce((a, x) => a + x.total, 0) }; });
  return `<div class="card"><table class="tbl"><thead><tr><th>Operatore</th><th class="r">Saldo iniziale</th><th class="r">Ore nell’anno</th><th class="r">Settimana in corso</th><th class="r">Saldo attuale</th><th class="r">Proiezione fine anno</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${opChip(r.o.id, { full: true })}</td><td class="r num">${hm(r.o.initBalance || 0, { plus: true })}</td><td class="r num">${hm(r.tot)}</td><td class="r num">${r.cur ? hm(r.cur.total) : '—'}</td><td class="r num b ${r.last.balance >= 0 ? 'pos' : 'neg'}">${hm(r.last.balance, { plus: true })}</td><td class="r num ${r.end >= 0 ? 'pos' : 'neg'}">${hm(r.end, { plus: true })}</td></tr>`).join('')}</tbody></table></div>`;
}
// Vista "come il foglio": righe = giorni del mese, colonne per operatore
function sheetView(mi) {
  const [y, m] = ymOf(mi); const days = monthDays(y, m); const ops = store.ops();
  const wk = {}; for (const o of ops) { wk[o.id] = {}; for (const x of weeks(o.id, y)) wk[o.id][x.sunday] = x; }
  const head = ops.map(o => `<th colspan="4" style="background:${o.color};color:#fff;text-align:center">${esc(o.surname)}</th>`).join('');
  const rows = days.map(d => {
    const w = dow(d); const fest = store.isFestivo(d);
    return `<tr style="${w === 0 ? 'border-bottom:2px solid #cc00ff' : ''}"><td style="background:${fest ? '#00ffff' : '#fff'};color:#00f;font-weight:700;text-align:center">${+d.slice(8)}</td><td style="background:${fest ? '#00ffff' : w === 0 ? '#ccff33' : '#ccccff'};color:#00f">${WD[w]}</td>
    ${ops.map(o => { const c = store.cell(o.id, d); const a = absStyle(c); const x = w === 0 ? wk[o.id][d] : null; const wm = workedMin(c), cr = creditMin(c, d);
      return `<td style="text-align:center;font-weight:700;${a ? `background:${a.bg};color:${a.fg}` : ''}">${esc(c && c.a ? a.t : '')}${c && c.ph ? c.ph : ''}</td><td style="text-align:center;font-weight:700">${esc(letter(c))}</td><td class="num" style="text-align:right;${cr ? 'background:#ffc000' : ''}">${wm ? hm(wm) : '0:00'}${cr ? `<br><b>${hm(cr)}</b>` : ''}</td><td class="num b" style="text-align:right;${x ? (x.balance >= 0 ? 'color:#00a040' : 'color:#e00') : ''}">${x ? `${hm(x.total)}<br>${hm(x.balance)}` : ''}</td>`; }).join('')}</tr>`;
  }).join('');
  return `<div class="card"><div class="tbl-wrap" style="max-height:72vh"><table class="tbl" style="font-size:12px;font-family:var(--font-sheet)"><thead><tr><th colspan="2">${MONTHS[m]}</th>${head}</tr><tr><th></th><th></th>${ops.map(() => '<th>ass.</th><th>turno</th><th class="r">ore</th><th class="r">sett./saldo</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function exportHours(op, mode) {
  const rows = [];
  if (op === '__all' || mode === 'riepilogo' || mode === 'foglio') {
    rows.push(['Operatore', 'Settimana (lunedì)', 'Lavorate', 'Accreditate', 'Totale', 'Differenza', 'Saldo']);
    for (const o of store.ops()) for (const w of weeks(o.id)) rows.push([`${o.surname} ${o.name}`, w.monday, hm(w.worked), hm(w.credit), hm(w.total), hm(w.delta), hm(w.balance)]);
  } else {
    rows.push(['Data', 'Giorno', 'Turno', 'Assenza', 'Ore lavorate', 'Ore accreditate']);
    for (const d of rangeDays(`${Y()}-01-01`, `${Y()}-12-31`)) { const c = store.cell(op, d); rows.push([d, WD[dow(d)], c && c.s || '', c && c.a || '', hm(workedMin(c)), hm(creditMin(c, d))]); }
  }
  download(`ore-${op === '__all' ? 'tutti' : op}-${Y()}.csv`, '﻿' + csv(rows), 'text/csv');
}

// ══ FERIE E PERMESSI ═════════════════════════════════════════════════════
export function leave(el, params, ctx) {
  let tab = params.t || 'saldi';
  const draw = () => {
    const rows = store.ops().map(o => ({ o, s: yearStats(o.id) }));
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Ferie e permessi</h2><p>Saldi calcolati come nel foglio TURNI: le ferie in un giorno di riposo non si contano, il residuo usato a gennaio dell’anno dopo scala dalle ferie dell’anno.</p></div>
      <div class="acts"><div class="tabs">${[['saldi', 'Saldi', 'account_balance_wallet'], ['assenze', 'Tutte le assenze', 'event_busy'], ['consigli', 'Quando prenderle', 'tips_and_updates']].map(([k, l, i]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${ic(i)}${l}</button>`).join('')}</div></div></div><div id="body"></div></div>`;
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const body = el.querySelector('#body');
    if (tab === 'saldi') body.innerHTML = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Operatore</th><th class="r">Ferie ${Y()}</th><th class="r">Usate</th><th class="r">Residuo usato a gen. ${Y() + 1}</th><th class="r">Rimaste</th><th class="r">Residuo ${Y() - 1}</th><th class="r">Usato</th><th class="r">Rimasto</th><th class="r">Permessi gg</th><th class="r">Usati</th><th class="r">di cui PN</th><th class="r">Rimasti</th><th class="r">Ore permesso</th><th class="r">Usate</th><th class="r">Rimaste</th></tr></thead><tbody>
      ${rows.map(({ o, s }) => `<tr data-op="${o.id}" style="cursor:pointer"><td>${opChip(o.id, { full: true })}</td><td class="r num">${s.ferieSpettanti}</td><td class="r num">${s.ferieUsate}</td><td class="r num">${s.vNext}</td><td class="r num b" style="background:${s.ferieRestanti < 0 ? 'var(--err-soft)' : s.ferieRestanti === 0 ? 'var(--ok-soft)' : '#ffff0040'}">${s.ferieRestanti}</td><td class="r num">${s.ferieAP}</td><td class="r num">${s.ferieAPUsate}</td><td class="r num b ${s.ferieAPRestanti < 0 ? 'neg' : ''}">${s.ferieAPRestanti}</td><td class="r num">${s.permGgSpettanti}</td><td class="r num">${s.permGg}</td><td class="r num">${s.pn}</td><td class="r num b ${s.permGgRestanti < 0 ? 'neg' : ''}">${s.permGgRestanti}</td><td class="r num">${s.permOreSpettanti}</td><td class="r num">${s.permOre}</td><td class="r num b ${s.permOreRestanti < 0 ? 'neg' : ''}">${s.permOreRestanti}</td></tr>`).join('')}
      </tbody></table></div></div><div class="small muted mt">Spettanze modificabili in Gestione → Operatori. Tocca una riga per il dettaglio dei giorni.</div>`;
    if (tab === 'assenze') {
      const codes = absList();
      body.innerHTML = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Operatore</th>${codes.map(a => `<th class="c" title="${esc(a.label)}"><b style="background:${a.bg};color:${a.fg};padding:1px 6px;border-radius:4px">${esc(a.code)}</b></th>`).join('')}<th class="c">Ore perm.</th><th class="c">Malattia</th></tr></thead><tbody>
        ${rows.map(({ o, s }) => `<tr data-op="${o.id}" style="cursor:pointer"><td>${opChip(o.id, { full: true })}</td>${codes.map(a => `<td class="c num">${s.absByCode[a.code] || ''}</td>`).join('')}<td class="c num">${s.permOre || ''}</td><td class="c num">${s.malattia || ''}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="xl-legend mt">${codes.map(a => `<span class="lg"><b style="background:${a.bg};color:${a.fg}">${esc(a.code)}</b>${esc(a.label)}</span>`).join('')}</div>`;
    }
    if (tab === 'consigli') body.innerHTML = advice();
    body.querySelectorAll('tr[data-op]').forEach(r => r.onclick = () => absDetail(r.dataset.op));
  };
  draw();
  return store.on(w => { if (w === 'cells' || w === 'config') draw(); });
}
function absDetail(op) {
  const o = store.op(op); const by = {};
  for (const d of rangeDays(`${Y()}-01-01`, `${Y() + 1}-01-31`)) { const c = store.cell(op, d); if (c && (c.a || c.ph)) { const k = c.a || 'ore'; (by[k] = by[k] || []).push({ d, c }); } }
  modal({
    title: `Assenze di ${o.name} ${cap1(o.surname)}`, icon: 'event_busy', size: 'wide',
    body: Object.keys(by).length ? Object.entries(by).map(([k, list]) => { const a = k === 'ore' ? { code: 'h', label: 'Permesso a ore', bg: '#00B0F0', fg: '#fff' } : absInfo(k); return `<div class="sec-t" style="margin-top:10px"><b style="background:${a.bg};color:${a.fg};padding:1px 7px;border-radius:4px">${esc(a.code)}</b> ${esc(a.label)} · ${list.length}</div><div class="row wrap" style="gap:6px">${list.map(x => `<span class="pill" title="${x.c.s ? 'turno: ' + esc(x.c.s) : ''}">${esc(fmtShort(x.d))}${x.c.ph ? ' · ' + x.c.ph + 'h' : ''}${isRest(x.c) ? ' (riposo)' : ''}</span>`).join('')}</div>`; }).join('') : `<div class="empty">${ic('beach_access')}Nessuna assenza</div>`
  });
}
// Settimane consigliate: meno colleghi assenti, ponti con i festivi
function advice() {
  const start = today() > `${Y()}-01-01` ? today() : `${Y()}-01-01`;
  const out = []; let m = start; while (dow(m) !== 1) m = addDays(m, 1);
  for (; m <= `${Y()}-12-31`; m = addDays(m, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(m, i));
    const absent = store.ops().filter(o => days.some(d => { const c = store.cell(o.id, d); return c && c.a && ['ferie', 'ferieAP', 'perm', 'rec'].includes(absInfo(c.a).kind); })).length;
    const fest = days.filter(d => store.isFestivo(d) && dow(d) !== 0).length;
    out.push({ m, absent, fest });
  }
  const bridges = [];
  for (const h of store.config.festivi.filter(d => d >= start && d.startsWith(String(Y())))) {
    const w = dow(h);
    if (w === 2) bridges.push({ d: addDays(h, -1), why: `ponte con ${fmtDate(h, { wd: true })}` });
    if (w === 4) bridges.push({ d: addDays(h, 1), why: `ponte con ${fmtDate(h, { wd: true })}` });
  }
  const best = [...out].sort((a, b) => a.absent - b.absent || b.fest - a.fest).slice(0, 10).sort((a, b) => a.m < b.m ? -1 : 1);
  return `<div class="grid g2"><div class="card"><div class="card-h"><span class="ms ico">thumb_up</span><h3>Settimane più libere</h3></div><div class="card-b flush">${best.map(x => `<div class="list-i"><span class="grow"><b>${fmtDate(x.m)} → ${fmtDate(addDays(x.m, 6))}</b>${x.fest ? `<div class="small" style="color:#0891b2">${x.fest} festiv${x.fest > 1 ? 'i' : 'o'} infrasettimanal${x.fest > 1 ? 'i' : 'e'}</div>` : ''}</span><span class="pill ${x.absent ? 'warn' : 'ok'}">${x.absent} assent${x.absent === 1 ? 'e' : 'i'}</span></div>`).join('')}</div></div>
  <div class="card"><div class="card-h"><span class="ms ico">celebration</span><h3>Ponti con i festivi</h3></div><div class="card-b flush">${bridges.length ? bridges.map(b => `<div class="list-i"><span class="grow"><b>${esc(fmtDate(b.d, { wd: true }))}</b><div class="small muted">${esc(b.why)}</div></span></div>`).join('') : '<div class="empty">Nessun ponte nei prossimi mesi</div>'}</div></div></div>
  <div class="card mt"><div class="card-h"><span class="ms ico">calendar_view_week</span><h3>Assenti per settimana</h3></div><div class="card-b">${barChart({ labels: out.map(x => fmtShort(x.m).split(' ')[1]), series: [{ name: 'Colleghi in ferie/permesso', values: out.map(x => x.absent) }], colors: ['#f59e0b'], height: 200 })}</div></div>`;
}

// ══ REPERIBILITÀ ═════════════════════════════════════════════════════════
export function oncall(el, params, ctx) {
  let tab = params.t || 'mese'; let mi = curMonth();
  const draw = () => {
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Reperibilità</h2><p>Chi ha <b>/R</b> copre dalle 13 alle 24 del giorno e dalle 0 alle 13 del giorno dopo (4 fasce: 7 + 6 + 7 + 4 ore). Le cessioni sono evidenziate con il colore di chi subentra.</p></div>
      <div class="acts">${monthSelect(mi)}<div class="tabs">${[['mese', 'Calendario', 'calendar_month'], ['riepilogo', 'Riepilogo', 'leaderboard'], ['quadro', 'Quadro mensile ISS', 'description'], ['fasce', 'Ore per fascia', 'grid_on']].map(([k, l, i]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${ic(i)}${l}</button>`).join('')}</div></div></div><div id="body"></div></div>`;
    el.querySelector('#mo-sel').onchange = e => { mi = +e.target.value; draw(); };
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const [y, m] = ymOf(mi); const days = monthDays(y, m); const bands = repBands(); const body = el.querySelector('#body');
    if (tab === 'mese') {
      body.innerHTML = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Giorno</th>${bands.map(b => `<th>${b.label}</th>`).join('')}<th>Con /R</th></tr></thead><tbody>${days.map(d => { const r = repOf(d); const w = dow(d); return `<tr style="${w === 0 ? 'background:#ccff3322' : ''}"><td class="nowrap"><b style="color:#00f">${+d.slice(8)}</b> ${WD[w]}${store.isFestivo(d) ? ' <span class="pill info">festivo</span>' : ''}</td>${r.map((x, i) => { const o = store.op(x); const ov = repIsOverride(d, i); return `<td style="${ov && o ? `background:${o.color};color:${contrast(o.color)};font-weight:700` : ''}">${x ? esc(cap1(o ? o.surname : x)) : '<span class="neg">—</span>'}${ov ? ' ' + ic('swap_horiz') : ''}</td>`; }).join('')}<td>${store.ops().filter(o => hasRep(store.cell(o.id, d))).map(o => opChip(o.id)).join(' ')}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    }
    if (tab === 'riepilogo') {
      const rows = store.ops().map(o => { let mc = 0, mm = 0; for (const d of days) { if (hasRep(store.cell(o.id, d))) mc++; mm += repDayHours(o.id, d); } const s = yearStats(o.id, Y()); return { o, mc, mm, s }; });
      body.innerHTML = `${store.profile.key === 'autisti' ? `<div class="note mb small">${ic('info')}<div><b>Ore anno rispetto al file Excel.</b> In alcuni giorni il foglio TURNI scrive «MICHELOTTI» per intero invece di «MICHELOT.»: la formula del file non conta quelle 24 ore e mostra 937 invece di 961. L’app riconosce il nome in entrambi i modi, quindi il totale giusto è quello qui sotto.</div></div>` : ''}<div class="grid g2"><div class="card"><table class="tbl"><thead><tr><th>Operatore</th><th class="r">Rep. ${MONTHS[m].toLowerCase()}</th><th class="r">Ore ${MONTHS[m].toLowerCase()}</th><th class="r">Rep. anno</th><th class="r">Ore anno</th></tr></thead><tbody>${rows.map(r => `<tr><td>${opChip(r.o.id, { full: true })}</td><td class="r num b">${r.mc}</td><td class="r num">${hm(r.mm)}</td><td class="r num">${r.s.rep}</td><td class="r num b">${Math.round(r.s.repMin / 60)}</td></tr>`).join('')}</tbody></table></div>
        <div class="card"><div class="card-h"><span class="ms ico">bar_chart</span><h3>Ore di reperibilità nell’anno</h3></div><div class="card-b">${barChart({ labels: rows.map(r => cap1(r.o.surname).slice(0, 8)), series: [{ name: 'Ore anno', values: rows.map(r => Math.round(r.s.repMin / 60)) }], colors: ['#db2777'] })}</div></div></div>`;
    }
    if (tab === 'quadro') { body.innerHTML = `<div class="row mb"><button class="btn pri" id="pq">${ic('print')}Stampa il modulo</button><span class="small muted">Modulo «Quadro reperibilità» per l’U.O. Personale (foglio CONTEGGI ORE REP)</span></div><div id="q">${quadro(y, m)}</div>`; body.querySelector('#pq').onclick = () => { document.querySelector('#print-area').innerHTML = quadro(y, m); setTimeout(() => print(), 120); }; }
    if (tab === 'fasce') {
      body.innerHTML = `<div class="card"><div class="tbl-wrap" style="max-height:72vh"><table class="tbl" style="font-size:12px"><thead><tr><th>Giorno</th>${store.ops().map(o => `<th colspan="5" style="background:${o.color};color:#fff;text-align:center">${esc(o.surname)}</th>`).join('')}</tr><tr><th></th>${store.ops().map(() => bands.map(b => `<th class="c">${Math.round(b.min / 60)}</th>`).join('') + '<th class="c">tot</th>').join('')}</tr></thead><tbody>${days.map(d => { const r = repOf(d); return `<tr><td class="nowrap"><b style="color:#00f">${+d.slice(8)}</b> ${WD[dow(d)]}</td>${store.ops().map(o => { const v = r.map((x, i) => x === o.id ? Math.round(bands[i].min / 60) : 0); const t = v.reduce((a, b) => a + b, 0); return v.map(x => `<td class="c num" style="${x ? 'background:#ffc7ce' : 'color:var(--faint)'}">${x}</td>`).join('') + `<td class="c num b" style="${t ? 'background:#ffeb9c' : 'color:var(--faint)'}">${t}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
    }
  };
  draw();
  return store.on(w => { if (w === 'cells' || w === 'config') draw(); });
}
// Modulo ufficiale: righe = operatori, colonne = giorni, ore di reperibilità
export function quadro(y, m) {
  const days = monthDays(y, m); const bands = repBands(); let grand = 0;
  const rows = store.ops().map(o => { let tot = 0; const cells = Array.from({ length: 31 }, (_, i) => { const d = days[i]; if (!d) return '<td style="background:#bfbfbf"></td>'; const h = Math.round(repDayHours(o.id, d) / 60); tot += h; return `<td>${h || ''}</td>`; }).join(''); grand += tot; return `<tr><td style="text-align:left;font-weight:700">${esc(cap1(o.surname))}</td>${cells}<td class="ora">${tot}</td><td></td></tr>`; }).join('');
  return `<div class="paper"><div class="ph"><img src="assets/icon-118-192.png" alt=""><div style="font-size:11px"><div>Repubblica di San Marino</div><b>ISTITUTO PER LA SICUREZZA SOCIALE</b></div><div style="flex:1;text-align:center"><div style="font-size:22px;font-weight:700">U.O.C.</div><div style="font-size:11px;font-weight:700">${esc((store.config.app.unit || '').replace(/^U\.O\.C\.\s*/i, '').toUpperCase())}</div></div></div>
    <div style="margin:14px 0 4px 56px;font-size:12px">OGGETTO:</div><div style="margin-left:56px;font-weight:700;font-style:italic;font-size:13px">${esc((store.profile.repTitle || 'Quadro reperibilità').toUpperCase())}</div>
    <div style="margin:16px 0 14px 160px;font-size:13px;color:#2563eb">MESE: <b style="margin:0 50px 0 24px">${MONTHS[m].toUpperCase()}</b> ANNO: <b style="margin-left:24px">${y}</b></div>
    <table><thead><tr><th style="width:90px"></th>${Array.from({ length: 31 }, (_, i) => `<th class="yel" style="${days[i] ? '' : 'background:#bfbfbf'}">${i + 1}</th>`).join('')}<th class="ora">Tot.</th><th style="font-size:8px;width:70px">Spazio riservato U.O.Personale</th></tr></thead><tbody>${rows}<tr><td></td>${Array.from({ length: 31 }, () => '<td></td>').join('')}<td class="ora">${grand}</td><td></td></tr></tbody></table>
    <div style="margin:36px 0 0 230px;font-size:12px">Il Direttore U.O.C. ________________________________</div><div style="text-align:right;font-size:8px;margin-top:30px">MODUL-ISS-SERV.VARI 61</div>
    <div style="font-size:9px;margin-top:6px;color:#555">Fasce: ${bands.map(b => `${b.label} (${Math.round(b.min / 60)} h)`).join(' · ')}</div></div>`;
}

// ══ FESTIVI ══════════════════════════════════════════════════════════════
export function holidays(el, params, ctx) {
  const draw = () => {
    const fest = store.config.festivi.filter(d => d.startsWith(String(Y()))).sort();
    const rows = store.ops().map(o => ({ o, s: yearStats(o.id) }));
    const names = Object.fromEntries(holidaysSM(Y()).map(h => [h.date, h.name]));
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Festivi ${Y()}</h2><p>Come la tabella FESTIVI del foglio: festivi lavorati e relative ore, festività non godute (ng), non lavorate (nl), festivi di riposo (R).</p></div>${store.isManager() ? `<div class="acts"><button class="btn" id="f-sm">${ic('flag')}Calendario di San Marino</button><button class="btn pri" id="f-add">${ic('add')}Aggiungi festivo</button></div>` : ''}</div>
      <div class="card mb"><table class="tbl"><thead><tr><th>Operatore</th><th class="r">Festivi lavorati</th><th class="r">Ore festive lavorate</th><th class="r">F.N.G.</th><th class="r">Festivi non lavorati</th><th class="r">Festivi “R”</th></tr></thead><tbody>${rows.map(({ o, s }) => `<tr><td>${opChip(o.id, { full: true })}</td><td class="r num b">${s.festLav}</td><td class="r num">${hm(s.oreFestLav)}</td><td class="r num">${s.fng}</td><td class="r num">${s.fnl}</td><td class="r num">${s.festR}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><div class="card-h"><span class="ms ico">celebration</span><h3>Chi lavora nei festivi</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Festivo</th>${store.ops().map(o => `<th class="c" style="background:${o.color};color:#fff">${esc(cap1(o.surname).slice(0, 9))}</th>`).join('')}${store.isManager() ? '<th></th>' : ''}</tr></thead><tbody>
      ${fest.map(d => `<tr><td class="nowrap"><b>${esc(fmtDate(d, { wd: true }))}</b><div class="small muted">${esc(store.config.festNames[d] || names[d] || '')}</div></td>${store.ops().map(o => `<td class="c">${chipFor(store.cell(o.id, d), d)}</td>`).join('')}${store.isManager() ? `<td><button class="ibtn" data-del="${d}" title="Togli">${ic('delete')}</button></td>` : ''}</tr>`).join('')}</tbody></table></div></div></div>`;
    if (store.isManager()) {
      el.querySelector('#f-add').onclick = async () => { const d = await promptBox('Nuovo festivo', { label: 'Data', type: 'date', value: `${Y()}-01-01` }); if (!d) return; const n = await promptBox('Nome del festivo', { label: 'Nome (facoltativo)' }); const fl = [...new Set([...store.config.festivi, d])].sort(); const fn = Object.assign({}, store.config.festNames); if (n) fn[d] = n; await store.saveConfig({ festivi: fl, festNames: fn }, 'Festivo aggiunto ' + d); toast('Festivo aggiunto'); };
      el.querySelector('#f-sm').onclick = async () => { if (!await confirmBox('Usare il calendario di San Marino?', `Imposta le festività ufficiali ${Y()} e di gennaio ${Y() + 1} (Pasqua e Corpus Domini calcolati).`)) return; const h = holidaysSM(Y()).concat(holidaysSM(Y() + 1).filter(x => x.date < `${Y() + 1}-02-01`)); const fn = Object.assign({}, store.config.festNames); h.forEach(x => fn[x.date] = x.name); await store.saveConfig({ festivi: [...new Set(store.config.festivi.filter(d => !d.startsWith(String(Y()))).concat(h.map(x => x.date)))].sort(), festNames: fn }, 'Festività San Marino'); toast('Festività aggiornate'); };
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await store.saveConfig({ festivi: store.config.festivi.filter(x => x !== b.dataset.del) }, 'Festivo rimosso ' + b.dataset.del); });
    }
  };
  draw();
  return store.on(w => { if (w === 'cells' || w === 'config') draw(); });
}

// ══ STATISTICHE ED EQUITÀ ════════════════════════════════════════════════
export function stats(el, params, ctx) {
  const draw = () => {
    const { rows, avg } = equity();
    const keys = [['turno', 'Turni (turnista)'], ['diurno', 'Diurni'], ['casa', 'A casa'], ['notti', 'Notti'], ['weekend', 'Weekend lavorati'], ['domeniche', 'Domeniche'], ['festLav', 'Festivi lavorati'], ['rep', 'Reperibilità'], ['mattine', 'Mattine'], ['pomeriggi', 'Pomeriggi']];
    const avgOf = k => rows.reduce((a, r) => a + r.st[k], 0) / Math.max(1, rows.length);
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Statistiche ed equità ${Y()}</h2><p>Andamento annuo dell’assegnazione dei turni (foglio GRAFICO TURNI) e distribuzione dei carichi più pesanti tra i colleghi.</p></div></div>
      ${store.profile.key === 'autisti' ? `<div class="note mb small">${ic('info')}<div><b>Differenza voluta con il file Excel.</b> Nel foglio GRAFICO TURNI la colonna DIURNO confronta le ore con un uguale esatto tra orari (es. 7:12 = 7:12) e, per gli arrotondamenti di Excel, a volte non conta il giorno: per questo il file mostra qualche diurno in meno. L’app conta tutti i giorni da diurno; “casa” è sempre 365 meno turni e diurni, come nel file.</div></div>` : ''}<div class="card mb" style="background:#3f3f3f;border-color:#3f3f3f;color:#ddd"><div class="card-h" style="border-color:#555"><h3 style="color:#ddd;flex:1;text-align:center;font-size:18px">Andamento annuo assegnazione turni</h3></div><div class="card-b" style="--muted:#bbb;--ink-2:#ddd;--line:#555">${barChart({ labels: rows.map(r => cap1(r.op.surname)), series: [{ name: 'TURNO', values: rows.map(r => r.st.turno) }, { name: 'DIURNO', values: rows.map(r => r.st.diurno) }, { name: 'CASA', values: rows.map(r => r.st.casa) }], colors: ['#33a7ff', '#f08a24', '#2ee6c5'], height: 300 })}</div></div>
      <div class="card mb"><div class="card-h"><span class="ms ico">balance</span><h3>Equità</h3><span class="small muted">verde = sotto la media, rosso = sopra la media di oltre il 15%</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Operatore</th>${keys.map(([k, l]) => `<th class="r">${l}</th>`).join('')}<th class="r">Ore rep.</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${opChip(r.op.id, { full: true })}</td>${keys.map(([k]) => { const v = r.st[k], a = avgOf(k); const dev = a ? (v - a) / a : 0; const heavy = ['notti', 'weekend', 'domeniche', 'festLav', 'rep'].includes(k); return `<td class="r num" style="${heavy && Math.abs(dev) > .15 ? `background:${dev > 0 ? 'var(--err-soft)' : 'var(--ok-soft)'};font-weight:700` : ''}">${v}</td>`; }).join('')}<td class="r num">${Math.round(r.st.repMin / 60)}</td></tr>`).join('')}
      <tr style="background:var(--surface-2)"><td><b>Media</b></td>${keys.map(([k]) => `<td class="r num b">${avgOf(k).toFixed(1)}</td>`).join('')}<td class="r num b">${Math.round(rows.reduce((a, r) => a + r.st.repMin, 0) / 60 / Math.max(1, rows.length))}</td></tr></tbody></table></div></div>
      <div class="grid g2"><div class="card"><div class="card-h"><span class="ms ico">dark_mode</span><h3>Notti, weekend e festivi</h3></div><div class="card-b">${barChart({ labels: rows.map(r => cap1(r.op.surname).slice(0, 8)), series: [{ name: 'Notti', values: rows.map(r => r.st.notti) }, { name: 'Weekend', values: rows.map(r => r.st.weekend) }, { name: 'Festivi', values: rows.map(r => r.st.festLav) }], colors: ['#4f46e5', '#f59e0b', '#06b6d4'] })}</div></div>
      <div class="card"><div class="card-h"><span class="ms ico">donut_large</span><h3>Distribuzione dei codici</h3></div><div class="card-b">${codeDistribution()}</div></div></div></div>`;
  };
  draw();
  return store.on(w => { if (w === 'cells') draw(); });
}
function codeDistribution() {
  const cnt = {}; const y = Y();
  for (const o of store.ops()) for (const d of rangeDays(`${y}-01-01`, `${y}-12-31`)) { const c = store.cell(o.id, d); if (c && c.s) cnt[c.s.trim()] = (cnt[c.s.trim()] || 0) + 1; }
  const parts = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => { const st = shiftStyle({ s: k }, `${y}-01-01`); return { l: k, v, c: st.bg === '#fff' ? (st.fg === '#000' ? '#334155' : st.fg) : st.bg }; });
  return `<div class="row wrap" style="gap:24px">${donut(parts, 160)}<div class="col" style="gap:6px">${parts.map(p => `<div class="row small"><i style="width:12px;height:12px;border-radius:3px;background:${p.c};display:inline-block"></i><b style="min-width:60px">${esc(p.l)}</b><span class="muted">${p.v}</span></div>`).join('')}</div></div>`;
}
