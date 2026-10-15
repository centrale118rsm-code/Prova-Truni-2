// ═══════════════════════════════════════════════════════════════════════════
// GESTIONE — pannello di controllo, bozza automatica, controlli, operatori,
// codici e regole, stampe e moduli, dati (Excel, backup, copie), storico,
// accessi, impostazioni (password, cloud, profilo, nuovo anno).
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, today, addDays, fmtDate, fmtShort, hm, parseHM, monthDays, dow, yearOf, monthIdx, rangeDays, relTime, stamp, download, sha256, hashPass, uid, cap, holidaysSM, deepClone } from '../util.js';
import { ic, modal, toast, confirmBox, promptBox, popover, chipFor, opChip, avatar, cap1, shiftStyle, absStyle } from '../ui.js';
import { shiftInfo, shiftList, absList, absInfo, lineOf, codeForLine, coverage, validate, yearStats, weeks, repOf, repBands, hasRep, workedMin, describe, shortCell, cycle, diurnoCode, repCodeOf, coverageWant } from '../calc.js';
import { DEFAULT_SHIFTS, DEFAULT_ABSENCES, DEFAULT_REP_BANDS, LINE_COLORS, OPERATOR_PALETTE, PROFILES, COVERAGE } from '../profile.js';
import { kpi } from './me.js';
import { build, detectRole } from '../gen.js';
import { display, DISPLAY_DEFAULTS } from '../display.js';
import { quadro } from './counts.js';
import { changesFor, TYPES } from './requests.js';
import { parseWorkbook, diffImport, exportWorkbook } from '../excel.js';

const Y = () => store.config.year;
const guard = (el, ctx, id, role = 'coord') => {
  if ((role === 'admin' && store.role !== 'admin') || !store.isManager()) {
    el.innerHTML = `<div class="page"><div class="card"><div class="empty">${ic('lock')}<div style="font-weight:700;color:var(--ink);margin:6px 0">Area riservata</div><div>Accedi come ${role === 'admin' ? 'amministratore' : 'coordinatore'} per continuare.</div><button class="btn pri mt" id="lg">${ic('login')}Accedi</button></div></div></div>`;
    el.querySelector('#lg').onclick = () => ctx.askLogin(role, () => ctx.go(id));
    return false;
  }
  return true;
};
const monthSel = (mi, id = 'msel') => `<select class="inp" id="${id}" style="width:auto">${MONTHS.map((m, i) => `<option value="${i}" ${mi === i ? 'selected' : ''}>${m} ${Y()}</option>`).join('')}<option value="12" ${mi === 12 ? 'selected' : ''}>Gennaio ${Y() + 1}</option></select>`;
const ymOf = mi => mi === 12 ? [Y() + 1, 0] : [Y(), mi];
const curM = () => yearOf(today()) === Y() ? monthIdx(today()) : 0;

// ══ PANNELLO DI CONTROLLO ════════════════════════════════════════════════
export function dashboard(el, params, ctx) {
  if (!guard(el, ctx, 'dashboard')) return;
  const draw = async () => {
    const tm = today(); const cov = coverage(tm); const r = repOf(tm); const bands = repBands();
    const [y, m] = ymOf(curM()); const md = monthDays(y, m);
    const iss = validate(md[0], md[md.length - 1]).filter(i => i.level === 'err');
    const pend = Object.values(store.requests).filter(q => q.status === 'attesa').sort((a, b) => a.ts - b.ts);
    const next = Array.from({ length: 21 }, (_, i) => addDays(tm, i));
    const nextIss = validate(next[0], next[next.length - 1]).filter(i => i.level === 'err');
    const bad = new Set(nextIss.map(i => i.date));
    const g = { M: [], P: [], N: [] }; for (const o of store.ops()) { const c = store.cell(o.id, tm); if (!c || !c.s) continue; const s = shiftInfo(c.s); if ((s.cnt || []).some(k => k === 'tm' || k === 'dm')) g.M.push(o); if ((s.cnt || []).some(k => k === 'tp' || k === 'dp')) g.P.push(o); if ((s.cnt || []).includes('tn')) g.N.push(o); }
    el.innerHTML = `<div class="page">
      <div class="hero mb"><div class="row wrap" style="gap:20px"><div class="grow"><div class="small" style="opacity:.75">${store.role === 'admin' ? 'Amministratore' : 'Coordinatore'} · ${esc(store.config.app.title)}</div><h2 style="margin-top:4px">Pannello di controllo</h2><p>${esc(fmtDate(tm, { wd: true, year: true }))}</p></div>
        <div class="row wrap"><button class="btn" data-go="modifica">${ic('edit_calendar')}Modifica turni</button><button class="btn" data-go="bozza">${ic('auto_awesome')}Bozza automatica</button><button class="btn" data-go="stampe">${ic('print')}Stampe</button></div></div></div>
      ${store.adapter.kind !== 'cloud' ? `<div class="note warn mb">${ic('cloud_off')}<div><b>Archivio locale.</b> I turni sono salvati solo su questo dispositivo: per condividerli con tutti gli operatori collega il cloud in <a href="#/impostazioni">Impostazioni</a>.</div></div>` : ''}
      <div class="grid g4 mb">
        ${kpi('Richieste in attesa', pend.length, pend.length ? 'da approvare o rifiutare' : 'tutto gestito', pend.length ? 'var(--brand)' : 'var(--ok)', 'inbox')}
        ${kpi('Problemi ' + MONTHS[m].toLowerCase(), iss.length, 'coperture, doppioni, regole', iss.length ? 'var(--err)' : 'var(--ok)', 'fact_check')}
        ${kpi('Modifiche in bozza', store.pendingCount(), 'non ancora pubblicate', '#4f46e5', 'edit_note')}
        ${kpi('Operatori attivi', store.ops().length, `${store.config.operators.length - store.ops().length} disattivati`, '#0891b2', 'group')}
      </div>
      <div class="grid g3 mb">
        <div class="card"><div class="card-h"><span class="ms ico">badge</span><h3 class="grow">Oggi in servizio</h3><a class="btn sm ghost" href="#/servizio">Dettagli</a></div><div class="card-b col">
          ${[['Mattina', g.M, '#2563eb', cov.tm], ['Pomeriggio', g.P, '#ea580c', cov.tp], ['Notte', g.N, '#4338ca', cov.tn]].map(([l, list, c, n]) => `<div class="row"><b style="width:94px;color:${c}">${l}</b><span class="grow">${list.map(o => opChip(o.id)).join(' ') || '<span class="neg b">scoperto</span>'}</span>${n === 1 ? ic('check_circle', 'pos') : ic('error', 'neg')}</div>`).join('')}
          <div class="row" style="border-top:1px solid var(--line);padding-top:10px"><b style="width:94px;color:#db2777">Reperibile</b><span class="grow small">${bands.map((b, i) => `${b.from}: <b>${esc(store.opName(r[i], true) || '—')}</b>`).join(' · ')}</span></div></div></div>
        <div class="card" style="grid-column:span 2"><div class="card-h"><span class="ms ico">calendar_view_week</span><h3 class="grow">Prossime 3 settimane</h3><a class="btn sm ghost" href="#/controlli">Controlli</a></div><div class="card-b"><div class="row wrap" style="gap:6px">${next.map(d => `<a href="#/servizio?d=${d}" title="${esc(nextIss.filter(i => i.date === d).map(i => i.msg).join('\n'))}" style="text-decoration:none;width:54px;border-radius:10px;padding:6px 0;text-align:center;background:${bad.has(d) ? 'var(--err-soft)' : 'var(--ok-soft)'};color:${bad.has(d) ? 'var(--err)' : 'var(--ok)'};border:1px solid ${d === tm ? 'var(--accent)' : 'transparent'}"><div class="tiny b">${WD[dow(d)]}</div><div style="font-family:var(--font-num);font-size:18px;font-weight:700">${+d.slice(8)}</div>${ic(bad.has(d) ? 'error' : 'check')}</a>`).join('')}</div>
          ${nextIss.length ? `<div class="small neg mt">${esc(nextIss.slice(0, 3).map(i => i.msg).join(' · '))}${nextIss.length > 3 ? ` e altri ${nextIss.length - 3}` : ''}</div>` : '<div class="small pos mt">Tutte le coperture sono a posto.</div>'}</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><span class="ms ico">inbox</span><h3 class="grow">Richieste in attesa</h3><a class="btn sm ghost" href="#/gestione-richieste">Tutte</a></div><div class="card-b flush">${pend.slice(0, 6).map(q => `<div class="list-i click" data-req>${avatar(q.op)}<span class="grow"><b>${esc((TYPES[q.type] || {}).label || q.type)}</b><div class="small muted">${esc(store.opName(q.op))} · ${esc(fmtDate(q.from))}${q.to && q.to !== q.from ? ' → ' + esc(fmtDate(q.to)) : ''}</div></span><span class="small muted">${relTime(q.ts)}</span></div>`).join('') || `<div class="empty" style="padding:22px">${ic('task_alt')}Nessuna richiesta in attesa</div>`}</div></div>
        <div class="card"><div class="card-h"><span class="ms ico">history</span><h3 class="grow">Ultime modifiche</h3><a class="btn sm ghost" href="#/storico">Storico</a></div><div class="card-b flush" id="lastlog"><div class="empty" style="padding:22px">Caricamento…</div></div></div>
      </div></div>`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
    el.querySelectorAll('[data-req]').forEach(b => b.onclick = () => ctx.go('gestione-richieste'));
    const log = Object.values(await store.getLog()).sort((a, b) => b.ts - a.ts).slice(0, 8);
    const ll = el.querySelector('#lastlog'); if (ll) ll.innerHTML = log.map(l => `<div class="list-i"><span class="ms" style="color:var(--muted)">${l.kind === 'rep' ? 'phone_in_talk' : l.kind === 'config' ? 'settings' : 'edit_calendar'}</span><span class="grow small">${l.kind === 'cell' ? `${opChip(l.op)} ${esc(fmtShort(l.date))}: ${esc(shortCell(l.before))} → <b>${esc(shortCell(l.after))}</b>` : l.kind === 'rep' ? `Reperibilità ${esc(fmtShort(l.date))}` : esc(l.note || 'Impostazioni')}</span><span class="tiny muted nowrap">${esc(l.by || '')} · ${relTime(l.ts)}</span></div>`).join('') || `<div class="empty" style="padding:22px">${ic('history')}Nessuna modifica</div>`;
  };
  draw();
  return store.on(w => { if (['cells', 'requests', 'config'].includes(w)) draw(); });
}

// ══ BOZZA AUTOMATICA (intelligente) ═════════════════════════════════════
export function generator(el, params, ctx) {
  if (!guard(el, ctx, 'bozza')) return;
  let mi = curM() + (new Date().getDate() > 15 ? 1 : 0); if (mi > 12) mi = 12;
  const roles = {}; let roleMonth = -1;
  let opts = { onlyEmpty: true, keepAbs: true, rep: 'eq', weekendDiurni: 'ripo', optimize: true, respectAvail: true, pendingRequests: true };
  let result = null;
  const LN = ['rossa', 'verde', 'blu', 'arancio', 'fucsia'];
  const draw = () => {
    const [y, m] = ymOf(mi); const days = monthDays(y, m);
    if (roleMonth !== mi) { for (const o of store.ops()) { const r = detectRole(o.id, days[0]); roles[o.id] = r.startsWith('L') ? 'AUTO' : r; } roleMonth = mi; result = null; }
    const per = coverageWant().tm;
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Bozza automatica del mese</h2><p>I turnisti seguono il ciclo a 5 linee (${cycle().join(' → ')}): l’algoritmo sceglie la linea migliore per ognuno (${per > 1 ? per + ' operatori per linea' : 'un operatore per linea'}) tenendo conto di assenze, disponibilità, richieste in attesa, continuità col mese prima ed equità. La bozza va in “Modifica turni”: controlli, ritocchi e pubblichi.</p></div><div class="acts">${monthSel(mi)}</div></div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) 360px;gap:16px" id="gg">
      <div class="card"><div class="card-h"><span class="ms ico">groups</span><h3 class="grow">Ruolo di ogni operatore</h3><button class="btn sm" id="allauto">${ic('auto_awesome')}Tutti i turnisti in automatico</button></div><div class="card-b flush" style="max-height:62vh;overflow:auto">
        ${store.ops().map(o => { const v = roles[o.id]; const ln = result && result.lines[o.id] != null && (v === 'AUTO' || v.startsWith('L')) ? result.lines[o.id] : (v.startsWith('L') ? +v[1] : null); return `<div class="list-i">${avatar(o.id)}<span class="grow"><b>${esc(o.name)} ${esc(cap1(o.surname))}</b><div class="small muted">ultimo: ${(() => { for (let k = 1; k <= 3; k++) { const d = addDays(days[0], -k); const c = store.cell(o.id, d); if (c && (c.s || c.a)) return esc(fmtShort(d) + ' ' + shortCell(c)); } return '—'; })()}${ln != null ? ` · <b style="color:${LINE_COLORS[ln]}">linea ${ln + 1}</b>` : ''}</div></span>
          <select class="inp sm" data-op="${o.id}" style="width:230px"><option value="AUTO" ${v === 'AUTO' ? 'selected' : ''}>Turnista · linea automatica</option>${[0, 1, 2, 3, 4].map(l => `<option value="L${l}" ${v === 'L' + l ? 'selected' : ''}>Turnista · linea ${l + 1} (${LN[l]})</option>`).join('')}<option value="DA" ${v === 'DA' ? 'selected' : ''}>Diurno · settimane M/P alternate</option><option value="DM" ${v === 'DM' ? 'selected' : ''}>Diurno · solo mattine</option><option value="DP" ${v === 'DP' ? 'selected' : ''}>Diurno · solo pomeriggi</option><option value="skip" ${v === 'skip' ? 'selected' : ''}>Non generare</option></select>
          <span style="width:14px;height:14px;border-radius:4px;background:${ln != null ? LINE_COLORS[ln] : 'transparent'}"></span></div>`; }).join('')}</div></div>
      <div class="col" style="gap:16px"><div class="card"><div class="card-h"><span class="ms ico">tune</span><h3>Opzioni</h3></div><div class="card-b col">
        <label class="chk"><input type="checkbox" data-o="optimize" ${opts.optimize ? 'checked' : ''}>Ottimizza le linee (anche quelle scelte a mano)</label>
        <label class="chk"><input type="checkbox" data-o="respectAvail" ${opts.respectAvail ? 'checked' : ''}>Rispetta le disponibilità (impossibile, solo mattina/pomeriggio)</label>
        <label class="chk"><input type="checkbox" data-o="pendingRequests" ${opts.pendingRequests ? 'checked' : ''}>Tieni libere le ferie e i permessi chiesti e non ancora approvati</label>
        <label class="chk"><input type="checkbox" data-o="onlyEmpty" ${opts.onlyEmpty ? 'checked' : ''}>Riempi solo le caselle vuote</label>
        <label class="chk"><input type="checkbox" data-o="keepAbs" ${opts.keepAbs ? 'checked' : ''}>Non toccare i giorni di assenza</label>
        <label class="field">Reperibilità (/R)<select class="inp" data-s="rep"><option value="eq" ${opts.rep === 'eq' ? 'selected' : ''}>Equa: a chi ne ha fatte meno nell’anno</option><option value="mat" ${opts.rep === 'mat' ? 'selected' : ''}>Al turnista di mattina</option><option value="no" ${opts.rep === 'no' ? 'selected' : ''}>Non assegnare</option></select></label>
        <label class="field">Diurni nel weekend<select class="inp" data-s="weekendDiurni"><option value="ripo" ${opts.weekendDiurni === 'ripo' ? 'selected' : ''}>Riposo</option><option value="work" ${opts.weekendDiurni === 'work' ? 'selected' : ''}>Lavorano come in settimana</option></select></label>
        <button class="btn lg" id="calc">${ic('psychology')}Calcola la soluzione migliore</button>
        <button class="btn pri lg" id="gen" ${result ? '' : 'disabled'}>${ic('auto_awesome')}Crea la bozza</button></div></div>
        <div class="card"><div class="card-h"><span class="ms ico">insights</span><h3>Punteggio</h3></div><div class="card-b" id="score">${result ? scoreHtml(result) : '<div class="small muted">Premi “Calcola” per vedere la proposta e il punteggio.</div>'}</div></div></div></div>
      <div class="card mt"><div class="card-h"><span class="ms ico">preview</span><h3>Anteprima</h3></div><div class="card-b" style="overflow:auto" id="prev">${result ? previewHtml(y, m, result) : '<div class="small muted">L’anteprima compare dopo il calcolo.</div>'}</div></div></div>`;
    if (innerWidth < 1000) el.querySelector('#gg').style.gridTemplateColumns = '1fr';
    el.querySelector('#msel').onchange = e => { mi = +e.target.value; draw(); };
    el.querySelectorAll('[data-op]').forEach(s => s.onchange = () => { roles[s.dataset.op] = s.value; result = null; draw(); });
    el.querySelectorAll('[data-o]').forEach(c => c.onchange = () => { opts[c.dataset.o] = c.checked; result = null; draw(); });
    el.querySelectorAll('[data-s]').forEach(c => c.onchange = () => { opts[c.dataset.s] = c.value; result = null; draw(); });
    el.querySelector('#allauto').onclick = () => { for (const o of store.ops()) if (roles[o.id].startsWith('L')) roles[o.id] = 'AUTO'; result = null; draw(); };
    el.querySelector('#calc').onclick = () => {
      const b = el.querySelector('#calc'); b.disabled = true; b.innerHTML = 'Calcolo in corso…';
      setTimeout(() => { result = build(y, m, roles, opts); draw(); toast(result.summary.gaps ? `Proposta pronta: restano ${result.summary.gaps} buchi di copertura` : 'Proposta pronta: tutte le fasce coperte'); }, 30);
    };
    el.querySelector('#gen').onclick = () => { if (!result || !result.changes.length) return toast('Niente da generare con queste opzioni', 'warn'); store.stage(result.changes, 'Bozza automatica'); toast(`Bozza creata: ${result.changes.length} caselle`); ctx.go('modifica', { m: mi }); };
  };
  const scoreHtml = r => { const s = r.summary; return `<div class="score"><div><b class="${s.gaps ? 'neg' : 'pos'}">${s.gaps}</b><small>buchi di copertura</small></div><div><b class="${s.conflicts ? 'neg' : 'pos'}">${s.conflicts}</b><small>conflitti con assenze</small></div><div><b>${s.changedLines}</b><small>cambi di linea</small></div><div><b>${s.repSpread}</b><small>scarto reperibilità</small></div></div>${r.conflicts.length ? `<div class="small muted mt">Lasciati vuoti: ${r.conflicts.slice(0, 6).map(c => esc(store.opName(c.op, true) + ' ' + fmtShort(c.d))).join(', ')}${r.conflicts.length > 6 ? '…' : ''}</div>` : ''}`; };
  function previewHtml(y, m, r) {
    const map = new Map(r.changes.map(c => [c.key, c.val])); const days = monthDays(y, m); const want = coverageWant();
    return `<table class="xl" style="font-size:11px"><thead><tr><th style="background:#ccccff">g.</th>${store.ops().map(o => `<th style="background:${o.color};color:#fff;padding:2px 6px">${esc(o.surname.slice(0, 8))}</th>`).join('')}<th>TM</th><th>TP</th><th>TN</th></tr></thead><tbody>${days.map(d => {
      const cov = { tm: 0, tp: 0, tn: 0 };
      const tds = store.ops().map(o => { const c = map.get(o.id + '|' + d) || store.cell(o.id, d); const s = c && c.s ? shiftInfo(c.s) : null; (s && s.cnt || []).forEach(k => { if (k in cov) cov[k]++; }); const st = shiftStyle(c, d); const a = absStyle(c); return `<td style="background:${a && !(c && c.s) ? a.bg : st.bg};color:${a && !(c && c.s) ? a.fg : st.fg};font-weight:700;${map.has(o.id + '|' + d) ? 'outline:2px dashed #1f4bd8;outline-offset:-2px' : ''};width:52px">${esc(c ? (c.s || (a ? a.t : '')) : '')}</td>`; }).join('');
      return `<tr class="${dow(d) === 0 ? 'dom' : ''}"><td style="color:#00f;font-weight:700;background:${dow(d) === 0 ? '#ccff33' : '#ccccff'}">${+d.slice(8)} ${WD[dow(d)]}</td>${tds}${['tm', 'tp', 'tn'].map(k => `<td style="background:${cov[k] === want[k] ? '#00B050' : cov[k] > want[k] ? '#FFC000' : '#FF5050'};color:#fff">${cov[k]}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table><div class="small muted mt">Le caselle tratteggiate sono quelle che verranno scritte nella bozza.</div>`;
  }
  draw();
}

// ══ DA CONTROLLARE ═══════════════════════════════════════════════════════
export function checks(el, params, ctx) {
  if (!guard(el, ctx, 'controlli')) return;
  let mi = curM(), lvl = 'err+warn', cat = '';
  const draw = () => {
    const [y, m] = mi === 99 ? [Y(), 0] : ymOf(mi); const days = mi === 99 ? rangeDays(`${Y()}-01-01`, `${Y()}-12-31`) : monthDays(y, m);
    const all = validate(days[0], days[days.length - 1]);
    const list = all.filter(i => (lvl === 'all' || (lvl === 'err' ? i.level === 'err' : i.level !== 'info')) && (!cat || i.cat === cat));
    const cats = [...new Set(all.map(i => i.cat))];
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Da controllare</h2><p>Coperture (una mattina, un pomeriggio, una notte), doppioni, reperibilità, smonto dopo la notte, riposo minimo, giorni consecutivi, codici sconosciuti, caselle vuote.</p></div>
      <div class="acts"><select class="inp" id="msel2" style="width:auto">${MONTHS.map((mm, i) => `<option value="${i}" ${mi === i ? 'selected' : ''}>${mm}</option>`).join('')}<option value="12" ${mi === 12 ? 'selected' : ''}>Gennaio ${Y() + 1}</option><option value="99" ${mi === 99 ? 'selected' : ''}>Tutto l’anno</option></select>
      <select class="inp" id="lvl" style="width:auto"><option value="err" ${lvl === 'err' ? 'selected' : ''}>Solo errori</option><option value="err+warn" ${lvl === 'err+warn' ? 'selected' : ''}>Errori e avvisi</option><option value="all" ${lvl === 'all' ? 'selected' : ''}>Tutto (anche caselle vuote)</option></select>
      <select class="inp" id="cat" style="width:auto"><option value="">Tutte le categorie</option>${cats.map(c => `<option ${cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
      <div class="row wrap mb">${cats.map(c => { const n = all.filter(i => i.cat === c).length; const e = all.some(i => i.cat === c && i.level === 'err'); return `<span class="pill ${e ? 'err' : 'warn'}">${esc(c)}: ${n}</span>`; }).join('') || `<span class="pill ok">${ic('verified')}Nessun problema</span>`}</div>
      <div class="card">${list.length ? list.slice(0, 600).map(i => `<div class="list-i click" data-d="${i.date}"><span class="ms" style="color:${i.level === 'err' ? 'var(--err)' : i.level === 'warn' ? 'var(--warn)' : 'var(--faint)'}">${i.level === 'err' ? 'error' : i.level === 'warn' ? 'warning' : 'info'}</span><span class="pill">${esc(i.cat)}</span><span class="grow">${esc(i.msg)}</span>${ic('chevron_right')}</div>`).join('') : `<div class="empty">${ic('verified')}Nessun problema con questi filtri</div>`}</div></div>`;
    el.querySelector('#msel2').onchange = e => { mi = +e.target.value; draw(); };
    el.querySelector('#lvl').onchange = e => { lvl = e.target.value; draw(); };
    el.querySelector('#cat').onchange = e => { cat = e.target.value; draw(); };
    el.querySelectorAll('[data-d]').forEach(r => r.onclick = () => ctx.go('modifica', { d: r.dataset.d }));
  };
  draw();
  return store.on(w => { if (w === 'cells') draw(); });
}

// ══ OPERATORI ════════════════════════════════════════════════════════════
export function operators(el, params, ctx) {
  if (!guard(el, ctx, 'operatori')) return;
  const draw = () => {
    const all = store.ops(true);
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Operatori</h2><p>Ordine delle colonne, colori delle intestazioni, ruolo, ore di contratto, spettanze di ferie e permessi, saldo iniziale, PIN personale.</p></div><div class="acts"><button class="btn pri" id="add">${ic('person_add')}Nuovo operatore</button></div></div>
      <div class="card"><table class="tbl"><thead><tr><th></th><th>Operatore</th><th>Etichetta</th><th class="r">Ore/sett.</th><th class="r">Ferie</th><th class="r">Perm. gg/h</th><th class="r">Saldo iniziale</th><th>PIN</th><th>Stato</th><th></th></tr></thead><tbody>
      ${all.map((o, i) => `<tr style="${o.active === false ? 'opacity:.5' : ''}"><td class="nowrap"><button class="ibtn" data-up="${o.id}" ${i === 0 ? 'disabled' : ''}>${ic('arrow_upward')}</button><button class="ibtn" data-dn="${o.id}" ${i === all.length - 1 ? 'disabled' : ''}>${ic('arrow_downward')}</button></td>
        <td><div class="row">${avatar(o.id)}<div><b>${esc(o.name)} ${esc(cap1(o.surname))}</b><div class="small muted">${esc(o.phone || '')}${o.email ? ' · ' + esc(o.email) : ''}</div></div></div></td><td class="small">${esc(o.label || '')}</td>
        <td class="r num">${hm(o.weeklyMin || store.profile.weeklyMin)}</td><td class="r num">${o.params.ferie}${o.params.ferieAP ? ` <span class="muted">+${o.params.ferieAP}</span>` : ''}</td><td class="r num">${o.params.permGg} / ${o.params.permOre}</td><td class="r num">${hm(o.initBalance || 0, { plus: true })}</td>
        <td>${o.pinHash ? `<span class="pill ok">${ic('lock')}sì</span>` : '<span class="pill">no</span>'}</td><td>${o.active === false ? '<span class="pill">disattivato</span>' : '<span class="pill ok">attivo</span>'}</td><td><button class="btn sm" data-ed="${o.id}">${ic('edit')}Modifica</button></td></tr>`).join('')}</tbody></table></div></div>`;
    el.querySelector('#add').onclick = () => edit(null);
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => edit(b.dataset.ed));
    const move = async (id, dir) => { const list = store.ops(true); const i = list.findIndex(o => o.id === id); const j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; list.forEach((o, k) => o.order = k); await store.saveConfig({ operators: store.config.operators }, 'Ordine operatori'); };
    el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1));
    el.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => move(b.dataset.dn, 1));
    if (params.op) { const id = params.op; params.op = null; setTimeout(() => edit(id), 50); }
  };
  function edit(id) {
    const o = id ? deepClone(store.op(id)) : { id: '', surname: '', name: '', label: '', color: OPERATOR_PALETTE[store.config.operators.length % OPERATOR_PALETTE.length], role: 'T', active: true, weeklyMin: store.profile.weeklyMin, params: Object.assign({}, store.profile.defaults), initBalance: 0, prevWeek: 0, phone: '', email: '' };
    const m = modal({
      title: id ? `${o.name} ${cap1(o.surname)}` : 'Nuovo operatore', icon: 'manage_accounts', size: 'wide', foot: '',
      body: `<div class="col"><div class="grid g3"><label class="field">Cognome<input class="inp" id="sur" value="${esc(o.surname)}"></label><label class="field">Nome<input class="inp" id="nam" value="${esc(o.name)}"></label><label class="field">Etichetta sopra il nome <span class="hint">es. medico abbinato</span><input class="inp" id="lab" value="${esc(o.label || '')}"></label></div>
      <div class="grid g3"><label class="field">Colore intestazione<div class="row"><input class="inp" type="color" id="col" value="${o.color}"><div class="row wrap" style="gap:4px">${OPERATOR_PALETTE.map(c => `<button type="button" data-c="${c}" style="width:20px;height:20px;border-radius:5px;border:1px solid #0002;background:${c}"></button>`).join('')}</div></div></label><label class="field">Telefono<input class="inp" id="tel" value="${esc(o.phone || '')}"></label><label class="field">Email<input class="inp" id="eml" value="${esc(o.email || '')}"></label></div>
      <div class="sec-t" style="margin:6px 0 0">Contratto e spettanze ${Y()}</div>
      <div class="grid g4"><label class="field">Ore settimanali<input class="inp" id="wk" value="${hm(o.weeklyMin || store.profile.weeklyMin)}"></label><label class="field">Ferie (giorni)<input class="inp" type="number" id="fe" value="${o.params.ferie}"></label><label class="field">Residuo anno prec.<input class="inp" type="number" id="fap" value="${o.params.ferieAP || 0}"></label><label class="field">Permessi (giorni)<input class="inp" type="number" id="pg" value="${o.params.permGg}"></label></div>
      <div class="grid g4"><label class="field">Permessi (ore)<input class="inp" type="number" id="po" value="${o.params.permOre}"></label><label class="field">Saldo ore iniziale<input class="inp" id="ib" value="${hm(o.initBalance || 0)}"></label><label class="field">Ore settimana a cavallo <span class="hint">giorni di dicembre</span><input class="inp" id="pw" value="${hm(o.prevWeek || 0)}"></label><label class="field">In servizio dal <span class="hint">vuoto = da sempre</span><input class="inp" type="date" id="ofrom" value="${o.from || ''}"></label><label class="field">Fino al <span class="hint">vuoto = in servizio</span><input class="inp" type="date" id="oto" value="${o.to || ''}"></label><label class="field">Stato<select class="inp" id="act"><option value="1" ${o.active !== false ? 'selected' : ''}>Attivo</option><option value="0" ${o.active === false ? 'selected' : ''}>Disattivato (nascosto)</option></select></label></div>
      <div class="sec-t" style="margin:6px 0 0">PIN personale</div>
      <div class="row wrap"><input class="inp" id="pin" inputmode="numeric" maxlength="4" placeholder="4 cifre" style="width:120px"><span class="small muted">${o.pinHash ? 'Il PIN è impostato: scrivine uno nuovo per cambiarlo.' : 'Facoltativo: se impostato serve per entrare come questo operatore.'}</span>${o.pinHash ? '<button class="btn sm" id="nopin">Togli il PIN</button>' : ''}</div></div>`
    });
    const v = s => m.body.querySelector(s);
    m.body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => v('#col').value = b.dataset.c);
    let removePin = false; const np = v('#nopin'); if (np) np.onclick = () => { removePin = true; np.textContent = 'PIN tolto (salva)'; };
    m.foot.innerHTML = `${id ? `<button class="btn" data-del style="color:var(--err)">${ic('delete')}Elimina</button>` : ''}<span class="sp"></span><button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('save')}Salva</button>`;
    m.foot.querySelector('[data-c]').onclick = () => m.close();
    const del = m.foot.querySelector('[data-del]');
    if (del) del.onclick = async () => { if (!await confirmBox('Eliminare l’operatore?', 'I suoi turni restano nell’archivio ma la colonna sparisce. Per nasconderlo temporaneamente usa “Disattivato”.', { danger: true, ok: 'Elimina' })) return; await store.saveConfig({ operators: store.config.operators.filter(x => x.id !== id) }, 'Operatore eliminato'); m.close(); };
    m.foot.querySelector('[data-o]').onclick = async () => {
      const sur = v('#sur').value.trim().toUpperCase(), nam = v('#nam').value.trim();
      if (!sur) return toast('Il cognome è obbligatorio', 'warn');
      Object.assign(o, { surname: sur, name: cap(nam), label: v('#lab').value.trim(), color: v('#col').value, phone: v('#tel').value.trim(), email: v('#eml').value.trim(), active: v('#act').value === '1', from: v('#ofrom').value || undefined, to: v('#oto').value || undefined, weeklyMin: parseHM(v('#wk').value) || store.profile.weeklyMin, initBalance: parseHM(v('#ib').value) || 0, prevWeek: parseHM(v('#pw').value) || 0 });
      o.params = { ferie: +v('#fe').value || 0, ferieAP: +v('#fap').value || 0, permGg: +v('#pg').value || 0, permOre: +v('#po').value || 0 };
      if (!id) { o.id = sur.toLowerCase().replace(/[^a-z0-9]/g, '') || uid('op'); if (store.op(o.id)) o.id += '-' + uid().slice(-3); o.order = store.config.operators.length; }
      const pin = v('#pin').value.trim(); if (/^\d{4}$/.test(pin)) o.pinHash = await hashPass(pin); else if (pin) return toast('Il PIN deve avere 4 cifre', 'warn');
      if (removePin) delete o.pinHash;
      const list = id ? store.config.operators.map(x => x.id === id ? o : x) : store.config.operators.concat(o);
      await store.saveConfig({ operators: list }, id ? 'Operatore modificato: ' + sur : 'Nuovo operatore: ' + sur);
      m.close(); toast('Operatore salvato');
    };
  }
  draw();
  return store.on(w => { if (w === 'config') draw(); });
}

// ══ CODICI, ORARI E REGOLE ═══════════════════════════════════════════════
export function codes(el, params, ctx) {
  if (!guard(el, ctx, 'codici')) return;
  let tab = 'turni';
  const draw = () => {
    const sh = shiftList(), ab = absList(), bands = repBands(), rules = store.config.rules;
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Codici, orari e regole</h2><p>Ore conteggiate, orari, contatori di copertura e colori: modificandoli si aggiornano subito calendario, conteggi e controlli.</p></div>
      <div class="acts"><div class="tabs">${[['turni', 'Turni', 'schedule'], ['assenze', 'Assenze', 'event_busy'], ['rep', 'Fasce reperibilità', 'phone_in_talk'], ['regole', 'Regole', 'rule']].map(([k, l, i]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${ic(i)}${l}</button>`).join('')}</div></div></div><div id="body"></div></div>`;
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const body = el.querySelector('#body');
    if (tab === 'turni') {
      body.innerHTML = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Codice</th><th>Descrizione</th><th>Tipo</th><th>Ore</th><th>Dalle</th><th>Alle</th><th>Conta come</th><th>Reperib.</th><th></th></tr></thead><tbody>
        ${sh.map((s, i) => `<tr data-i="${i}"><td>${chipFor({ s: s.code }, '2026-01-02')}</td><td><input class="inp sm" data-f="label" value="${esc(s.label)}"></td><td><select class="inp sm" data-f="group">${[['T', 'Turnista'], ['D', 'Diurno'], ['R', 'Riposo'], ['X', 'Solo reperib.']].map(([k, l]) => `<option value="${k}" ${s.group === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><input class="inp sm" data-f="min" value="${hm(s.min)}" style="width:70px"></td><td><input class="inp sm" data-f="from" value="${s.from || ''}" style="width:72px"></td><td><input class="inp sm" data-f="to" value="${s.to || ''}" style="width:72px"></td>
        <td><div class="row wrap" style="gap:4px">${COVERAGE.map(c => `<label class="chk small" style="gap:4px"><input type="checkbox" data-cnt="${c.key}" ${(s.cnt || []).includes(c.key) ? 'checked' : ''}>${c.short}</label>`).join('')}</div></td><td><input type="checkbox" data-f="rep" ${s.rep ? 'checked' : ''}></td><td><button class="ibtn" data-rm="${i}">${ic('delete')}</button></td></tr>`).join('')}</tbody></table></div>
        <div class="card-b row wrap"><button class="btn" id="addS">${ic('add')}Nuovo codice turno</button><span class="sp"></span><button class="btn" id="rstS">${ic('restart_alt')}Ripristina quelli del file Excel</button><button class="btn pri" id="savS">${ic('save')}Salva</button></div></div>
        <div class="note mt small">${ic('info')}<div>Le ore dei turni sono quelle del foglio CONTEGGI ORARI (POM 7:25, MAT 6:45, NOTT 4:15, SM 7:20, diurni 7:12, MAT+N 11:00, matt+N 11:27). I contatori TM/TP/TN devono valere 1 ogni giorno; DM/DP sono i diurni; RI i riposi diurni.</div></div>`;
      const collect = () => [...body.querySelectorAll('tr[data-i]')].map(tr => { const s = Object.assign({}, sh[+tr.dataset.i]); tr.querySelectorAll('[data-f]').forEach(inp => { const f = inp.dataset.f; if (f === 'min') s.min = parseHM(inp.value) || 0; else if (f === 'rep') s.rep = inp.checked; else s[f] = inp.value.trim() || undefined; }); s.cnt = [...tr.querySelectorAll('[data-cnt]:checked')].map(c => c.dataset.cnt); return s; });
      body.querySelector('#savS').onclick = async () => { await store.saveConfig({ shifts: collect() }, 'Codici turno'); toast('Codici salvati'); };
      body.querySelector('#rstS').onclick = async () => { if (await confirmBox('Ripristinare i codici?', 'Tornano i codici e le ore del file Excel.')) { await store.saveConfig({ shifts: null }, 'Codici turno ripristinati'); toast('Ripristinati'); } };
      body.querySelector('#addS').onclick = async () => { const c = await promptBox('Nuovo codice turno', { label: 'Codice (come lo scrivi nel foglio)' }); if (!c) return; await store.saveConfig({ shifts: collect().concat({ code: c.trim(), label: c.trim(), group: 'D', min: 432, cnt: [] }) }, 'Nuovo codice ' + c); };
      body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { const l = collect(); l.splice(+b.dataset.rm, 1); await store.saveConfig({ shifts: l }, 'Codice rimosso'); });
    }
    if (tab === 'assenze') {
      body.innerHTML = `<div class="card"><table class="tbl"><thead><tr><th>Codice</th><th>Descrizione</th><th>Sfondo</th><th>Testo</th><th>Conteggio</th><th></th></tr></thead><tbody>
        ${ab.map((a, i) => `<tr data-i="${i}"><td><b style="background:${a.bg};color:${a.fg};padding:2px 8px;border-radius:4px">${esc(a.code)}</b></td><td><input class="inp sm" data-f="label" value="${esc(a.label)}"></td><td><input class="inp" type="color" data-f="bg" value="${a.bg}"></td><td><input class="inp" type="color" data-f="fg" value="${a.fg}"></td><td><select class="inp sm" data-f="kind">${[['ferie', 'Ferie'], ['ferieAP', 'Ferie anno prec.'], ['perm', 'Permesso'], ['mal', 'Malattia'], ['rec', 'Recupero'], ['fest', 'Festività'], ['altro', 'Altro']].map(([k, l]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><button class="ibtn" data-rm="${i}">${ic('delete')}</button></td></tr>`).join('')}</tbody></table>
        <div class="card-b row wrap"><button class="btn" id="addA">${ic('add')}Nuovo codice assenza</button><span class="sp"></span><button class="btn" id="rstA">${ic('restart_alt')}Ripristina</button><button class="btn pri" id="savA">${ic('save')}Salva</button></div></div>`;
      const collect = () => [...body.querySelectorAll('tr[data-i]')].map(tr => { const a = Object.assign({}, ab[+tr.dataset.i]); tr.querySelectorAll('[data-f]').forEach(inp => a[inp.dataset.f] = inp.value); return a; });
      body.querySelector('#savA').onclick = async () => { await store.saveConfig({ absences: collect() }, 'Codici assenza'); toast('Salvati'); };
      body.querySelector('#rstA').onclick = async () => { await store.saveConfig({ absences: null }, 'Codici assenza ripristinati'); };
      body.querySelector('#addA').onclick = async () => { const c = await promptBox('Nuovo codice assenza', { label: 'Codice (lettera)' }); if (!c) return; await store.saveConfig({ absences: collect().concat({ code: c.trim(), label: c.trim(), bg: '#dddddd', fg: '#333333', kind: 'altro' }) }, 'Nuova assenza ' + c); };
      body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { const l = collect(); l.splice(+b.dataset.rm, 1); await store.saveConfig({ absences: l }, 'Assenza rimossa'); });
    }
    if (tab === 'rep') {
      body.innerHTML = `<div class="card"><div class="card-b col"><div class="small muted">Le prime due fasce sono del giorno dopo quello con /R (00-07 e 07-13), le ultime due dello stesso giorno (13-20 e 20-24).</div>
        ${bands.map((b, i) => `<div class="grid g3" data-i="${i}"><label class="field">Fascia ${i + 1}<input class="inp" data-f="label" value="${esc(b.label)}"></label><label class="field">Dalle / alle<div class="row"><input class="inp" data-f="from" value="${b.from}"><input class="inp" data-f="to" value="${b.to}"></div></label><label class="field">Ore conteggiate<input class="inp" data-f="min" value="${hm(b.min)}"></label></div>`).join('')}
        <div class="row"><span class="sp"></span><button class="btn" id="rstR">Ripristina</button><button class="btn pri" id="savR">${ic('save')}Salva</button></div></div></div>`;
      body.querySelector('#savR').onclick = async () => { const l = [...body.querySelectorAll('[data-i]')].map(r => { const b = Object.assign({}, bands[+r.dataset.i]); r.querySelectorAll('[data-f]').forEach(inp => b[inp.dataset.f] = inp.dataset.f === 'min' ? parseHM(inp.value) || 0 : inp.value); return b; }); await store.saveConfig({ repBands: l }, 'Fasce reperibilità'); toast('Salvate'); };
      body.querySelector('#rstR').onclick = async () => { await store.saveConfig({ repBands: null }, 'Fasce ripristinate'); };
    }
    if (tab === 'regole') {
      body.innerHTML = `<div class="card"><div class="card-b col" style="max-width:640px">
        <label class="chk"><input type="checkbox" id="r1" ${rules.requireCoverage !== false ? 'checked' : ''}>Controlla le coperture giornaliere (1 mattina, 1 pomeriggio, 1 notte)</label>
        <label class="chk"><input type="checkbox" id="r2" ${rules.nightThenSmonto !== false ? 'checked' : ''}>Dopo la notte deve esserci lo smonto (SM)</label>
        <div class="grid g2"><label class="field">Riposo minimo tra due turni (ore)<input class="inp" type="number" id="r3" value="${rules.minRestHours || 11}"></label><label class="field">Giorni lavorati di fila al massimo<input class="inp" type="number" id="r4" value="${rules.maxConsecutive || 6}"></label></div>
        <div class="row"><span class="sp"></span><button class="btn pri" id="savRu">${ic('save')}Salva</button></div></div></div>`;
      body.querySelector('#savRu').onclick = async () => { await store.saveConfig({ rules: Object.assign({}, rules, { requireCoverage: body.querySelector('#r1').checked, nightThenSmonto: body.querySelector('#r2').checked, minRestHours: +body.querySelector('#r3').value || 11, maxConsecutive: +body.querySelector('#r4').value || 6 }) }, 'Regole'); toast('Regole salvate'); };
    }
  };
  draw();
  return store.on(w => { if (w === 'config') draw(); });
}

// ══ STAMPE E MODULI ══════════════════════════════════════════════════════
export function prints(el, params, ctx) {
  if (!guard(el, ctx, 'stampe')) return;
  let mi = curM();
  el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Stampe e moduli</h2><p>Documenti pronti per la bacheca e per l’ufficio del personale (si apre la stampa del browser: scegli “Salva come PDF” per il file).</p></div><div class="acts">${monthSel(mi)}</div></div>
    <div class="grid g3">${[
      ['mese', 'calendar_month', 'Turni del mese', 'Il foglio “stampe mensili”: turni di tutti, coperture M/P/N e reperibilità.'],
      ['quadro', 'description', 'Quadro reperibilità', 'Modulo ISS per l’U.O. Personale con le ore di reperibilità per giorno.'],
      ['ore', 'schedule', 'Conteggio ore del mese', 'Ore lavorate, accreditate e saldo settimanale di ogni operatore.'],
      ['ferie', 'beach_access', 'Riepilogo ferie e permessi', 'Saldi di ferie, residui, permessi a giorni e a ore, festivi.'],
      ['personale', 'person', 'Calendario personale annuale', 'Dodici mesi dei turni di un operatore, da consegnare.'],
      ['firme', 'draw', 'Foglio presenze con firme', 'Elenco giornaliero con turno, orario e spazio per la firma.']
    ].map(([k, i, t, d]) => `<div class="card kpi" style="cursor:pointer" data-p="${k}"><span class="k-ico" style="background:var(--accent-soft);color:var(--accent)">${ic(i)}</span><span class="k-l">${t}</span><span class="small muted" style="padding-right:40px;line-height:1.45">${d}</span><span class="btn sm mt" style="width:max-content">${ic('print')}Stampa</span></div>`).join('')}</div></div>`;
  el.querySelector('#msel').onchange = e => mi = +e.target.value;
  el.querySelectorAll('[data-p]').forEach(c => c.onclick = async () => {
    const [y, m] = ymOf(mi); const pa = document.querySelector('#print-area'); const days = monthDays(y, m); const ops = store.ops(); const bands = repBands();
    const head = t => `<div class="ph"><img src="assets/icon-118-192.png"><div><b style="font-size:16px">${esc(t)}</b><div style="font-size:11px">${esc(store.config.app.title)} · ${esc(store.config.app.unit || '')}</div></div></div>`;
    const k = c.dataset.p;
    if (k === 'mese') pa.innerHTML = `<div class="paper">${head(`Turni ${MONTHS[m]} ${y}`)}<table style="margin-top:8px"><thead><tr><th>M</th><th>P</th><th>N</th><th colspan="2"></th>${ops.map(o => `<th style="background:${o.color};color:#fff">${esc(o.surname)}</th>`).join('')}${bands.map(b => `<th style="background:#00b0f0;color:#fff;font-size:8px">${b.from}-${b.to}</th>`).join('')}</tr></thead><tbody>${days.map(d => { const cov = coverage(d); const r = repOf(d); const w = dow(d); return `<tr style="${w === 0 ? 'border-bottom:3px solid #c0c' : ''}"><td style="background:#0f0">${cov.tm + cov.dm}</td><td style="background:#0f0">${cov.tp + cov.dp}</td><td style="background:#0f0">${cov.tn}</td><td style="color:#00f;font-weight:700;${store.isFestivo(d) ? 'background:#0ff' : ''}">${+d.slice(8)}</td><td style="color:#00f;background:${store.isFestivo(d) ? '#0ff' : w === 0 ? '#cf3' : '#ccf'}">${WD[w]}</td>${ops.map(o => { const cc = store.cell(o.id, d); const st = shiftStyle(cc, d); const a = absStyle(cc); return `<td style="background:${a && !(cc && cc.s) ? a.bg : st.bg};color:${a && !(cc && cc.s) ? a.fg : st.fg};font-weight:700">${esc(cc ? (cc.s || (a ? a.t : '')) : '')}</td>`; }).join('')}${r.map(x => `<td style="font-size:8px">${esc(x ? store.op(x).surname : '')}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
    if (k === 'quadro') pa.innerHTML = quadro(y, m);
    if (k === 'ore') pa.innerHTML = `<div class="paper">${head(`Conteggio ore ${MONTHS[m]} ${y}`)}<table style="margin-top:8px"><thead><tr><th>Operatore</th>${(() => { const ws = weeks(ops[0].id, y).filter(w => w.sunday >= days[0] && w.monday <= days[days.length - 1]); return ws.map(w => `<th>sett. ${fmtShort(w.monday)}</th>`).join(''); })()}<th>Saldo a fine mese</th></tr></thead><tbody>${ops.map(o => { const ws = weeks(o.id, y).filter(w => w.sunday >= days[0] && w.monday <= days[days.length - 1]); return `<tr><td style="text-align:left"><b>${esc(o.surname)}</b></td>${ws.map(w => `<td>${hm(w.total)}<br><small>${hm(w.balance)}</small></td>`).join('')}<td><b>${hm(ws.length ? ws[ws.length - 1].balance : 0)}</b></td></tr>`; }).join('')}</tbody></table><div style="font-size:9px;margin-top:6px">Per ogni settimana: ore totali (lavorate + accreditate) e, sotto, il saldo progressivo rispetto alle ${hm(store.profile.weeklyMin)} ore.</div></div>`;
    if (k === 'ferie') pa.innerHTML = `<div class="paper">${head(`Ferie e permessi ${y}`)}<table style="margin-top:8px"><thead><tr><th>Operatore</th><th>Ferie</th><th>Usate</th><th>Rimaste</th><th>Residuo AP</th><th>Rimasto AP</th><th>Perm. gg rimasti</th><th>PN</th><th>Ore perm. rimaste</th><th>Festivi lav.</th><th>Ore fest.</th><th>FNG</th><th>FNL</th><th>Rep.</th><th>Ore rep.</th></tr></thead><tbody>${ops.map(o => { const s = yearStats(o.id, y); return `<tr><td style="text-align:left"><b>${esc(o.surname)}</b></td><td>${s.ferieSpettanti}</td><td>${s.ferieUsate}</td><td class="yel">${s.ferieRestanti}</td><td>${s.ferieAP}</td><td>${s.ferieAPRestanti}</td><td>${s.permGgRestanti}</td><td>${s.pn}</td><td>${s.permOreRestanti}</td><td>${s.festLav}</td><td>${hm(s.oreFestLav)}</td><td>${s.fng}</td><td>${s.fnl}</td><td>${s.rep}</td><td>${Math.round(s.repMin / 60)}</td></tr>`; }).join('')}</tbody></table></div>`;
    if (k === 'personale') { const id = await pickOp(); if (!id) return; const o = store.op(id); pa.innerHTML = `<div class="paper">${head(`Turni ${y} — ${o.name} ${o.surname}`)}<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">${Array.from({ length: 12 }, (_, mm) => `<table><thead><tr><th colspan="3" style="background:#ccf">${MONTHS[mm]}</th></tr></thead><tbody>${monthDays(y, mm).map(d => { const cc = store.cell(id, d); const st = shiftStyle(cc, d); const a = absStyle(cc); return `<tr><td style="color:#00f;width:18px">${+d.slice(8)}</td><td style="width:22px;background:${store.isFestivo(d) ? '#0ff' : dow(d) === 0 ? '#cf3' : '#fff'}">${WD[dow(d)]}</td><td style="background:${a && !(cc && cc.s) ? a.bg : st.bg};color:${a && !(cc && cc.s) ? a.fg : st.fg};font-weight:700">${esc(cc ? (cc.s || (a ? a.t : '')) : '')}</td></tr>`; }).join('')}</tbody></table>`).join('')}</div></div>`; }
    if (k === 'firme') pa.innerHTML = `<div class="paper">${head(`Foglio presenze ${MONTHS[m]} ${y}`)}<table style="margin-top:8px"><thead><tr><th>Giorno</th><th>Operatore</th><th>Turno</th><th>Orario</th><th style="width:180px">Firma</th></tr></thead><tbody>${days.flatMap(d => ops.map(o => ({ d, o, c: store.cell(o.id, d) })).filter(x => x.c && x.c.s && workedMin(x.c) > 0)).map(x => { const s = shiftInfo(x.c.s); return `<tr><td>${fmtShort(x.d)}</td><td style="text-align:left">${esc(x.o.surname)} ${esc(x.o.name)}</td><td><b>${esc(x.c.s)}</b></td><td>${s.from || ''}–${s.to || ''}</td><td style="height:22px"></td></tr>`; }).join('')}</tbody></table></div>`;
    setTimeout(() => print(), 150);
  });
}
function pickOp() {
  return new Promise(res => { const m = modal({ title: 'Scegli l’operatore', icon: 'person', body: `<div class="col">${store.ops().map(o => `<button class="btn" data-o="${o.id}" style="justify-content:flex-start">${avatar(o.id)} ${esc(o.name)} ${esc(cap1(o.surname))}</button>`).join('')}</div>`, onClose: v => res(v || null) }); m.body.querySelectorAll('[data-o]').forEach(b => b.onclick = () => m.close(b.dataset.o)); });
}

// ══ DATI: EXCEL, BACKUP, COPIE ═══════════════════════════════════════════
export function data(el, params, ctx) {
  if (!guard(el, ctx, 'dati')) return;
  const draw = async () => {
    const snaps = await store.listSnapshots().catch(() => []);
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Importa, esporta, backup</h2><p>Il file Excel resta utilizzabile: puoi importarlo quando vuoi, oppure esportare tutto in .xlsx. Le copie di sicurezza permettono di tornare indietro.</p></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><span class="ms ico" style="background:#e3f6ec;color:#138a4b">upload_file</span><h3>Importa dal file Excel</h3></div><div class="card-b col"><div class="small muted">Carica <b>Autisti ${Y()}.xlsm</b> (o un file con lo stesso foglio TURNI). Vengono letti turni, assenze, permessi a ore e la reperibilità; vedi le differenze prima di applicarle.</div>
          <input type="file" id="xf" accept=".xlsx,.xlsm,.xls" class="inp" style="padding:6px"><div id="xres"></div></div></div>
        <div class="card"><div class="card-h"><span class="ms ico" style="background:#e8eefc;color:#1f4bd8">download</span><h3>Esporta</h3></div><div class="card-b col">
          <button class="btn" id="ex1">${ic('table')}Excel completo (.xlsx): turni, ore, riepilogo, reperibilità</button>
          <button class="btn" id="ex2">${ic('data_object')}Backup completo (.json)</button>
          <label class="btn" style="cursor:pointer">${ic('restore')}Ripristina da un backup (.json)<input type="file" id="rf" accept=".json" hidden></label></div></div>
        <div class="card" style="grid-column:1/-1"><div class="card-h"><span class="ms ico">inventory_2</span><h3 class="grow">Copie di sicurezza</h3><button class="btn pri sm" id="snap">${ic('add')}Crea una copia adesso</button></div><div class="card-b flush">
          ${snaps.length ? snaps.map(s => `<div class="list-i">${ic('inventory_2')}<span class="grow"><b>${esc(s.label)}</b><div class="small muted">${stamp(s.ts)} · ${esc(s.by || '')} · ${Math.round(s.size / 1024)} KB</div></span><button class="btn sm" data-rs="${s.id}">${ic('restore')}Ripristina</button><button class="ibtn" data-ds="${s.id}">${ic('delete')}</button></div>`).join('') : `<div class="empty" style="padding:22px">${ic('inventory_2')}Nessuna copia salvata</div>`}</div></div>
      </div></div>`;
    el.querySelector('#xf').onchange = e => importExcel(e.target.files[0], el.querySelector('#xres'), ctx);
    el.querySelector('#ex1').onclick = async () => { try { await exportWorkbook(); toast('File Excel creato'); } catch (e) { toast(e.message, 'err'); } };
    el.querySelector('#ex2').onclick = async () => { download(`backup-turni-${store.profile.key}-${today()}.json`, JSON.stringify(await store.exportAll()), 'application/json'); toast('Backup scaricato'); };
    el.querySelector('#rf').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!await confirmBox('Ripristinare il backup?', `Sostituisce impostazioni, operatori e turni con quelli del file del ${d.at ? stamp(d.at) : '?'}. Prima viene fatta una copia di sicurezza.`, { danger: true, ok: 'Ripristina' })) return; await store.snapshot('Prima del ripristino'); await store.importAll(d); toast('Backup ripristinato'); draw(); } catch (er) { toast('File non valido: ' + er.message, 'err'); } };
    el.querySelector('#snap').onclick = async () => { const l = await promptBox('Nuova copia di sicurezza', { label: 'Descrizione', value: 'Copia del ' + fmtDate(today()) }); if (l == null) return; await store.snapshot(l); toast('Copia salvata'); draw(); };
    el.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => { if (!await confirmBox('Tornare a questa copia?', 'I turni attuali verranno sostituiti (ne viene salvata una copia prima).', { danger: true, ok: 'Ripristina' })) return; await store.snapshot('Prima del ripristino'); await store.restoreSnapshot(b.dataset.rs); toast('Copia ripristinata'); draw(); });
    el.querySelectorAll('[data-ds]').forEach(b => b.onclick = async () => { if (await confirmBox('Eliminare la copia?', '', { danger: true, ok: 'Elimina' })) { await store.deleteSnapshot(b.dataset.ds); draw(); } });
  };
  draw();
}
async function importExcel(file, box, ctx) {
  if (!file) return;
  box.innerHTML = `<div class="note">${ic('hourglass_top')}<div>Lettura di ${esc(file.name)}…</div></div>`;
  try {
    const p = await parseWorkbook(file);
    let fromDate = '', withRep = true;
    const show = () => {
      const ch = diffImport(p, { fromDate: fromDate || null, withRep });
      const cells = ch.filter(c => !c.key.startsWith('rep|')), reps = ch.length - cells.length;
      box.innerHTML = `<div class="note ok">${ic('check_circle')}<div>Foglio <b>${esc(p.sheet)}</b>, anno <b>${p.year}</b>: riconosciuti ${p.ops.length} operatori (${p.ops.map(o => esc(o.name)).join(', ')}).</div></div>
        <div class="row wrap"><label class="field">Solo dal giorno<input class="inp" type="date" id="fd" value="${fromDate}"></label><label class="chk"><input type="checkbox" id="wr" ${withRep ? 'checked' : ''}>Importa anche le cessioni di reperibilità</label></div>
        <div><b>${cells.length}</b> caselle diverse e <b>${reps}</b> giorni di reperibilità da aggiornare.</div>
        ${cells.length ? `<div class="card" style="max-height:260px;overflow:auto"><table class="tbl"><thead><tr><th>Chi</th><th>Giorno</th><th>Ora</th><th>Dal file</th></tr></thead><tbody>${cells.slice(0, 150).map(c => { const [op, d] = c.key.split('|'); return `<tr><td>${opChip(op)}</td><td>${fmtShort(d)}</td><td>${chipFor(c.before, d)}</td><td>${chipFor(c.val, d)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
        <div class="row wrap"><button class="btn" id="asDraft" ${ch.length ? '' : 'disabled'}>${ic('edit_note')}Metti in bozza</button><button class="btn pri" id="asPub" ${ch.length ? '' : 'disabled'}>${ic('publish')}Importa e pubblica</button></div>`;
      box.querySelector('#fd').onchange = e => { fromDate = e.target.value; show(); };
      box.querySelector('#wr').onchange = e => { withRep = e.target.checked; show(); };
      box.querySelector('#asDraft').onclick = () => { store.stage(ch.map(c => ({ key: c.key, val: c.val })), 'Import da Excel'); toast('Differenze in bozza: controlla e pubblica'); ctx.go('modifica'); };
      box.querySelector('#asPub').onclick = async () => { if (!await confirmBox('Importare e pubblicare?', `${ch.length} modifiche verranno pubblicate subito. Prima viene salvata una copia di sicurezza.`, { ok: 'Importa' })) return; await store.snapshot('Prima dell’import Excel'); const n = await store.applyNow(ch.map(c => ({ key: c.key, val: c.val })), 'Import da ' + file.name); toast(`Importate ${n} modifiche`); show(); };
    };
    show();
  } catch (e) { console.error(e); box.innerHTML = `<div class="note err">${ic('error')}<div>${esc(e.message)}</div></div>`; }
}

// ══ STORICO MODIFICHE ════════════════════════════════════════════════════
export function history(el, params, ctx) {
  if (!guard(el, ctx, 'storico')) return;
  let fop = '', fq = '';
  const draw = async () => {
    const all = Object.entries(await store.getLog()).map(([id, l]) => Object.assign({ id }, l)).sort((a, b) => b.ts - a.ts);
    const list = all.filter(l => (!fop || l.op === fop) && (!fq || JSON.stringify(l).toLowerCase().includes(fq)));
    const batches = []; for (const l of list) { const b = batches[batches.length - 1]; if (b && b.batch && b.batch === l.batch) b.items.push(l); else batches.push({ batch: l.batch, ts: l.ts, by: l.by, note: l.note, items: [l] }); }
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Storico modifiche</h2><p>Chi ha cambiato cosa e quando (ultimi 120 giorni). Puoi riportare una casella o un intero gruppo di modifiche com’erano prima.</p></div>
      <div class="acts"><select class="inp" id="fo" style="width:auto"><option value="">Tutti gli operatori</option>${store.ops(true).map(o => `<option value="${o.id}" ${fop === o.id ? 'selected' : ''}>${esc(cap1(o.surname))}</option>`).join('')}</select><input class="inp" id="fq" placeholder="Cerca" value="${esc(fq)}" style="width:180px"></div></div>
      <div class="col" style="gap:14px">${batches.slice(0, 120).map((b, i) => `<div class="card"><div class="card-h">${ic(b.items[0].kind === 'config' ? 'settings' : 'edit_calendar')}<div class="grow"><b>${esc(b.note || (b.items[0].kind === 'config' ? 'Impostazioni' : `${b.items.length} modific${b.items.length === 1 ? 'a' : 'he'} ai turni`))}</b><div class="small muted">${esc(b.by || '')} · ${stamp(b.ts)}</div></div>${b.items.some(x => x.kind !== 'config') ? `<button class="btn sm" data-rb="${i}">${ic('undo')}Annulla gruppo</button>` : ''}</div>
        ${b.items[0].kind === 'config' ? '' : `<div class="card-b flush">${b.items.slice(0, 40).map((l, k) => `<div class="list-i">${l.kind === 'rep' ? `<span class="grow small">Reperibilità ${esc(fmtShort(l.date))}: ${esc((l.before || []).map(x => store.opName(x, true)).join('/') || 'automatica')} → <b>${esc((l.after || []).map(x => store.opName(x, true)).join('/') || 'automatica')}</b></span>` : `${opChip(l.op)}<span class="small" style="width:90px">${esc(fmtShort(l.date))}</span><span class="grow">${chipFor(l.before, l.date)} ${ic('arrow_forward')} ${chipFor(l.after, l.date)}</span>`}<button class="ibtn" title="Riporta com’era" data-r1="${i}:${k}">${ic('undo')}</button></div>`).join('')}${b.items.length > 40 ? `<div class="list-i small muted">… e altre ${b.items.length - 40}</div>` : ''}</div>`}</div>`).join('') || `<div class="card"><div class="empty">${ic('history')}Nessuna modifica registrata</div></div>`}</div></div>`;
    el.querySelector('#fo').onchange = e => { fop = e.target.value; draw(); };
    el.querySelector('#fq').onchange = e => { fq = e.target.value.toLowerCase(); draw(); };
    const revert = items => store.stage(items.filter(l => l.kind !== 'config').map(l => ({ key: l.kind === 'rep' ? 'rep|' + l.date : l.op + '|' + l.date, val: l.before || null })), 'Ripristino dallo storico');
    el.querySelectorAll('[data-rb]').forEach(b => b.onclick = () => { revert(batches[+b.dataset.rb].items); toast('Valori precedenti messi in bozza: pubblica per confermare', 'info', { action: 'Apri', onAction: () => ctx.go('modifica') }); });
    el.querySelectorAll('[data-r1]').forEach(b => b.onclick = () => { const [i, k] = b.dataset.r1.split(':').map(Number); revert([batches[i].items[k]]); toast('Messo in bozza', 'info', { action: 'Apri', onAction: () => ctx.go('modifica') }); });
  };
  draw();
}

// ══ ACCESSI ══════════════════════════════════════════════════════════════
export function sessions(el, params, ctx) {
  if (!guard(el, ctx, 'accessi', 'admin')) return;
  (async () => {
    const list = Object.values(await store.getSessions()).sort((a, b) => b.ts - a.ts);
    const by = {}; list.forEach(s => by[s.who] = (by[s.who] || 0) + 1);
    const dev = ua => /iphone|ipad/i.test(ua) ? 'iPhone/iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : 'Altro';
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Accessi</h2><p>Aperture dell’app negli ultimi 30 giorni${store.adapter.kind === 'cloud' ? ' su tutti i dispositivi' : ' (solo questo dispositivo: collega il cloud per vederli tutti)'}.</p></div></div>
      <div class="row wrap mb">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([w, n]) => `<span class="pill acc">${esc(w)}: ${n}</span>`).join('')}</div>
      <div class="card"><table class="tbl"><thead><tr><th>Quando</th><th>Chi</th><th>Ruolo</th><th>Dispositivo</th><th>Archivio</th></tr></thead><tbody>${list.slice(0, 300).map(s => `<tr><td class="nowrap">${stamp(s.ts)}</td><td><b>${esc(s.who)}</b></td><td>${esc(s.role)}</td><td class="small">${dev(s.ua || '')} · ${s.w}px</td><td>${esc(s.mode)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessun accesso</td></tr>'}</tbody></table></div></div>`;
  })();
}

// ══ IMPOSTAZIONI ═════════════════════════════════════════════════════════
export function settings(el, params, ctx) {
  if (!guard(el, ctx, 'impostazioni', 'admin')) return;
  const draw = () => {
    const c = store.config; const cloud = store.cloudCfg || {};
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Impostazioni</h2><p>Nome dell’app, password, archivio cloud, profilo autisti/infermieri, passaggio al nuovo anno.</p></div></div>
      <div class="col" style="gap:16px">
      <div class="card"><div class="card-h"><span class="ms ico">badge</span><h3>Intestazione</h3></div><div class="card-b col"><div class="grid g3"><label class="field">Nome dell’app<input class="inp" id="t1" value="${esc(c.app.title)}"></label><label class="field">Unità operativa<input class="inp" id="t2" value="${esc(c.app.unit || '')}"></label><label class="field">Ente<input class="inp" id="t3" value="${esc(c.app.entity || '')}"></label></div><div class="row"><span class="sp"></span><button class="btn pri" id="sv1">${ic('save')}Salva</button></div></div></div>
      <div class="card"><div class="card-h"><span class="ms ico">key</span><h3>Password</h3></div><div class="card-b col"><div class="grid g2"><label class="field">Nuova password amministratore<input class="inp" type="password" id="p1" autocomplete="new-password"></label><label class="field">Password coordinatore <span class="hint">${c.coordHash ? 'impostata' : 'non impostata: il coordinatore usa quella dell’amministratore'}</span><input class="inp" type="password" id="p2" autocomplete="new-password"></label></div><div class="row"><span class="small muted">Le password sono salvate solo come impronta cifrata (PBKDF2, 150.000 passaggi, sale casuale). Cambiandole, chi era collegato deve rientrare.</span><span class="sp"></span><button class="btn pri" id="sv2">${ic('save')}Aggiorna</button></div></div></div>
      <div class="card"><div class="card-h"><span class="ms ico">shield_lock</span><h3>Sicurezza degli accessi</h3></div><div class="card-b col">
        <div class="grid g2"><label class="field">Chiudi l’area gestione dopo un’inattività di<select class="inp" id="idl">${[[0, 'mai'], [10, '10 minuti'], [15, '15 minuti'], [30, '30 minuti'], [60, '1 ora'], [120, '2 ore']].map(([v, l]) => `<option value="${v}" ${(c.rules.idleLockMin ?? 30) === v ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="hint">Non vale sui dispositivi con “ricorda per 30 giorni”.</span></label>
        <label class="field">PIN obbligatorio per gli operatori<select class="inp" id="pinreq"><option value="0" ${!c.rules.pinRequired ? 'selected' : ''}>No: il PIN è facoltativo</option><option value="1" ${c.rules.pinRequired ? 'selected' : ''}>Sì: chi non ha il PIN lo crea al primo accesso</option></select></label></div>
        <label class="field">Email di coordinatori e amministratori <span class="hint">una per riga, con il ruolo: <code>nome@ente.sm admin</code> oppure <code>nome@ente.sm coord</code>. Con il cloud collegato possono entrare con un link via email verificato da Firebase.</span><textarea class="inp" id="mgr" style="min-height:70px;font-family:monospace;font-size:12.5px">${esc((c.managers || []).map(x => x.email + ' ' + x.role).join('\n'))}</textarea></label>
        <div class="row"><span class="small muted grow">Dopo 5 tentativi sbagliati (password o PIN) l’accesso si blocca per un minuto, poi per tempi sempre più lunghi.</span><button class="btn pri" id="svsec">${ic('save')}Salva</button></div></div></div>
      <div class="card"><div class="card-h"><span class="ms ico">cloud</span><h3 class="grow">Archivio cloud (Firebase)</h3>${store.adapter.kind === 'cloud' ? '<span class="pill ok"><span class="dot ok"></span>Collegato</span>' : '<span class="pill warn">Solo su questo dispositivo</span>'}</div><div class="card-b col">
        <div class="note small">${ic('info')}<div>Con il cloud tutti gli operatori vedono gli stessi turni in tempo reale, ricevono le notifiche e il coordinatore riceve le richieste. Serve un progetto Firebase <b>dedicato</b> (gratuito): <a href="https://console.firebase.google.com/" target="_blank" rel="noopener">console.firebase.google.com</a> → Aggiungi progetto → app Web → copia la configurazione qui sotto; attiva <i>Authentication › Anonimo</i> e <i>Firestore</i>, poi incolla le regole del file <code>firebase/firestore.rules</code> del repository.</div></div>
        <label class="field">Configurazione Firebase (JSON o il blocco <code>firebaseConfig</code>)<textarea class="inp" id="fb" style="min-height:120px;font-family:monospace;font-size:12px" placeholder='{ "apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "..." }'>${cloud.firebase ? esc(JSON.stringify(cloud.firebase, null, 2)) : ''}</textarea></label>
        <div class="grid g2"><label class="field">Prefisso delle collezioni<input class="inp" id="ns" value="${esc(cloud.ns || store.ns)}"></label><label class="field">Profilo<select class="inp" id="pf">${Object.values(PROFILES).map(p => `<option value="${p.key}" ${store.profile.key === p.key ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label></div>
        <label class="chk"><input type="checkbox" id="up" checked>Alla prima connessione carica sul cloud i turni presenti su questo dispositivo</label>
        <div class="row wrap"><button class="btn" id="cfgfile">${ic('description')}Scarica data/cloud.json</button><span class="sp"></span>${store.cloudCfg && store.cloudCfg.enabled ? `<button class="btn" id="off">${ic('cloud_off')}Scollega</button>` : ''}<button class="btn pri" id="on">${ic('cloud_upload')}Collega e verifica</button></div>
        <div class="small muted">Per far usare il cloud a tutti, metti il file <code>data/cloud.json</code> scaricato nel repository GitHub: ogni dispositivo lo legge all’avvio.</div></div></div>
      <div class="card"><div class="card-h"><span class="ms ico">event_repeat</span><h3>Nuovo anno</h3></div><div class="card-b col"><div class="small muted">Passa dal ${c.year} al ${c.year + 1}: le ferie non godute diventano residuo, il saldo ore di fine anno diventa saldo iniziale, si caricano le festività di San Marino. I turni del ${c.year} restano consultabili nell’archivio e nei backup.</div><div class="row"><span class="sp"></span><button class="btn" id="ny">${ic('celebration')}Prepara il ${c.year + 1}</button></div></div></div>
      <div class="card" style="border-color:var(--err)"><div class="card-h"><span class="ms ico" style="background:var(--err-soft);color:var(--err)">warning</span><h3>Zona pericolosa</h3></div><div class="card-b row wrap"><span class="small muted grow">Cancella tutti i dati (turni, operatori, richieste) e ricarica i turni del file Excel di partenza.</span><button class="btn red" id="rs">${ic('delete_forever')}Azzera e ricarica i dati iniziali</button></div></div>
      </div></div>`;
    const v = s => el.querySelector(s);
    v('#sv1').onclick = async () => { await store.saveConfig({ app: Object.assign({}, c.app, { title: v('#t1').value.trim() || c.app.title, unit: v('#t2').value.trim(), entity: v('#t3').value.trim() }) }, 'Intestazione'); toast('Salvato'); };
    v('#sv2').onclick = async () => { const a = v('#p1').value, b = v('#p2').value; const patch = {}; if (a) { if (a.length < 8 || !/\d/.test(a) || !/[a-z]/i.test(a)) return toast('Almeno 8 caratteri con lettere e numeri', 'warn'); patch.adminHash = await hashPass(a); } if (b) { if (b.length < 8) return toast('Password coordinatore: almeno 8 caratteri', 'warn'); patch.coordHash = await hashPass(b); } if (!a && !b) return; await store.saveConfig(patch, 'Password aggiornate'); if (patch.adminHash) store.setAuth('admin', patch.adminHash); toast('Password aggiornate'); draw(); };
    const parseCfg = () => { const t = v('#fb').value.trim(); if (!t) return null; let j = t.replace(/^[^{]*/, '').replace(/[^}]*$/, ''); try { return JSON.parse(j); } catch (e) { try { return Function('"use strict";return (' + j + ')')(); } catch (e2) { return null; } } };
    v('#cfgfile').onclick = () => { const f = parseCfg(); if (!f) return toast('Incolla prima la configurazione', 'warn'); download('cloud.json', JSON.stringify({ enabled: true, profile: v('#pf').value, ns: v('#ns').value.trim() || 'gt2', firebase: f }, null, 2), 'application/json'); };
    if (v('#off')) v('#off').onclick = async () => { if (!await confirmBox('Scollegare il cloud?', 'Su questo dispositivo si tornerà all’archivio locale.')) return; store.setCloud({ enabled: false }); location.reload(); };
    v('#on').onclick = async () => {
      const f = parseCfg(); if (!f || !f.apiKey || !f.projectId) return toast('Configurazione non valida: servono almeno apiKey e projectId', 'err');
      const ns = v('#ns').value.trim() || 'gt2'; const b = v('#on'); b.disabled = true; b.textContent = 'Verifica…';
      try {
        const exp = v('#up').checked ? await store.exportAll() : null;
        // prova di connessione con un archivio cloud temporaneo
        const { FirebaseAdapterClass } = await import('../store.js');
        const test = new FirebaseAdapterClass(ns, f); await test.init();
        const remote = await test.getDoc('config');
        if (!remote && exp) {
          await test.setDoc('config', JSON.parse(JSON.stringify(exp.config)));
          for (const [m, d] of Object.entries(exp.months)) await test.setDoc('m_' + m, { cells: d.cells || {}, rep: d.rep || {}, updatedAt: Date.now() });
          for (const [op, days] of Object.entries(exp.agenda || {})) await test.setDoc('agenda_' + op, { days });
        }
        store.setCloud({ enabled: true, profile: v('#pf').value, ns, firebase: f });
        toast(remote ? 'Collegato: i dati del cloud sono già presenti' : 'Collegato: dati caricati sul cloud'); setTimeout(() => location.reload(), 900);
      } catch (e) { console.error(e); toast('Connessione non riuscita: ' + (e.message || e), 'err', { ms: 6000 }); b.disabled = false; b.innerHTML = ic('cloud_upload') + 'Collega e verifica'; }
    };
    v('#pf').onchange = e => { if (e.target.value !== store.profile.key) confirmBox('Cambiare profilo?', 'Il profilo “infermieri” usa un archivio separato (puoi tornare agli autisti quando vuoi). L’app si ricarica.').then(ok => { if (ok) { store.setProfile(e.target.value); const cc = store.lsGet('gt2:cloud'); if (cc) { cc.profile = e.target.value; cc.ns = e.target.value === 'autisti' ? 'gt2' : 'gt2inf'; store.setCloud(cc); } location.reload(); } else e.target.value = store.profile.key; }); };
    v('#ny').onclick = () => newYear();
    v('#svsec').onclick = async () => {
      const managers = v('#mgr').value.split('\n').map(l => l.trim().split(/\s+/)).filter(x => /@/.test(x[0] || '')).map(([email, role]) => ({ email: email.toLowerCase(), role: role === 'admin' ? 'admin' : 'coord' }));
      await store.saveConfig({ managers, rules: Object.assign({}, c.rules, { idleLockMin: +v('#idl').value, pinRequired: v('#pinreq').value === '1' }) }, 'Sicurezza degli accessi'); toast('Impostazioni di sicurezza salvate');
    };
    v('#rs').onclick = async () => { if (!await confirmBox('Azzerare tutto?', 'Verranno cancellati turni, operatori, richieste e storico di questo archivio. Viene prima scaricato un backup.', { danger: true, ok: 'Azzera' })) return; download(`backup-prima-azzeramento-${today()}.json`, JSON.stringify(await store.exportAll()), 'application/json'); await store.resetAll(); location.reload(); };
  };
  draw();
}
async function newYear() {
  const c = store.config; const y = c.year, ny = y + 1;
  const rows = store.ops().map(o => { const s = yearStats(o.id, y); const w = weeks(o.id, y); return { o, ferie: Math.max(0, s.ferieRestanti), bal: w.length ? w[w.length - 1].balance : 0 }; });
  const m = modal({
    title: `Prepara il ${ny}`, icon: 'celebration', size: 'wide', foot: '',
    body: `<div class="col"><div class="small muted">Controlla i valori riportati: puoi correggerli dopo in Operatori.</div><div class="card"><table class="tbl"><thead><tr><th>Operatore</th><th class="r">Ferie ${y} non godute → residuo ${ny}</th><th class="r">Saldo ore → saldo iniziale ${ny}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${opChip(r.o.id, { full: true })}</td><td class="r num">${r.ferie}</td><td class="r num">${hm(r.bal, { plus: true })}</td></tr>`).join('')}</tbody></table></div>
    <div class="note warn">${ic('info')}<div>Prima del passaggio viene salvata una copia di sicurezza completa del ${y}.</div></div></div>`
  });
  m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('check')}Passa al ${ny}</button>`;
  m.foot.querySelector('[data-c]').onclick = () => m.close();
  m.foot.querySelector('[data-o]').onclick = async () => {
    await store.snapshot(`Archivio ${y} (fine anno)`);
    const ops = c.operators.map(o => { const r = rows.find(x => x.o.id === o.id); if (!r) return o; return Object.assign({}, o, { initBalance: r.bal, prevWeek: 0, params: Object.assign({}, o.params, { ferieAP: r.ferie }) }); });
    const h = holidaysSM(ny).concat(holidaysSM(ny + 1).filter(x => x.date < `${ny + 1}-02-01`)); const fn = Object.assign({}, c.festNames); h.forEach(x => fn[x.date] = x.name);
    await store.saveConfig({ year: ny, operators: ops, festivi: [...new Set(c.festivi.concat(h.map(x => x.date)))].sort(), festNames: fn }, `Passaggio al ${ny}`);
    m.close(); toast(`Benvenuto ${ny}!`); setTimeout(() => location.reload(), 800);
  };
}

// ══ COSA VEDERE ═════════════════════════════════════════════════════════
// L'amministratore sceglie cosa mostrano le pagine agli operatori (coordinatori e admin vedono tutto).
export function visibility(el, params, ctx) {
  if (!guard(el, ctx, 'vedere')) return;
  const draw = () => {
    const d = display();
    const sw = (k, label, hint, val = d[k]) => `<label class="vis-row"><span><b>${label}</b><small>${hint}</small></span><span class="switch"><input type="checkbox" data-k="${k}" ${val ? 'checked' : ''}><i></i></span></label>`;
    const tab = (k, label, hint) => `<label class="vis-row"><span><b>${label}</b><small>${hint}</small></span><span class="switch"><input type="checkbox" data-t="${k}" ${d.tabs[k] !== false ? 'checked' : ''}><i></i></span></label>`;
    el.innerHTML = `<div class="page"><div class="page-h"><div><p>Scegli cosa vedono gli operatori. Coordinatori e amministratori vedono sempre tutto. Le modifiche valgono subito per tutti.</p></div><div class="acts"><button class="btn" id="vis-reset">${ic('restart_alt')}Valori consigliati</button></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><span class="ms ico">calendar_month</span><h3>Calendario</h3></div><div class="card-b col" style="gap:0">
          <label class="vis-row"><span><b>Vista iniziale</b><small>Come si apre il calendario</small></span><select class="inp sm" id="vis-view" style="width:auto">${[['mese', 'Mese'], ['settimana', 'Settimana'], ['giorno', 'Giorno'], ['foglio', 'Foglio Excel']].map(([k, l]) => `<option value="${k}" ${d.calView === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${sw('showHours', 'Orari e ore', 'Orario del turno (es. 06:30–13:15) e ore nelle caselle')}
          ${sw('showRep', 'Reperibilità', 'Chi è reperibile, nel calendario e nei dettagli del giorno')}
          ${sw('absReasons', 'Motivo delle assenze dei colleghi', 'Se spento si legge solo “Assente” (malattia, lutto… restano riservati)')}
          ${sw('showNotes', 'Note sulle caselle', 'Le note scritte dal coordinatore sui turni dei colleghi')}
          ${sw('showPhones', 'Telefoni dei colleghi', 'Pulsante per chiamare chi è in turno')}
          ${sw('showRest', 'Chi è a riposo', 'Nel dettaglio del giorno, l’elenco di chi riposa')}
        </div></div>
        <div class="card"><div class="card-h"><span class="ms ico">functions</span><h3>Conteggi</h3></div><div class="card-b col" style="gap:0">
          ${sw('othersCounts', 'Conteggi dei colleghi', 'Ore, saldi, ferie e permessi di tutti. Se spento ognuno vede solo i propri (e la pagina Equità sparisce)')}
          <div class="sec-t">Pagine visibili agli operatori</div>
          ${tab('foglio', 'Foglio Excel', 'Il calendario identico al file Excel')}
          ${tab('oggi', 'In servizio', 'Chi lavora oggi e nel mese, fascia per fascia')}
          ${tab('anno', 'Anno', 'Tutto l’anno a colpo d’occhio')}
          ${tab('cartellino', 'Cartellino', 'Riga dei turni per persona')}
          ${tab('ore', 'Ore e saldi', 'Saldo settimanale sulle 36 ore')}
          ${tab('ferie', 'Ferie e permessi', 'Saldi e giorni consigliati')}
          ${tab('reperibilita', 'Reperibilità', 'Calendario, ore e quadro mensile')}
          ${tab('festivi', 'Festivi e domeniche', 'Festivi lavorati e domeniche')}
          ${tab('statistiche', 'Equità', 'Notti, weekend, coppie in turno')}
          ${tab('borsa', 'Borsa scambi', 'Turni da cedere o scambiare')}
          ${tab('disponibilita', 'Disponibilità', 'Agenda personale e conciliazione famiglia')}
          ${tab('squadra', 'Squadra', 'Bacheca, uscite di gruppo, ruota della sfiga')}
        </div></div>
      </div>
      <div class="note mt">${ic('visibility')}<div>Per controllare il risultato esci dall’area gestione (menu in basso a sinistra) e guarda l’app come un operatore.</div></div></div>`;
    const saveD = async (patch, msg) => { await store.saveConfig({ display: Object.assign({}, store.config.display || {}, patch) }, 'Cosa vedere: ' + msg); toast('Salvato'); };
    el.querySelectorAll('[data-k]').forEach(i => i.onchange = () => saveD({ [i.dataset.k]: i.checked }, i.dataset.k));
    el.querySelectorAll('[data-t]').forEach(i => i.onchange = () => saveD({ tabs: Object.assign({}, display().tabs, { [i.dataset.t]: i.checked }) }, i.dataset.t));
    el.querySelector('#vis-view').onchange = e => saveD({ calView: e.target.value }, 'vista iniziale');
    el.querySelector('#vis-reset').onclick = async () => { if (await confirmBox('Tornare ai valori consigliati?', 'Tutto visibile tranne l’elenco di chi è a riposo.')) { await store.saveConfig({ display: JSON.parse(JSON.stringify(DISPLAY_DEFAULTS)) }, 'Cosa vedere: valori consigliati'); toast('Ripristinato'); } };
  };
  draw();
  return store.on(w => { if (w === 'config') draw(); });
}
