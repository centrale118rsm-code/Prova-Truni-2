// ═══════════════════════════════════════════════════════════════════════════
// CALENDARIO — vista nuova, pensata per leggere il servizio a colpo d'occhio:
//  • Mese: ogni giorno è una scheda con tre fasce (Mattina, Pomeriggio, Notte) e le
//    persone in servizio, il reperibile, gli assenti; bordo rosso se manca qualcuno.
//    Scegliendo una persona, il mese diventa il suo calendario personale.
//  • Settimana: una riga per persona, turno + orario + ore, totale sulle 36 ore e saldo.
//  • Giorno: la linea delle 24 ore con chi lavora quando e chi è reperibile.
//  • Pannello "Conteggi": ore del mese, saldo, ferie e permessi rimasti, reperibilità.
// Cosa si vede lo decide l'amministratore (Impostazioni › Cosa vedere).
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, WD_LONG, today, addDays, fmtDate, fmtShort, hm, dow, mondayOf, monthDays, yearOf, monthIdx, rangeDays, pad, contrast, initials } from '../util.js';
import { ic, modal, toast, avatar, cap1, confirmBox } from '../ui.js';
import { shiftInfo, absInfo, shiftList, absList, repOf, repBands, coverage, coverageWant, workedMin, creditMin, weeks, yearStats, monthHours, hasRep, isRest, suggestedCredit, inService, repMinutes } from '../calc.js';
import { catOf, CAT } from './myshifts.js';
import { display, canSeeCounts, canSeePhone, canSeeAbsReason, canSeeNotes, countOps } from '../display.js';

const S = Object.assign({ view: null, anchor: null, who: '', panel: innerWidth >= 1200 }, JSON.parse(sessionStorage.getItem('gt2:planner') || '{}'));
const save = () => sessionStorage.setItem('gt2:planner', JSON.stringify(S));
const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const nm = o => `${o.name ? o.name + ' ' : ''}${cap1(o.surname)}`;
const ini = o => initials(o.name ? `${o.name} ${o.surname}` : o.surname);

// Chi c'è in ogni fascia del giorno
function dayInfo(d) {
  const f = { M: [], P: [], N: [], abs: [], rest: [] };
  for (const o of store.ops()) {
    if (!inService(o, d)) continue;
    const c = store.cell(o.id, d); if (!c) continue;
    const s = c.s ? shiftInfo(c.s) : null; const cnt = (s && s.cnt) || [];
    const w = workedMin(c);
    if (c.a && !(s && w)) { f.abs.push({ o, c }); continue; }
    if (!s) continue;
    const di = s.group === 'D';
    if (cnt.includes('tm') || cnt.includes('dm')) f.M.push({ o, c, di });
    if (cnt.includes('tp') || cnt.includes('dp')) f.P.push({ o, c, di });
    if (cnt.includes('tn')) f.N.push({ o, c, di });
    if (s.group === 'R') f.rest.push({ o, c });
  }
  const cov = coverage(d), want = coverageWant();
  const gaps = ['tm', 'tp', 'tn'].filter(k => (cov[k] || 0) < want[k]);
  return Object.assign(f, { cov, want, gaps });
}
const absLabel = (o, c) => canSeeAbsReason(o.id) ? absInfo(c.a).label : 'Assente';
// nome breve per le caselle (il nome completo resta nel dettaglio)
const SHORT_ABS = { ferie: 'Ferie', ferieAP: 'Residuo', perm: 'Permesso', mal: 'Malattia', rec: 'Recupero', fest: 'Festività' };
const absShort = (o, c) => { if (!canSeeAbsReason(o.id)) return 'Assente'; const a = absInfo(c.a); return SHORT_ABS[a.kind] || (a.label.length > 14 ? a.label.split(/[ (]/)[0] : a.label); };
const timeOf = c => { const s = c && c.s ? shiftInfo(c.s) : null; return s && s.from ? `${s.from}–${s.to}` : ''; };
const avs = (list, max = 6) => list.slice(0, max).map(({ o, di }) => `<i class="pl-av ${di ? 'di' : ''}" style="--c:${o.color};--t:${contrast(o.color)}" title="${esc(nm(o))}${di ? ' (diurno)' : ''}">${esc(ini(o))}</i>`).join('') + (list.length > max ? `<i class="pl-av more">+${list.length - max}</i>` : '');

export function planner(el, params, ctx) {
  const d0 = display();
  if (!S.view || (params.v && ['mese', 'settimana', 'giorno'].includes(params.v))) S.view = params.v || (['mese', 'settimana', 'giorno'].includes(d0.calView) ? d0.calView : 'mese');
  S.anchor = params.d || S.anchor || today();
  if (params.op) S.who = params.op;
  if (S.who && !store.op(S.who)) S.who = '';
  const draw = () => {
    const D = display();
    const title = S.view === 'mese' ? `${MONTHS[monthIdx(S.anchor)]} ${yearOf(S.anchor)}` : S.view === 'settimana' ? `${fmtShort(mondayOf(S.anchor))} – ${fmtShort(addDays(mondayOf(S.anchor), 6))}` : fmtDate(S.anchor, { wd: true, year: true });
    el.innerHTML = `<div class="pl ${S.panel ? 'with-panel' : ''}">
      <div class="pl-bar">
        <div class="row" style="gap:4px"><button class="ibtn" data-nav="-1" aria-label="Indietro">${ic('chevron_left')}</button><button class="btn sm" data-nav="0">Oggi</button><button class="ibtn" data-nav="1" aria-label="Avanti">${ic('chevron_right')}</button></div>
        <h2 class="pl-title">${esc(title)}</h2>
        <div class="seg">${[['mese', 'Mese'], ['settimana', 'Settimana'], ['giorno', 'Giorno']].map(([k, l]) => `<button data-v="${k}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select class="inp sm" id="pl-who" style="width:auto;max-width:200px"><option value="">Tutta la squadra</option>${store.ops().map(o => `<option value="${o.id}" ${S.who === o.id ? 'selected' : ''}>${esc(nm(o))}${o.id === store.me ? ' (io)' : ''}</option>`).join('')}</select>
        <button class="btn sm ${S.panel ? 'pri' : ''}" id="pl-panel">${ic('functions')}<span class="desk-only">Conteggi</span></button>
      </div>
      <div class="pl-main"><div class="pl-body" id="pl-body"></div>${S.panel ? `<aside class="pl-side" id="pl-side"></aside>` : ''}</div>
      <div class="pl-legend">${['mattina', 'pomeriggio', 'notte', 'riposo', 'ferie', 'malattia', 'assenza'].map(k => `<span><i style="background:${CAT[k].c}"></i>${CAT[k].label}</span>`).join('')}${D.showRep ? `<span><i class="rep"></i>Reperibile</span>` : ''}<span><i class="pl-av di" style="--c:#64748b;width:12px;height:12px"></i>Diurno</span></div>
    </div>`;
    const body = el.querySelector('#pl-body');
    if (S.view === 'mese') body.innerHTML = S.who ? monthPerson(S.who) : monthTeam();
    if (S.view === 'settimana') body.innerHTML = weekView();
    if (S.view === 'giorno') body.innerHTML = dayView(S.anchor);
    if (S.panel) el.querySelector('#pl-side').innerHTML = panel();
    // eventi
    el.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { const n = +b.dataset.nav; S.anchor = n === 0 ? today() : S.view === 'mese' ? shiftMonth(S.anchor, n) : addDays(S.anchor, n * (S.view === 'settimana' ? 7 : 1)); save(); draw(); });
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; save(); draw(); });
    el.querySelector('#pl-who').onchange = e => { S.who = e.target.value; save(); draw(); };
    el.querySelector('#pl-panel').onclick = () => { S.panel = !S.panel; save(); draw(); };
    el.querySelectorAll('[data-day]').forEach(t => t.onclick = () => dayBox(t.dataset.day, draw, ctx));
    el.querySelectorAll('[data-goday]').forEach(t => t.onclick = e => { e.stopPropagation(); S.anchor = t.dataset.goday; S.view = 'giorno'; save(); draw(); });
    el.querySelectorAll('[data-pick]').forEach(t => t.onclick = () => { S.who = t.dataset.pick; save(); draw(); });
  };
  draw();
  return store.on(w => { if (w === 'cells' || w === 'config') draw(); });
}
function shiftMonth(d, n) { let y = yearOf(d), m = monthIdx(d) + n; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return `${y}-${pad(m + 1)}-01`; }

// ── MESE (squadra) ──
function monthGrid(cellFn) {
  const y = yearOf(S.anchor), m = monthIdx(S.anchor); const days = monthDays(y, m); const tm = today();
  let start = mondayOf(days[0]); const end = addDays(mondayOf(days[days.length - 1]), 6);
  let h = `<div class="pl-month">${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(x => `<div class="pl-wh">${x}</div>`).join('')}`;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const out = monthIdx(d) !== m; const fest = store.isFestivo(d);
    h += cellFn(d, { out, today: d === tm, fest, sun: dow(d) === 0 });
  }
  return h + '</div>';
}
function monthTeam() {
  const D = display();
  return monthGrid((d, f) => {
    const x = dayInfo(d); const r = repOf(d); const repId = r[2] || r[3];
    const bad = !f.out && x.gaps.length;
    const row = (k, label, list, key) => `<div class="pl-f"><span class="pl-fl" style="background:${CAT[k].c}" title="${label}">${label[0]}</span><div class="pl-avs">${list.length ? avs(list) : `<em class="${x.gaps.includes(key) ? 'gap' : ''}">${x.gaps.includes(key) ? 'scoperto' : '—'}</em>`}</div></div>`;
    return `<button class="pl-day ${f.out ? 'out' : ''} ${f.today ? 'today' : ''} ${f.fest ? 'fest' : ''} ${f.sun ? 'sun' : ''} ${bad ? 'bad' : ''}" data-day="${d}">
      <div class="pl-dh"><b>${+d.slice(8)}</b>${f.fest ? `<span class="pl-fest">${esc(store.config.festNames[d] || 'festivo')}</span>` : ''}${bad ? `<span class="ms pl-warn" title="Manca: ${x.gaps.map(g => ({ tm: 'mattina', tp: 'pomeriggio', tn: 'notte' })[g]).join(', ')}">error</span>` : ''}</div>
      ${row('mattina', 'Mattina', x.M, 'tm')}${row('pomeriggio', 'Pomeriggio', x.P, 'tp')}${row('notte', 'Notte', x.N, 'tn')}
      <div class="pl-foot">${D.showRep && repId ? `<span class="pl-rep" title="Reperibile dalle 13:00">${ic('phone_in_talk')}${esc(cap1(store.op(repId) ? store.op(repId).surname : '').slice(0, 9))}</span>` : '<span></span>'}${x.abs.length ? `<span class="pl-absn" title="${esc(x.abs.map(a => nm(a.o) + ': ' + absLabel(a.o, a.c)).join('\n'))}">${x.abs.length} ass.</span>` : ''}</div>
    </button>`;
  });
}
// ── MESE (una persona) ──
function monthPerson(op) {
  const D = display();
  return monthGrid((d, f) => {
    const o = store.op(op); const c = store.cell(op, d); const k = catOf(c); const s = c && c.s ? shiftInfo(c.s) : null;
    const absent = c && c.a && !(s && workedMin(c));
    const label = !c ? '' : absent ? absShort(o, c) : c.s || '';
    const rep = D.showRep && repOf(d).some(x => x === op);
    return `<button class="pl-day pers ${f.out ? 'out' : ''} ${f.today ? 'today' : ''} ${f.fest ? 'fest' : ''} ${f.sun ? 'sun' : ''}" data-day="${d}">
      <div class="pl-dh"><b>${+d.slice(8)}</b>${f.fest ? `<span class="pl-fest">${esc(store.config.festNames[d] || 'festivo')}</span>` : ''}</div>
      ${c && k !== 'vuoto' ? `<div class="pl-pill" style="--c:${CAT[k].c};--s:${CAT[k].soft}"><b>${esc(label)}</b>${D.showHours && s && s.from && !absent ? `<small>${s.from}–${s.to}</small>` : ''}${!absent && s && workedMin(c) && D.showHours ? `<small>${hm(workedMin(c))} h</small>` : ''}</div>` : '<div class="pl-pill empty">—</div>'}
      ${rep ? `<span class="pl-rep">${ic('phone_in_talk')}reperibile</span>` : ''}${c && c.n && canSeeNotes(op) ? `<span class="pl-note" title="${esc(c.n)}">${ic('sticky_note_2')}</span>` : ''}
    </button>`;
  });
}

// ── SETTIMANA ──
function weekView() {
  const D = display(); const mon = mondayOf(S.anchor); const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i)); const tm = today();
  const yr = yearOf(mon);
  const head = days.map(d => { const x = dayInfo(d); return `<th class="${d === tm ? 'today' : ''} ${store.isFestivo(d) ? 'fest' : ''}"><button class="pl-th" data-goday="${d}"><b>${WD[dow(d)]} ${+d.slice(8)}</b><span class="pl-covs">${['tm', 'tp', 'tn'].map(k => `<i class="${(x.cov[k] || 0) < x.want[k] ? 'no' : ''}" title="${({ tm: 'Mattina', tp: 'Pomeriggio', tn: 'Notte' })[k]}: ${x.cov[k] || 0} su ${x.want[k]}">${(x.cov[k] || 0)}</i>`).join('')}</span></button></th>`; }).join('');
  const rows = store.ops().filter(o => days.some(d => inService(o, d))).map(o => {
    const w = weeks(o.id, yr).find(x => x.monday === mon);
    const me = o.id === store.me || o.id === S.who;
    const cells = days.map(d => {
      const c = store.cell(o.id, d); const k = catOf(c); const s = c && c.s ? shiftInfo(c.s) : null; const absent = c && c.a && !(s && workedMin(c));
      if (!c || k === 'vuoto') return `<td data-day="${d}" class="pl-wc empty">·</td>`;
      const rep = D.showRep && hasRep(c);
      return `<td data-day="${d}" class="pl-wc" style="--c:${CAT[k].c};--s:${CAT[k].soft}"><b title="${esc(absent ? absLabel(o, c) : '')}">${esc(absent ? absShort(o, c) : c.s)}</b>${D.showHours && s && s.from && !absent ? `<small>${s.from}–${s.to}</small>` : ''}${rep ? `<span class="pl-r" title="Reperibile">R</span>` : ''}</td>`;
    }).join('');
    const showC = canSeeCounts(o.id) && w;
    return `<tr class="${me ? 'me' : ''}"><th class="pl-wn"><button data-pick="${o.id}">${avatar(o.id)}<span><b>${esc(nm(o))}</b>${o.label ? `<small>${esc(o.label)}</small>` : ''}</span></button></th>${cells}<td class="pl-wt">${showC ? `<b>${hm(w.total)}</b><small class="${w.delta >= 0 ? 'pos' : 'neg'}">${hm(w.delta, { plus: true })}</small><small>saldo ${hm(w.balance, { plus: true })}</small>` : '<small class="muted">—</small>'}</td></tr>`;
  }).join('');
  return `<div class="pl-weekwrap"><table class="pl-week"><thead><tr><th></th>${head}<th class="pl-wt">Settimana</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ── GIORNO ──
function dayView(d) {
  const D = display(); const x = dayInfo(d); const r = repOf(d); const bands = repBands();
  const working = store.ops().filter(o => { const c = store.cell(o.id, d); return c && c.s && workedMin(c) > 0; });
  const bar = (o) => { const c = store.cell(o.id, d); const s = shiftInfo(c.s); const k = catOf(c); const a = toM(s.from), b = s.to === '24:00' ? 1440 : toM(s.to); return `<b class="pl-gbar" style="left:${a / 14.4}%;width:${(b - a) / 14.4}%;background:${CAT[k].c}">${esc(c.s)}${D.showHours ? ` · ${s.from}–${s.to}` : ''}</b>`; };
  const repRow = D.showRep ? bands.map((bd, i) => { const id = r[i]; if (!id) return ''; const a = toM(bd.from), b = bd.to === '24:00' ? 1440 : toM(bd.to); return `<b class="pl-grep" style="left:${a / 14.4}%;width:${(b - a) / 14.4}%" title="${esc(bd.label)}">${esc(cap1(store.op(id).surname))}</b>`; }).join('') : '';
  return `<div class="pl-dayv">
    <div class="row wrap" style="gap:8px;margin-bottom:12px">${['tm', 'tp', 'tn'].map(k => { const v = x.cov[k] || 0, w = x.want[k]; return `<span class="pill ${v < w ? 'err' : v > w ? 'warn' : 'ok'}">${({ tm: 'Mattina', tp: 'Pomeriggio', tn: 'Notte' })[k]} ${v}/${w}</span>`; }).join('')}${store.isFestivo(d) ? `<span class="pill info">${esc(store.config.festNames[d] || 'Festivo')}</span>` : ''}</div>
    <div class="pl-gantt"><div class="pl-axis">${[0, 3, 6, 9, 12, 15, 18, 21].map(h => `<i style="left:${h / 24 * 100}%">${pad(h)}</i>`).join('')}</div>
    ${working.map(o => `<div class="pl-grow" data-day="${d}"><span class="pl-gname">${avatar(o.id)}${esc(nm(o))}</span><span class="pl-gtrack">${bar(o)}</span></div>`).join('') || '<div class="empty">Nessuno in servizio</div>'}
    ${repRow ? `<div class="pl-grow"><span class="pl-gname">${ic('phone_in_talk')}Reperibilità</span><span class="pl-gtrack">${repRow}</span></div>` : ''}</div>
    ${x.abs.length ? `<div class="sec-t">Assenti</div><div class="row wrap" style="gap:6px">${x.abs.map(a => `<span class="pill">${esc(nm(a.o))} · ${esc(absLabel(a.o, a.c))}</span>`).join('')}</div>` : ''}
    ${D.showRest && x.rest.length ? `<div class="sec-t">A riposo</div><div class="small muted">${x.rest.map(a => esc(nm(a.o))).join(', ')}</div>` : ''}
  </div>`;
}

// ── Dettaglio di un giorno (finestra) ──
function dayBox(d, redraw, ctx) {
  const D = display(); const x = dayInfo(d); const r = repOf(d); const bands = repBands(); const mgr = store.isManager();
  const person = ({ o, c, di }) => `<div class="pl-prow"><span class="row" style="gap:10px;min-width:0">${avatar(o.id)}<span style="min-width:0"><b>${esc(nm(o))}</b>${di ? ' <span class="tiny muted">diurno</span>' : ''}<div class="small muted">${esc(c.s || '')}${D.showHours && timeOf(c) ? ' · ' + timeOf(c) : ''}${D.showRep && hasRep(c) ? ' · reperibile' : ''}${c.n && canSeeNotes(o.id) ? ' · ' + esc(c.n) : ''}</div></span></span><span class="row" style="gap:4px">${o.phone && canSeePhone(o.id) ? `<a class="ibtn" href="tel:${esc(o.phone)}" title="Chiama">${ic('call')}</a>` : ''}${mgr ? `<button class="ibtn" data-edit="${o.id}" title="Modifica">${ic('edit')}</button>` : ''}</span></div>`;
  const sec = (k, label, list, key) => `<div class="pl-dsec"><div class="pl-dsh"><i style="background:${CAT[k].c}"></i><b>${label}</b><span class="pill ${(x.cov[key] || 0) < x.want[key] ? 'err' : 'ok'}">${x.cov[key] || 0}/${x.want[key]}</span></div>${list.map(person).join('') || '<div class="small neg" style="padding:6px 0">Nessuno: fascia scoperta</div>'}</div>`;
  const m = modal({
    title: fmtDate(d, { wd: true, year: true }), icon: 'event', size: 'wide',
    body: `<div class="col" style="gap:12px">${store.isFestivo(d) ? `<span class="pill info" style="width:max-content">${esc(store.config.festNames[d] || 'Festivo')}</span>` : ''}
      ${sec('mattina', 'Mattina', x.M, 'tm')}${sec('pomeriggio', 'Pomeriggio', x.P, 'tp')}${sec('notte', 'Notte', x.N, 'tn')}
      ${D.showRep ? `<div class="pl-dsec"><div class="pl-dsh"><i style="background:#DB2777"></i><b>Reperibilità</b></div><div class="grid g4" style="gap:6px">${bands.map((b, i) => `<div class="pl-band"><small>${b.label}</small><b>${r[i] ? esc(nm(store.op(r[i]))) : '—'}</b></div>`).join('')}</div></div>` : ''}
      ${x.abs.length ? `<div class="pl-dsec"><div class="pl-dsh"><i style="background:${CAT.assenza.c}"></i><b>Assenti</b></div>${x.abs.map(({ o, c }) => `<div class="pl-prow"><span class="row" style="gap:10px">${avatar(o.id)}<b>${esc(nm(o))}</b><span class="small muted">${esc(absLabel(o, c))}</span></span>${mgr ? `<button class="ibtn" data-edit="${o.id}">${ic('edit')}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${mgr ? `<div class="row wrap"><button class="btn" data-add>${ic('person_add')}Assegna un turno</button><button class="btn" data-full>${ic('edit_calendar')}Apri nell’editor completo</button></div>` : ''}</div>`
  });
  m.body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { m.close(); quickEdit(b.dataset.edit, d, redraw); });
  const add = m.body.querySelector('[data-add]'); if (add) add.onclick = () => { m.close(); pickPerson(d, redraw); };
  const full = m.body.querySelector('[data-full]'); if (full) full.onclick = () => { m.close(); ctx.go('modifica', { d }); };
}
function pickPerson(d, redraw) {
  const m = modal({ title: 'A chi assegni il turno?', icon: 'person_add', body: `<div class="col" style="gap:6px">${store.ops().filter(o => inService(o, d)).map(o => { const c = store.cell(o.id, d); return `<button class="btn" data-o="${o.id}" style="justify-content:space-between"><span class="row">${avatar(o.id)}${esc(nm(o))}</span><span class="small muted">${esc(c ? (c.s || (c.a ? absInfo(c.a).label : '')) : 'libero')}</span></button>`; }).join('')}</div>` });
  m.body.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { m.close(); quickEdit(b.dataset.o, d, redraw); });
}
// Modifica veloce di una casella: si pubblica subito e l'interessato riceve la notifica
function quickEdit(op, d, redraw) {
  const o = store.op(op); const prev = store.cell(op, d) || {};
  const m = modal({
    title: `${nm(o)} · ${fmtDate(d, { wd: true })}`, icon: 'edit', foot: '',
    body: `<div class="col"><div class="field">Turno</div><div class="pl-codes">${shiftList().map(s => { const k = catOf({ s: s.code }); return `<button data-s="${esc(s.code)}" class="${prev.s === s.code ? 'on' : ''}" style="--c:${CAT[k].c};--s:${CAT[k].soft}" title="${esc(s.label)}">${esc(s.code)}</button>`; }).join('')}<button data-s="" class="${!prev.s ? 'on' : ''}">nessuno</button></div>
      <div class="field">Assenza</div><div class="pl-codes">${absList().map(a => `<button data-a="${esc(a.code)}" class="${prev.a === a.code ? 'on' : ''}" style="--c:${a.bg};--s:${a.bg}33" title="${esc(a.label)}">${esc(a.code)}</button>`).join('')}<button data-a="" class="${!prev.a ? 'on' : ''}">nessuna</button></div>
      <div class="small muted" id="qe-desc"></div>
      <label class="field">Nota<input class="inp" id="qe-n" value="${esc(prev.n || '')}"></label>
      <label class="chk"><input type="checkbox" id="qe-mk" ${prev.mk === 'serv' ? 'checked' : ''}>Cambio per esigenze di servizio</label></div>`
  });
  let s = prev.s || '', a = prev.a || '';
  const desc = () => { m.body.querySelector('#qe-desc').textContent = [s && shiftInfo(s) ? shiftInfo(s).label + (shiftInfo(s).from ? ` ${shiftInfo(s).from}–${shiftInfo(s).to}` : '') : '', a ? absInfo(a).label : ''].filter(Boolean).join(' · ') || 'Casella vuota'; };
  m.body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { s = b.dataset.s; m.body.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b)); desc(); });
  m.body.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { a = b.dataset.a; m.body.querySelectorAll('[data-a]').forEach(x => x.classList.toggle('on', x === b)); desc(); });
  desc();
  m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('send')}Salva e avvisa</button>`;
  m.foot.querySelector('[data-c]').onclick = () => m.close();
  m.foot.querySelector('[data-o]').onclick = async () => {
    const c = {}; if (s) c.s = s; if (a) { c.a = a; if (!(s && shiftInfo(s) && workedMin({ s }))) c.cr = prev.a === a && prev.cr != null ? prev.cr : suggestedCredit(op, d, store.rawCell(op, d)); }
    const n = m.body.querySelector('#qe-n').value.trim(); if (n) c.n = n; if (m.body.querySelector('#qe-mk').checked) c.mk = 'serv'; else if (prev.mk === 'pers') c.mk = 'pers';
    try { await store.applyNow([{ key: op + '|' + d, val: Object.keys(c).length ? c : null }], 'Modifica dal calendario'); m.close(); toast(`Salvato: ${nm(o)} è stato avvisato`); redraw(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

// ── Pannello conteggi ──
function panel() {
  const y = yearOf(S.anchor), m = monthIdx(S.anchor);
  const who = S.who || (store.me && !store.isManager() ? store.me : '');
  if (who && canSeeCounts(who)) return personPanel(who, y, m);
  const ops = countOps();
  if (!ops.length) return `<div class="pl-pcard"><div class="small muted">I conteggi dei colleghi non sono visibili.</div></div>`;
  return `<div class="pl-pcard"><div class="pl-ph">${ic('functions')}<b>Conteggi · ${MONTHS[m]}</b></div>
    <table class="pl-ptbl"><thead><tr><th></th><th title="Ore del mese (lavorate + accreditate)">Ore</th><th title="Saldo ore a oggi">Saldo</th><th title="Ferie rimaste">Ferie</th><th title="Permessi rimasti (giorni / ore)">Perm.</th></tr></thead><tbody>
    ${ops.map(o => { const st = yearStats(o.id, y); const mh = monthHours(o.id, y, m); const w = weeks(o.id, y); const last = [...w].reverse().find(x => x.sunday < today()) || w[0]; const bal = last ? last.balance : 0; return `<tr data-pick="${o.id}"><td><span class="op-chip"><i style="background:${o.color};height:16px"></i>${esc(cap1(o.surname))}</span></td><td>${hm(mh.total)}</td><td class="${bal >= 0 ? 'pos' : 'neg'}">${hm(bal, { plus: true })}</td><td class="${st.ferieRestanti < 0 ? 'neg' : ''}">${st.ferieRestanti}</td><td>${st.permGgRestanti}/${st.permOreRestanti}h</td></tr>`; }).join('')}</tbody></table>
    <div class="small muted" style="margin-top:8px">Tocca un nome per i suoi conteggi completi.</div></div>`;
}
function personPanel(op, y, m) {
  const o = store.op(op); const st = yearStats(op, y); const mh = monthHours(op, y, m); const days = monthDays(y, m);
  const w = weeks(op, y); const last = [...w].reverse().find(x => x.sunday < today()) || w[0]; const bal = last ? last.balance : (o.initBalance || 0);
  const due = Math.round(days.filter(d => inService(o, d)).length / 7 * (o.weeklyMin || store.profile.weeklyMin));
  const rm = repMinutes(op, days[0], days[days.length - 1]);
  let nights = 0, abs = {}; for (const d of days) { const c = store.cell(op, d); if (catOf(c) === 'notte') nights++; if (c && c.a) { const l = absInfo(c.a).label; abs[l] = (abs[l] || 0) + 1; } }
  const line = (l, v, cls = '') => `<div class="pl-pl"><span>${l}</span><b class="${cls}">${v}</b></div>`;
  const bar = (used, tot) => tot ? `<div class="bar" style="margin:4px 0 2px"><i style="width:${Math.min(100, Math.max(0, used / tot * 100))}%"></i></div>` : '';
  return `<div class="pl-pcard"><div class="pl-ph">${avatar(op)}<span><b>${esc(nm(o))}</b><small>${MONTHS[m]} ${y}</small></span>${S.who ? `<button class="ibtn" data-pick="" title="Torna alla squadra">${ic('close')}</button>` : ''}</div>
    <div class="pl-sec">Ore del mese</div>
    ${line('Lavorate', hm(mh.worked))}${line('Accreditate (assenze, permessi)', hm(mh.credit))}${line('Previste dal contratto', hm(due))}${line('Differenza', hm(mh.total - due, { plus: true }), mh.total - due >= 0 ? 'pos' : 'neg')}
    <div class="pl-big ${bal >= 0 ? 'pos' : 'neg'}"><small>Saldo ore${last ? ` al ${fmtDate(last.sunday)}` : ''}</small><b>${hm(bal, { plus: true })}</b></div>
    <div class="pl-sec">Assenze rimaste nell’anno</div>
    ${line('Ferie', `${st.ferieRestanti} su ${st.ferieSpettanti}`, st.ferieRestanti < 0 ? 'neg' : '')}${bar(st.ferieSpettanti - st.ferieRestanti, st.ferieSpettanti)}
    ${st.ferieAPRestanti != null && st.ferieAP ? line(`Residuo ${y - 1}`, `${st.ferieAPRestanti} su ${st.ferieAP}`) : ''}
    ${line('Permessi (giorni)', `${st.permGgRestanti} su ${st.permGgSpettanti}`, st.permGgRestanti < 0 ? 'neg' : '')}${bar(st.permGgSpettanti - st.permGgRestanti, st.permGgSpettanti)}
    ${line('Permessi (ore)', `${st.permOreRestanti} su ${st.permOreSpettanti}`, st.permOreRestanti < 0 ? 'neg' : '')}${bar(st.permOreSpettanti - st.permOreRestanti, st.permOreSpettanti)}
    ${line('Di cui PN usati', st.pn)}
    <div class="pl-sec">Nel mese</div>
    ${line('Notti', nights)}${display().showRep ? line('Reperibilità', `${rm.count} · ${hm(rm.min)} h`) : ''}${Object.entries(abs).map(([l, n]) => line(l, `${n} g`)).join('')}
    <div class="pl-sec">Nell’anno</div>
    ${line('Malattia', `${st.malattia} g`)}${line('Recuperi', `${st.recuperi} g`)}${line('Festivi lavorati', st.festLav)}${display().showRep ? line('Reperibilità', `${st.rep} · ${Math.round(st.repMin / 60)} h`) : ''}
  </div>`;
}
