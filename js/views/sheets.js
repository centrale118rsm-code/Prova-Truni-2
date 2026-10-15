// ═══════════════════════════════════════════════════════════════════════════
// VISTE DEL FOGLIO — In servizio (ACCESSORIO TRASPO.), Vista d'insieme dell'anno,
// Cartellino annuale (CARTELLINO): righe = operatori, colonne = giorni.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, WD_LONG, today, addDays, fmtDate, fmtShort, hm, monthDays, dow, yearOf, monthIdx, rangeDays, contrast } from '../util.js';
import { ic, modal, chipFor, opChip, avatar, cap1, shiftStyle, absStyle } from '../ui.js';
import { shiftInfo, absInfo, repOf, repBands, coverage, covStyle, workedMin, hasRep, validate, isSmontoCode } from '../calc.js';
import { COVERAGE } from '../profile.js';
import { monthGrid } from './me.js';
import { canSeeAbsReason, canSeePhone } from '../display.js';

const Y = () => store.config.year;

// Gruppi del foglio ACCESSORIO TRASPO.: assenti/recuperi, M, mat, P, pom, N
function groupsOf(d) {
  const g = { M: [], mat: [], P: [], pom: [], N: [], SM: [], R: [], abs: [], altro: [] };
  for (const o of store.ops()) {
    const c = store.cell(o.id, d);
    if (!c || (!c.s && !c.a)) continue;
    if (c.a && !c.s) { g.abs.push({ o, c }); continue; }
    const s = shiftInfo(c.s); const cnt = s.cnt || [];
    if (cnt.includes('tm')) g.M.push({ o, c }); else if (cnt.includes('dm')) g.mat.push({ o, c });
    if (cnt.includes('tp')) g.P.push({ o, c }); else if (cnt.includes('dp')) g.pom.push({ o, c });
    if (cnt.includes('tn')) g.N.push({ o, c });
    if (isSmontoCode(c.s)) g.SM.push({ o, c });
    if (s.group === 'R') g.R.push({ o, c });
    if (s.group === 'X') g.altro.push({ o, c });
  }
  return g;
}

export function duty(el, params, ctx) {
  let d = params.d || today(); let tab = params.t || 'giorno'; let mi = yearOf(d) === Y() ? monthIdx(d) : 0;
  const draw = () => {
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>In servizio</h2><p>Chi lavora, in che fascia, chi è reperibile e chi è assente — come il foglio di trasposizione dei turni.</p></div>
      <div class="acts"><div class="tabs"><button data-t="giorno" class="${tab === 'giorno' ? 'on' : ''}">${ic('today')}Giorno</button><button data-t="mese" class="${tab === 'mese' ? 'on' : ''}">${ic('calendar_view_month')}Mese</button></div></div></div><div id="body"></div></div>`;
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const body = el.querySelector('#body');
    if (tab === 'giorno') {
      const g = groupsOf(d); const r = repOf(d); const bands = repBands(); const cov = coverage(d);
      const col = (title, list, color, icon, hint) => `<div class="card"><div class="card-h" style="border-top:4px solid ${color};border-radius:18px 18px 0 0">${ic(icon)}<h3 class="grow">${title}</h3><span class="pill">${list.length}</span></div><div class="card-b flush">${list.length ? list.map(({ o, c }) => { const s = c.s ? shiftInfo(c.s) : null; return `<div class="list-i">${avatar(o.id)}<span class="grow"><b>${esc(o.name)} ${esc(cap1(o.surname))}</b><div class="small muted">${s && s.from ? `${s.from} – ${s.to}` : c.a ? esc(canSeeAbsReason(o.id) ? absInfo(c.a).label : 'Assente') : ''}${o.phone && canSeePhone(o.id) ? ' · ' + esc(o.phone) : ''}</div></span>${chipFor(c, d)}</div>`; }).join('') : `<div class="empty" style="padding:18px">${hint || '—'}</div>`}</div></div>`;
      body.innerHTML = `<div class="row wrap mb"><button class="btn" data-dd="-1">${ic('chevron_left')}</button><input class="inp" type="date" id="dd" value="${d}" style="width:auto"><button class="btn" data-dd="1">${ic('chevron_right')}</button><button class="btn" data-dd="0">${ic('today')}Oggi</button><b style="margin-left:8px;font-size:16px">${esc(fmtDate(d, { wd: true, year: true }))}</b>${store.isFestivo(d) ? `<span class="pill info">${ic('celebration')}${esc(store.config.festNames[d] || 'Festivo')}</span>` : ''}
        <span class="sp"></span>${COVERAGE.map(c => { const st = covStyle(c.key, cov[c.key] || 0, cov); return `<span class="pill" title="${c.label}" style="background:${st.bg};color:${st.fg === st.bg ? '#000' : st.fg}">${c.short} ${cov[c.key] || 0}</span>`; }).join('')}</div>
        <div class="grid g3">${col('Mattina turnista (M)', g.M, '#2563eb', 'wb_sunny', '<span class="neg">Scoperto</span>')}${col('Pomeriggio turnista (P)', g.P, '#ea580c', 'wb_twilight', '<span class="neg">Scoperto</span>')}${col('Notte (N)', g.N, '#4338ca', 'dark_mode', '<span class="neg">Scoperta</span>')}
        ${col('Mattina diurni (mat)', g.mat, '#0ea5e9', 'light_mode')}${col('Pomeriggio diurni (pom)', g.pom, '#f97316', 'routine')}${col('Smonto notte', g.SM, '#a21caf', 'bedtime')}
        ${col('Riposo', g.R, '#16a34a', 'weekend')}${col('Assenti', g.abs, '#dc2626', 'event_busy')}
        <div class="card"><div class="card-h" style="border-top:4px solid #db2777;border-radius:18px 18px 0 0">${ic('phone_in_talk')}<h3>Reperibilità</h3></div><div class="card-b flush">${bands.map((b, i) => `<div class="list-i"><span class="grow small b">${b.label}</span>${r[i] ? opChip(r[i], { full: true }) : '<span class="neg">nessuno</span>'}</div>`).join('')}</div></div></div>`;
      body.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => { d = +b.dataset.dd === 0 ? today() : addDays(d, +b.dataset.dd); draw(); });
      body.querySelector('#dd').onchange = e => { if (e.target.value) { d = e.target.value; draw(); } };
    } else {
      const [y, m] = mi === 12 ? [Y() + 1, 0] : [Y(), mi];
      const days = monthDays(y, m);
      const cellList = (list, rep) => list.map(({ o, c }) => `<span style="display:inline-block;padding:1px 6px;margin:1px;border-radius:4px;font-size:11px;font-weight:700;${hasRep(c) ? 'background:#ffccff;color:#9c0006' : ''}">${esc(o.surname)}${hasRep(c) ? '/R' : ''}</span>`).join('');
      body.innerHTML = `<div class="row mb"><select class="inp" id="mo" style="width:auto">${MONTHS.map((mm, i) => `<option value="${i}" ${i === mi ? 'selected' : ''}>${mm} ${Y()}</option>`).join('')}<option value="12" ${mi === 12 ? 'selected' : ''}>Gennaio ${Y() + 1}</option></select></div>
      <div class="card"><div class="tbl-wrap" style="max-height:74vh"><table class="tbl" style="font-size:12px"><thead><tr><th>Giorno</th><th style="background:#66ffcc33">Assenti / recuperi</th><th>M</th><th style="background:#ffccff55">mat</th><th>P</th><th style="background:#ffccff55">pom</th><th>N</th></tr></thead><tbody>
      ${days.map(x => { const g = groupsOf(x); const w = dow(x); return `<tr style="${w === 0 ? 'border-bottom:2px solid #cc00ff' : ''}"><td class="nowrap"><b style="color:#00f">${+x.slice(8)}</b> <span style="background:${store.isFestivo(x) ? '#0ff' : w === 0 ? '#ccff33' : 'transparent'};padding:0 4px">${WD_LONG[w]}</span></td><td style="background:#66ffcc1a">${g.abs.map(({ o, c }) => `<span class="pill" style="margin:1px">${esc(o.surname)} <b>${esc(c.a)}</b></span>`).join('')}</td><td>${cellList(g.M) || '<span class="neg b">—</span>'}</td><td>${cellList(g.mat)}</td><td>${cellList(g.P) || '<span class="neg b">—</span>'}</td><td>${cellList(g.pom)}</td><td>${cellList(g.N) || '<span class="neg b">—</span>'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
      body.querySelector('#mo').onchange = e => { mi = +e.target.value; draw(); };
    }
  };
  draw();
  return store.on(w => { if (w === 'cells') draw(); });
}

// ── Vista d'insieme ──
export function overview(el, params, ctx) {
  let who = params.op || '__cov';
  const draw = () => {
    const issues = who === '__cov' ? validate(`${Y()}-01-01`, `${Y()}-12-31`).filter(i => i.level === 'err') : [];
    const bad = {}; issues.forEach(i => (bad[i.date] = bad[i.date] || []).push(i.msg));
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Vista d’insieme ${Y()}</h2><p>Tutto l’anno in un colpo d’occhio: le coperture giornaliere o i turni di un operatore.</p></div>
      <div class="acts"><select class="inp" id="who" style="width:auto"><option value="__cov">Copertura del servizio</option>${store.ops().map(o => `<option value="${o.id}" ${who === o.id ? 'selected' : ''}>${esc(o.name)} ${esc(cap1(o.surname))}</option>`).join('')}</select></div></div>
      ${who === '__cov' ? `<div class="row wrap mb"><span class="pill ok">${ic('check_circle')}giorno coperto</span><span class="pill err">${ic('error')}manca o è doppio un turno</span><span class="pill">${Object.keys(bad).length} giorni da sistemare</span></div>` : ''}
      <div class="grid g3">${Array.from({ length: 12 }, (_, m) => `<div class="card"><div class="card-h"><h3>${MONTHS[m]}</h3></div><div class="card-b" style="padding:10px"><div class="cal-month">${monthGrid(Y(), m, d => {
        if (who === '__cov') { const b = bad[d]; return `<div class="s" title="${esc((b || []).join('\n'))}" style="background:${b ? '#fecaca' : '#bbf7d0'};color:${b ? '#991b1b' : '#166534'}">${b ? ic('error') : ic('check')}</div>`; }
        const c = store.cell(who, d); if (!c) return ''; const st = c.s ? shiftStyle(c, d) : null; const a = absStyle(c); return `<div class="s" style="background:${a && !c.s ? a.bg : st ? st.bg : '#eee'};color:${a && !c.s ? a.fg : st ? st.fg : '#333'}">${esc(c.s || (a && a.t) || '')}</div>`;
      })}</div></div></div>`).join('')}</div></div>`;
    el.querySelector('#who').onchange = e => { who = e.target.value; draw(); };
    el.querySelectorAll('.cm-d[data-d]').forEach(t => t.onclick = () => ctx.go('servizio', { d: t.dataset.d }));
  };
  draw();
  return store.on(w => { if (w === 'cells') draw(); });
}

// ── Cartellino annuale ──
export function timecard(el, params, ctx) {
  let from = params.from || (yearOf(today()) === Y() ? `${today().slice(0, 7)}-01` : `${Y()}-01-01`); let span = 48; let only = params.op || '';
  const draw = () => {
    const days = rangeDays(from, addDays(from, span - 1)); const ops = store.ops().filter(o => !only || o.id === only);
    const L = c => { if (!c || !c.s) return ''; const s = c.s.trim(); return ({ POM: 'P', MAT: 'M', 'MAT/R': 'M/R', NOTT: 'N', SM: 'S', R: 'R', matt: 'm', pome: 'p', 'matt/R': 'm/R', ripo: 'r', 'MAT+N': 'M+N' })[s] || s; };
    const head = days.map(d => { const w = dow(d); return `<th style="padding:2px 0;text-align:center;min-width:26px;background:${store.isFestivo(d) ? '#00ffff' : w === 0 ? '#ccff33' : '#fff'};color:#00f;font-family:var(--font-num);font-size:13px;${d.endsWith('-01') ? 'border-left:3px solid #00b050' : ''}">${+d.slice(8)}</th>`; }).join('');
    const months = []; days.forEach(d => { const k = d.slice(0, 7); const last = months[months.length - 1]; if (last && last.k === k) last.n++; else months.push({ k, n: 1, m: monthIdx(d) }); });
    const rows = ops.map(o => {
      const r1 = days.map(d => { const c = store.cell(o.id, d); const s = c && c.s ? shiftInfo(c.s) : null; const st = shiftStyle(c, d); const bg = c && c.s ? (c.s.trim() === 'R' || /ripo/.test(c.s) ? '#a9d08e' : c.s.includes('/R') ? '#ffc7ce' : '#fff') : '#fff'; return `<td style="text-align:center;font-weight:700;font-size:11px;background:${bg};color:${c && c.s ? (s && s.group === 'T' ? st.fg : '#333') : '#999'};${d.endsWith('-01') ? 'border-left:3px solid #00b050' : ''}">${esc(L(c)) || (c && c.a ? '-' : '')}</td>`; }).join('');
      const r2 = days.map(d => { const a = absStyle(store.cell(o.id, d)); return `<td style="text-align:center;font-size:9px;height:14px;${a ? `background:${a.bg};color:${a.fg}` : ''}">${a ? esc(a.t) : ''}</td>`; }).join('');
      const r3 = days.map(d => { const r = repOf(d); const mine = r.some(x => x === o.id); return `<td style="height:8px;background:${mine ? o.color : '#dbe7f4'}"></td>`; }).join('');
      return `<tr><th rowspan="3" style="background:${o.color};color:#fff;text-align:left;padding:4px 10px;position:sticky;left:0;z-index:2;min-width:120px;font-size:15px;text-shadow:0 1px 1px rgba(0,0,0,.3)">${esc(cap1(o.surname))}</th>${r1}</tr><tr>${r2}</tr><tr>${r3}</tr>`;
    }).join('');
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Cartellino</h2><p>Riga dei turni (lettera della linea), riga delle assenze e striscia della reperibilità per ogni operatore, come il foglio CARTELLINO.</p></div>
      <div class="acts"><button class="btn" data-mv="-30">${ic('chevron_left')}</button><input class="inp" type="date" id="cf" value="${from}" style="width:auto"><button class="btn" data-mv="30">${ic('chevron_right')}</button><select class="inp" id="sp" style="width:auto">${[[31, '1 mese'], [48, '6-7 settimane'], [62, '2 mesi'], [92, '3 mesi'], [366, 'Tutto l’anno']].map(([v, l]) => `<option value="${v}" ${span === v ? 'selected' : ''}>${l}</option>`).join('')}</select><select class="inp" id="op" style="width:auto"><option value="">Tutti</option>${store.ops().map(o => `<option value="${o.id}" ${only === o.id ? 'selected' : ''}>${esc(cap1(o.surname))}</option>`).join('')}</select></div></div>
      <div class="card" style="overflow:hidden"><div style="overflow:auto;max-height:76vh"><table style="border-collapse:collapse;font-family:var(--font-sheet)" class="xl-card">
        <thead><tr><th style="position:sticky;left:0;z-index:3;background:#808080;color:#ccff33;font-size:24px;font-family:var(--font-num)">${Y()}</th>${months.map(mm => `<th colspan="${mm.n}" style="background:${mm.m % 2 ? '#ccccff' : '#9999ff'};color:${mm.m % 2 ? '#cc66ff' : '#ffc000'};font-family:'Tw Cen MT',var(--font-num);font-size:20px;text-align:left;padding-left:8px">${MONTHS[mm.m].toUpperCase()} . ${mm.m + 1}</th>`).join('')}</tr><tr><th style="position:sticky;left:0;z-index:3;background:#808080"></th>${head}</tr></thead>
        <tbody>${rows}</tbody></table></div></div></div>`;
    el.querySelectorAll('td').forEach(td => td.style.border = '1px solid #c9c9c9');
    el.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { from = addDays(from, +b.dataset.mv); draw(); });
    el.querySelector('#cf').onchange = e => { if (e.target.value) { from = e.target.value; draw(); } };
    el.querySelector('#sp').onchange = e => { span = +e.target.value; if (span === 366) from = `${Y()}-01-01`; draw(); };
    el.querySelector('#op').onchange = e => { only = e.target.value; draw(); };
  };
  draw();
  return store.on(w => { if (w === 'cells') draw(); });
}
