// ═══════════════════════════════════════════════════════════════════════════
// CALENDARIO — il foglio TURNI del file Excel, riprodotto colonna per colonna:
// banda del mese · numero e giorno · contatori di copertura (B-G) · per ogni
// operatore assenza + turno · numero e giorno · reperibilità a 4 fasce (AQ-AT).
// In "Modifica turni" diventa un editor: tavolozza, pennello, selezione,
// copia/incolla, annulla/ripeti, bordi "esigenza di servizio"/"richiesta personale".
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, monthDays, today, dow, ym, addDays, fmtDate, hm, parseHM, contrast, uid, yearOf, monthIdx, vibrate } from '../util.js';
import { $, $$, ic, modal, toast, popover, confirmBox, promptBox, shiftStyle, absStyle, chipFor, opChip, cap1 } from '../ui.js';
import { shiftInfo, absInfo, shiftList, absList, coverage, covStyle, repOf, repIsOverride, repDefault, yearStats, suggestedCredit, describe, workedMin, creditMin, repBands, isRest, lineColor, validate, coverageWant, isSmontoCode } from '../calc.js';
import { COVERAGE, AVAILABILITY } from '../profile.js';

const REP_HEAD = ['#0066FF', '#00B0F0', '#00B0F0', '#0070C0'];
const REP_SHORT = id => { const o = store.op(id); if (!o) return ''; const s = o.surname; return s.length > 9 ? s.slice(0, 8) + '.' : s; };

// stato dell'interfaccia (persistente per sessione)
// Modalità leggera: attiva da sola sui dispositivi poco potenti (poca memoria o pochi processori su schermo piccolo)
const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 2) || ((navigator.hardwareConcurrency || 8) <= 4 && innerWidth < 700);
const ui = Object.assign({ compact: innerWidth < 700, cov: innerWidth >= 700, rep: true, mine: false, hide: {}, legend: false, avail: false, lite: !!lowEnd }, JSON.parse(sessionStorage.getItem('gt2:calui') || '{}'));
const saveUI = () => sessionStorage.setItem('gt2:calui', JSON.stringify(ui));

// ── Viste esportate ──
export function calendar(el, params, ctx) { return mount(el, params, ctx, false); }
export function editor(el, params, ctx) {
  if (!store.isManager()) { ctx.askLogin('coord', () => ctx.go('modifica')); el.innerHTML = '<div class="page"><div class="empty">' + ic('lock') + 'Area riservata</div></div>'; return; }
  return mount(el, params, ctx, true);
}

function mount(el, params, ctx, edit) {
  const year = store.config.year;
  if (edit) store.startEdit(); else if (store.editing) store.stopEdit();
  ctx.setTitle(edit ? 'Modifica turni' : 'Calendario turni', `${store.config.app.title} · ${year}`);
  const tm = today();
  let focusMonth = params.m != null ? +params.m : (yearOf(tm) === year ? monthIdx(tm) : 0);

  el.innerHTML = `<div class="sheet-wrap">
    ${edit ? `<div class="banner edit">${ic('edit_calendar')}<b>Modalità modifica</b><span class="desk-only">— le modifiche restano in bozza finché non premi <b>Pubblica</b>. Gli operatori vedono solo i turni pubblicati.</span><span class="sp"></span><span id="pend-info"></span></div>` : ''}
    <div class="sheet-tools">
      <div class="seg" id="mon-seg"></div>
      <select class="inp sm mob-only" id="mon-sel" style="width:auto">${MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('')}<option value="12">Gennaio ${year + 1}</option></select>
      <button class="btn sm" id="btn-today">${ic('today')}Oggi</button>
      <span class="sp"></span>
      <button class="btn sm" id="btn-ops">${ic('group')}<span class="desk-only">Operatori</span></button>
      <button class="btn sm" id="btn-view">${ic('tune')}<span class="desk-only">Vista</span></button>
      <button class="btn sm" id="btn-leg">${ic('info')}<span class="desk-only">Legenda</span></button>
      ${edit ? `<button class="btn sm" id="btn-undo" title="Annulla (Ctrl+Z)">${ic('undo')}</button><button class="btn sm" id="btn-redo" title="Ripeti (Ctrl+Y)">${ic('redo')}</button>
      <button class="btn sm" id="btn-check">${ic('fact_check')}<span class="desk-only">Controlla</span></button>
      <button class="btn sm" id="btn-discard">${ic('delete_sweep')}<span class="desk-only">Scarta</span></button>
      <button class="btn sm pri" id="btn-pub">${ic('publish')}Pubblica <span class="badge" id="pub-n"></span></button>`
      : (store.isManager() ? `<button class="btn sm pri" id="btn-edit">${ic('edit')}Modifica</button>` : '')}
      <button class="btn sm" id="btn-print" title="Stampa il mese">${ic('print')}</button>
    </div>
    <div class="xl-legend hidden" id="legend" style="padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--line)"></div>
    <div class="sheet-scroll" id="sc"><table class="xl" id="xl"></table></div>
  </div>`;

  const sc = $('#sc', el), tbl = $('#xl', el);
  const monSeg = $('#mon-seg', el);
  monSeg.classList.add('desk-only');
  monSeg.innerHTML = MONTHS.map((m, i) => `<button data-m="${i}">${m.slice(0, 3)}</button>`).join('') + `<button data-m="12">Gen ${String(year + 1).slice(2)}</button>`;
  monSeg.onclick = e => { const b = e.target.closest('button'); if (b) jump(+b.dataset.m); };
  $('#mon-sel', el).onchange = e => jump(+e.target.value);
  $('#btn-today', el).onclick = () => jumpDate(tm);
  $('#btn-ops', el).onclick = e => opsMenu(e.currentTarget);
  $('#btn-view', el).onclick = e => viewMenu(e.currentTarget);
  $('#btn-leg', el).onclick = () => { ui.legend = !ui.legend; saveUI(); renderLegend(); };
  $('#btn-print', el).onclick = () => printMonth(currentMonth());
  if ($('#btn-edit', el)) $('#btn-edit', el).onclick = () => ctx.go('modifica', { m: currentMonth() });

  // ── colonne ──
  let ops = [];
  const months = []; for (let m = 0; m < 12; m++) months.push({ y: year, m }); months.push({ y: year + 1, m: 0 });
  let statsCache = {};
  function cols() {
    ops = store.ops().filter(o => !ui.hide[o.id]);
    return 3 + (ui.cov ? COVERAGE.length : 0) + ops.length * 2 + 2 + (ui.rep ? 4 : 0);
  }

  function headHTML() {
    statsCache = {}; for (const o of ops) statsCache[o.id] = yearStats(o.id, year);
    const covH = ui.cov ? COVERAGE.map(c => `<th class="lg lgv c-cv" rowspan="3" style="background:${c.key.startsWith('t') ? '#808080' : c.key === 'rip' ? '#009AF0' : '#808080'};color:${c.key.startsWith('t') ? '#FF9300' : c.key === 'rip' ? '#fff' : '#FF6699'}">${c.label}</th>`).join('') : '';
    const r1 = ops.map((o, i) => { const s = statsCache[o.id]; const fr = s.ferieRestanti; return `<th colspan="2" class="sum ${i === ops.length - 1 ? 'lastop' : ''}"><div class="chips"><span style="background:${fr < 0 ? '#FFC7CE' : fr === 0 ? '#C6EFCE' : '#FFFF00'};color:${fr < 0 ? '#9C0006' : fr === 0 ? '#006100' : '#000'}" title="Ferie ${year} rimaste">${fr}</span><span style="background:${s.pn >= 2 ? '#FFC7CE' : '#00B050'};color:${s.pn >= 2 ? '#9C0006' : '#C6E0B4'}" title="Permessi PN usati">pn ${s.pn}</span></div></th>`; }).join('');
    const r2 = ops.map((o, i) => { const s = statsCache[o.id]; return `<th colspan="2" class="sum ${i === ops.length - 1 ? 'lastop' : ''}"><div class="chips"><span style="background:${s.permOreRestanti < 0 ? '#FFC7CE' : '#00B0F0'};color:${s.permOreRestanti < 0 ? '#9C0006' : '#fff'}" title="Ore di permesso rimaste">h${s.permOreRestanti}</span><span style="background:${s.permGgRestanti < 0 ? '#FFC7CE' : s.permGgRestanti === 0 ? '#C6EFCE' : '#00FF00'};color:${s.permGgRestanti === 0 ? '#006100' : '#375623'}" title="Giorni di permesso rimasti">gg ${s.permGgRestanti}</span></div></th>`; }).join('');
    const r3 = ops.map((o, i) => `<th colspan="2" class="oph ${o.id === store.me ? 'me' : ''} ${i === ops.length - 1 ? 'lastop' : ''}" data-op="${o.id}" style="background:${o.color};color:${contrast(o.color) === '#111' ? '#fff' : '#fff'};text-shadow:${contrast(o.color) === '#111' ? '0 1px 1px rgba(0,0,0,.35)' : 'none'}"><small>${esc(o.label || '')}</small><b>${esc((o.name || '').toUpperCase())}</b><b>${esc(o.surname.length > 10 ? o.surname.slice(0, 9) + '.' : o.surname)}</b></th>`).join('');
    const bands = repBands();
    const repH = ui.rep ? bands.map((b, i) => `<th class="rph c-r" rowspan="3" style="background:${REP_HEAD[i]}"><small>${Math.round(b.min / 60)} ore</small>${b.from}<br>${b.to === '24:00' ? '00:00' : b.to}</th>`).join('') : '';
    return `<thead>
      <tr class="h1"><th class="yr stk c-mb" colspan="3" rowspan="2" style="left:0;width:98px">${year}</th>${covH}${r1}<th class="stk c-dn2 lg" rowspan="3" colspan="2" style="background:#a6a6a6;color:#000;font-size:10px">REPERI-<br>BILITÀ</th>${repH}</tr>
      <tr class="h2">${r2}</tr>
      <tr class="h3"><th class="stk c-mb lg" style="left:0;background:#d9d9d9;color:#555">mese</th><th class="stk c-dn lg" style="background:#fff;color:#0000ff">n.</th><th class="stk c-dw lg" style="background:#ccccff;color:#0000ff">gg</th>${r3}</tr>
    </thead>`;
  }

  function rowHTML(d, first, nRows, mo) {
    const cls = []; const w = dow(d); const fest = store.isFestivo(d);
    if (w === 0) cls.push('dom'); if (fest) cls.push('fest'); if (d === tm) cls.push('today');
    let h = `<tr class="${cls.join(' ')}" data-d="${d}">`;
    if (first) h += `<td class="mb stk c-mb" rowspan="${nRows}">${MONTHS[mo.m].toUpperCase()}${mo.y !== year ? ' ' + mo.y : ''}<span>${mo.m + 1}</span></td>`;
    const dn = +d.slice(8);
    h += `<td class="stk c-dn" data-day="${d}">${dn}</td><td class="stk c-dw" data-day="${d}" title="${fest ? esc(store.config.festNames[d] || 'Festivo') : ''}">${WD[w]}</td>`;
    const cov = coverage(d);
    if (ui.cov) for (const c of COVERAGE) { const v = cov[c.key] || 0; const st = covStyle(c.key, v, cov); h += `<td class="c-cv" style="background:${st.bg};color:${st.fg}">${v}</td>`; }
    // doppioni tra i turnisti (come la formattazione condizionale del foglio)
    const cnt = {};
    if (coverageWant().tm === 1) for (const o of store.ops()) { const c = store.cell(o.id, d); if (c && c.s) { const k = c.s.trim(); if (k !== 'R' && !isSmontoCode(k) && shiftInfo(k).group === 'T') cnt[k] = (cnt[k] || 0) + 1; } }
    ops.forEach((o, i) => {
      const c = store.cell(o.id, d); const key = o.id + '|' + d;
      const pend = store.editing && key in store.pending;
      const as = absStyle(c);
      const s = c && c.s ? shiftInfo(c.s) : null;
      const needsFail = s && s.needs && Object.entries(s.needs).some(([k, n]) => (cov[k] || 0) < n);
      const st = shiftStyle(c, d, { dup: c && c.s && cnt[c.s.trim()] > 1, needsFail });
      const mine = o.id === store.me ? ' mine' : '';
      const tip = esc(`${o.name} ${cap1(o.surname)} — ${fmtDate(d, { wd: true })}\n${describe(c)}${c && c.n ? '\nNota: ' + c.n : ''}`);
      h += `<td class="c-a${pend ? ' pend' : ''}${mine}" data-op="${o.id}" data-d="${d}" data-k="a" style="${as ? `background:${as.bg};color:${as.fg}` : ''}" title="${tip}">${as ? esc(as.t) : ''}</td>`;
      let extra = '';
      if (c && c.n) extra += '<i class="nt"></i>';
      if (ui.avail) { const ag = store.agendaOf(o.id, d); if (ag && ag.c) { const av = AVAILABILITY.find(x => x.code === ag.c); if (av) extra += `<i class="ag" style="background:${av.bg}"></i>`; } }
      h += `<td class="c-s${i === ops.length - 1 ? ' lastop' : ''}${c && c.mk ? ' mk-' + c.mk : ''}${pend ? ' pend' : ''}${mine}" data-op="${o.id}" data-d="${d}" data-k="s" style="background:${st.bg};color:${st.fg};${st.b ? '' : 'font-weight:400'}" title="${tip}">${c && c.s ? esc(c.s) : ''}${extra}</td>`;
    });
    h += `<td class="c-dn2" data-day="${d}">${dn}</td><td class="c-dw2" data-day="${d}">${WD[w]}</td>`;
    if (ui.rep) {
      const r = repOf(d);
      r.forEach((x, i) => {
        const ov = repIsOverride(d, i); const o = store.op(x);
        const pend = store.editing && ('rep|' + d) in store.pending;
        h += `<td class="c-r${ov ? ' ov' : ''}${pend ? ' pend' : ''}" data-rep="${i}" data-d="${d}" style="${ov && o ? `background:${o.color};color:${contrast(o.color)}` : ''}" title="${ov ? 'Cessione / modifica manuale' : 'Automatica da /R'}">${esc(REP_SHORT(x))}</td>`;
      });
    }
    return h + '</tr>';
  }
  function monthBody(mi) {
    const mo = months[mi]; const days = monthDays(mo.y, mo.m);
    return days.map((d, i) => rowHTML(d, i === 0, days.length, mo)).join('');
  }
  function render() {
    const n = cols();
    tbl.className = 'xl' + (ui.compact ? ' compact' : '') + (ui.mine && store.me ? ' dim-others' : '');
    let html = headHTML();
    months.forEach((mo, i) => {
      const rows = monthDays(mo.y, mo.m).length;
      html += `<tbody class="${mo.m % 2 === 0 ? 'mo-odd' : 'mo-even'}" data-mi="${i}">${Math.abs(i - focusMonth) <= 1 ? monthBody(i) : `<tr class="ph"><td colspan="${n}" style="height:${rows * 23}px"></td></tr>`}</tbody>`;
    });
    tbl.innerHTML = html;
    fillRest();
    markSel();
  }
  let fillTimer = null;
  let io = null;
  function fillRest() {
    clearTimeout(fillTimer);
    if (io) { io.disconnect(); io = null; }
    if (ui.lite) {
      // si disegna un mese solo quando sta per entrare nello schermo
      io = new IntersectionObserver(ents => { for (const e of ents) if (e.isIntersecting) { const tb = e.target.closest('tbody'); if (tb && tb.querySelector('tr.ph')) { io.unobserve(e.target); tb.innerHTML = monthBody(+tb.dataset.mi); } } }, { root: sc, rootMargin: '400px 0px' });
      tbl.querySelectorAll('tr.ph').forEach(r => io.observe(r));
      return;
    }
    const todo = months.map((_, i) => i).filter(i => Math.abs(i - focusMonth) > 1).sort((a, b) => Math.abs(a - focusMonth) - Math.abs(b - focusMonth));
    const step = () => {
      const i = todo.shift(); if (i == null) return;
      const tb = tbl.querySelector(`tbody[data-mi="${i}"]`); if (tb && tb.querySelector('tr.ph')) {
        const before = sc.scrollTop, anchor = tb.getBoundingClientRect().top < sc.getBoundingClientRect().top;
        const hBefore = tb.offsetHeight; tb.innerHTML = monthBody(i); if (anchor) sc.scrollTop = before + (tb.offsetHeight - hBefore);
      }
      fillTimer = setTimeout(step, 16);
    };
    fillTimer = setTimeout(step, 60);
  }
  function updateDates(dates) {
    const set = new Set(); for (const d of dates) { set.add(d); set.add(addDays(d, 1)); }
    for (const d of set) {
      const tr = tbl.querySelector(`tr[data-d="${d}"]`); if (!tr) continue;
      const first = !!tr.querySelector('td.mb');
      const mi = months.findIndex(mo => mo.y === yearOf(d) && mo.m === monthIdx(d)); if (mi < 0) continue;
      const tmp = document.createElement('tbody'); tmp.innerHTML = rowHTML(d, first, monthDays(months[mi].y, months[mi].m).length, months[mi]);
      tr.replaceWith(tmp.firstElementChild);
    }
    markSel();
  }
  function refreshHead() { const th = tbl.querySelector('thead'); if (th) { const tmp = document.createElement('table'); tmp.innerHTML = headHTML(); th.replaceWith(tmp.querySelector('thead')); } }

  // ── scorrimento ai mesi ──
  function jump(mi) {
    focusMonth = mi;
    const tb = tbl.querySelector(`tbody[data-mi="${mi}"]`);
    if (tb && tb.querySelector('tr.ph')) tb.innerHTML = monthBody(mi);
    if (tb) sc.scrollTop = tb.offsetTop - tbl.querySelector('thead').offsetHeight;
    highlightSeg(mi);
  }
  function jumpDate(d) {
    const mi = months.findIndex(mo => mo.y === yearOf(d) && mo.m === monthIdx(d)); if (mi < 0) return toast('Data fuori dal calendario', 'warn');
    jump(mi);
    const tr = tbl.querySelector(`tr[data-d="${d}"]`); if (tr) sc.scrollTop = tr.offsetTop - tbl.querySelector('thead').offsetHeight - 60;
  }
  function currentMonth() {
    const top = sc.scrollTop + tbl.querySelector('thead').offsetHeight + 10;
    let cur = 0; tbl.querySelectorAll('tbody').forEach(tb => { if (tb.offsetTop <= top) cur = +tb.dataset.mi; });
    return cur;
  }
  function highlightSeg(mi) { monSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.m === mi)); const ms = $('#mon-sel', el); if (ms) ms.value = String(mi); }
  sc.addEventListener('scroll', () => { const mi = currentMonth(); if (mi !== focusMonth) { focusMonth = mi; highlightSeg(mi); } }, { passive: true });

  // ── legenda ──
  function renderLegend() {
    const lg = $('#legend', el); lg.classList.toggle('hidden', !ui.legend); if (!ui.legend) return;
    const sh = shiftList().map(s => { const st = shiftStyle({ s: s.code }, '2026-01-0' + (s.pos != null ? 1 + ((5 - s.pos) % 5 + 0) : 1)); return `<span class="lg" title="${esc(s.label)}"><b style="background:${st.bg};color:${st.fg}">${esc(s.code)}</b>${esc(s.label)}${s.from ? ` <span class="muted">${s.from}-${s.to}</span>` : ''} <span class="muted">${hm(s.min)}</span></span>`; }).join('');
    const ab = absList().map(a => `<span class="lg"><b style="background:${a.bg};color:${a.fg}">${esc(a.code)}</b>${esc(a.label)}</span>`).join('');
    lg.innerHTML = `<div class="col" style="gap:8px;width:100%"><div class="xl-legend">${sh}</div><div class="xl-legend">${ab}<span class="lg"><b style="background:#00B0F0;color:#fff">1-7</b>Permesso a ore</span><span class="lg"><b style="box-shadow:inset 0 0 0 2px #f00;background:#fff">MAT</b>Esigenza di servizio</span><span class="lg"><b style="box-shadow:inset 0 0 0 2px #00f;background:#fff">POM</b>Richiesta personale</span><span class="lg"><b style="background:#F8CBAD">&nbsp;</b>Nessun turno</span></div><div class="small muted">Il colore del testo dei turnisti indica la <b>linea</b> del ciclo POM → MAT → NOTT → SM → R (5 linee: rosso, verde, blu, arancio, fucsia), come nel file Excel.</div></div>`;
  }

  // ── menu: operatori e vista ──
  function opsMenu(a) {
    const all = store.ops();
    const p = popover(a, [{ html: `<div style="padding:6px 8px;min-width:240px"><div class="pal-sec">Operatori visibili</div>${all.map(o => `<label class="chk" style="padding:4px 0"><input type="checkbox" data-op="${o.id}" ${ui.hide[o.id] ? '' : 'checked'}>${opChip(o.id, { full: true })}</label>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn sm" data-all>Tutti</button><button class="btn sm" data-none>Nessuno</button>${store.me ? '<button class="btn sm" data-me>Solo io</button>' : ''}</div></div>` }]);
    p.addEventListener('change', e => { const op = e.target.dataset.op; if (op) { if (e.target.checked) delete ui.hide[op]; else ui.hide[op] = 1; saveUI(); render(); jump(focusMonth); } });
    p.querySelector('[data-all]').onclick = () => { ui.hide = {}; saveUI(); render(); jump(focusMonth); p.querySelectorAll('input').forEach(i => i.checked = true); };
    p.querySelector('[data-none]').onclick = () => { all.forEach(o => ui.hide[o.id] = 1); saveUI(); render(); p.querySelectorAll('input').forEach(i => i.checked = false); };
    const me = p.querySelector('[data-me]'); if (me) me.onclick = () => { all.forEach(o => ui.hide[o.id] = o.id === store.me ? 0 : 1); delete ui.hide[store.me]; saveUI(); render(); jump(focusMonth); };
  }
  function viewMenu(a) {
    const t = (k, lb, icon) => ({ icon, label: lb, right: ui[k] ? ic('check') : '', run: () => { ui[k] = !ui[k]; saveUI(); render(); jump(focusMonth); } });
    popover(a, [t('lite', 'Modalità leggera (telefoni lenti)', 'speed'), t('compact', 'Vista compatta', 'view_compact'), t('cov', 'Contatori di copertura', 'functions'), t('rep', 'Colonne reperibilità', 'phone_in_talk'), t('avail', 'Disponibilità degli operatori', 'event_available'), ...(store.me ? [t('mine', 'Evidenzia i miei turni', 'person_pin')] : [])]);
  }

  // ── clic sulle caselle ──
  tbl.addEventListener('click', e => {
    const th = e.target.closest('th.oph'); if (th) return opHeaderMenu(th);
    const day = e.target.closest('[data-day]'); if (day) return dayBox(day.dataset.day);
    const rc = e.target.closest('td.c-r'); if (rc) { if (edit) return repEditor(rc.dataset.d, +rc.dataset.rep); return dayBox(rc.dataset.d); }
    if (edit) return;
    const td = e.target.closest('td.c-s, td.c-a'); if (td) cellBox(td.dataset.op, td.dataset.d);
  });
  function opHeaderMenu(th) {
    const id = th.dataset.op; const o = store.op(id);
    popover(th, [
      { icon: 'person', label: `${o.name} ${cap1(o.surname)}`, disabled: true },
      { icon: 'filter_alt', label: 'Mostra solo questo operatore', run: () => { store.ops().forEach(x => ui.hide[x.id] = x.id === id ? 0 : 1); delete ui.hide[id]; saveUI(); render(); jump(focusMonth); } },
      { icon: 'schedule', label: 'Ore e saldo', run: () => ctx.go('ore', { op: id }) },
      { icon: 'view_timeline', label: 'Cartellino annuale', run: () => ctx.go('cartellino', { op: id }) },
      ...(store.isManager() ? [{ icon: 'manage_accounts', label: 'Scheda operatore', run: () => ctx.go('operatori', { op: id }) }] : [])
    ], { align: 'left' });
  }
  function dayBox(d) {
    const fest = store.isFestivo(d); const cov = coverage(d); const r = repOf(d); const bands = repBands();
    modal({
      title: fmtDate(d, { wd: true, year: true }), icon: 'event', size: 'wide',
      body: `<div class="col">${fest ? `<div class="pill info">${ic('celebration')}${esc(store.config.festNames[d] || 'Giorno festivo')}</div>` : ''}
      <div class="row wrap">${COVERAGE.map(c => { const st = covStyle(c.key, cov[c.key] || 0, cov); return `<span class="pill" style="background:${st.bg};color:${st.fg === st.bg ? '#000' : st.fg}">${c.label}: ${cov[c.key] || 0}</span>`; }).join('')}</div>
      <div class="card"><table class="tbl"><thead><tr><th>Operatore</th><th>Turno</th><th>Orario</th><th class="r">Ore</th></tr></thead><tbody>
      ${store.ops().map(o => { const c = store.cell(o.id, d); const s = c && c.s ? shiftInfo(c.s) : null; return `<tr><td>${opChip(o.id, { full: true })}</td><td>${chipFor(c, d)}${c && c.mk ? ` <span class="pill ${c.mk === 'serv' ? 'err' : 'acc'}">${c.mk === 'serv' ? 'esigenza di servizio' : 'richiesta personale'}</span>` : ''}${c && c.n ? `<div class="small muted">${esc(c.n)}</div>` : ''}</td><td class="small">${s && s.from ? s.from + '–' + s.to : ''}</td><td class="r num">${hm(workedMin(c) + creditMin(c, d))}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="sec-t" style="margin-top:6px">Reperibilità</div>
      <div class="grid g4">${bands.map((b, i) => `<div class="card kpi"><span class="k-l">${b.label}</span><span style="font-weight:700">${r[i] ? opChip(r[i], { full: true }) : '<span class="muted">—</span>'}</span>${repIsOverride(d, i) ? '<span class="pill warn" style="width:max-content">ceduta</span>' : ''}</div>`).join('')}</div></div>`
    });
  }
  function cellBox(op, d) {
    const c = store.cell(op, d); const o = store.op(op); const s = c && c.s ? shiftInfo(c.s) : null;
    const m = modal({
      title: `${o.name} ${cap1(o.surname)}`, icon: 'event_note', foot: store.isManager() ? '' : undefined,
      body: `<div class="col"><div class="muted">${esc(fmtDate(d, { wd: true, year: true }))}${store.isFestivo(d) ? ' · festivo' : ''}</div>
      <div style="font-size:16px">${chipFor(c, d, { big: true })}</div>
      <div>${esc(describe(c))}</div>
      ${s && s.group === 'T' ? `<div class="small muted">Linea del ciclo: <b style="color:${lineColor(c.s, d)}">●</b></div>` : ''}
      <div class="grid g2"><div class="card kpi"><span class="k-l">Ore lavorate</span><span class="k-v">${hm(workedMin(c))}</span></div><div class="card kpi"><span class="k-l">Ore accreditate</span><span class="k-v">${hm(creditMin(c, d))}</span></div></div>
      ${c && c.mk ? `<div class="note ${c.mk === 'serv' ? 'err' : ''}">${ic(c.mk === 'serv' ? 'priority_high' : 'person')}<div>${c.mk === 'serv' ? 'Cambio per <b>esigenze di servizio</b>' : 'Cambio per <b>richiesta personale</b>'}</div></div>` : ''}
      ${c && c.n ? `<div class="note">${ic('sticky_note_2')}<div>${esc(c.n)}</div></div>` : ''}
      ${op === store.me ? `<button class="btn" data-req>${ic('assignment_add')}Fai una richiesta per questo giorno</button>` : ''}</div>`
    });
    const rq = m.body.querySelector('[data-req]'); if (rq) rq.onclick = () => { m.close(); ctx.go('richieste', { new: 1, d }); };
    if (m.foot) { m.foot.innerHTML = `<button class="btn pri">${ic('edit')}Modifica</button>`; m.foot.firstChild.onclick = () => { m.close(); ctx.go('modifica', { m: months.findIndex(mo => mo.y === yearOf(d) && mo.m === monthIdx(d)) }); }; }
  }

  // ══ EDITOR ══════════════════════════════════════════════════════════════
  let tool = { kind: 'select', code: null };     // select | shift | abs | rep | erase | mark | hours
  let sel = new Set(), anchor = null, painting = false, stroke = null;
  let clip = null;
  const keyOf = td => td.dataset.op + '|' + td.dataset.d;
  function markSel() { if (!edit) return; tbl.querySelectorAll('td.sel').forEach(t => t.classList.remove('sel')); for (const k of sel) { const [op, d] = k.split('|'); const td = tbl.querySelector(`td.c-s[data-op="${op}"][data-d="${d}"]`); if (td) td.classList.add('sel'); } }

  // applica lo strumento corrente a una casella
  function applyTo(keys, t = tool, label) {
    const changes = [];
    for (const k of keys) {
      const [op, d] = k.split('|');
      const prev = store.cell(op, d); const c = Object.assign({}, prev || {});
      if (t.kind === 'erase') { changes.push({ key: k, val: null }); continue; }
      if (t.kind === 'shift') {
        c.s = t.code;
        if (c.a && !isRest(c) && !c.keepA) { delete c.a; delete c.cr; }
      } else if (t.kind === 'abs') {
        if (prev && prev.a === t.code) { delete c.a; delete c.cr; }
        else {
          c.a = t.code;
          if (prev && prev.s && !isRest(prev) && prev.s.trim() !== '/R') { c.cr = suggestedCredit(op, d, prev); delete c.s; }
          else if (isRest(prev)) delete c.cr;
          else c.cr = suggestedCredit(op, d, prev);
          if (['ng', 'nl'].includes(t.code) && !store.isFestivo(d)) { /* consentito, ma segnalato nei controlli */ }
        }
      } else if (t.kind === 'rep') {
        const s = (c.s || '').trim();
        if (s.includes('/R')) c.s = s === '/R' ? '' : s === 'mat8/R' ? 'matt 8' : s.replace('/R', '');
        else c.s = !s ? '/R' : s === 'matt 8' ? 'mat8/R' : s + '/R';
        if (!shiftInfo(c.s) || shiftInfo(c.s).unknown) { /* codice libero: lasciato com'è */ }
      } else if (t.kind === 'mark') {
        c.mk = c.mk === t.code ? undefined : t.code;
      } else if (t.kind === 'hours') {
        c.ph = t.code || undefined;
      }
      changes.push({ key: k, val: c });
    }
    store.stage(changes, label || toolLabel(t), stroke);
  }
  const toolLabel = t => ({ shift: 'Turno ' + t.code, abs: 'Assenza ' + t.code, rep: 'Reperibilità', erase: 'Cancella', mark: 'Bordo', hours: 'Permesso a ore' }[t.kind] || 'Modifica');

  if (edit) {
    const pal = document.createElement('div'); pal.className = 'palette'; pal.id = 'palette';
    $('.sheet-wrap', el).appendChild(pal);
    const groups = [['T', 'Turnisti'], ['D', 'Diurni'], ['R', 'Riposi'], ['X', 'Altro']];
    pal.innerHTML = `<div class="pal-h" id="pal-h">${ic('palette')}<b>Strumenti</b><span class="tiny muted" id="pal-cur"></span><button class="ibtn" id="pal-min" style="width:30px;height:30px">${ic('unfold_less')}</button></div>
      <div class="pal-b">
        <div class="pal-tools"><button class="btn sm on" data-tool="select">${ic('arrow_selector_tool')}Seleziona</button><button class="btn sm" data-tool="erase">${ic('ink_eraser')}Gomma</button><button class="btn sm" data-tool="rep">${ic('phone_in_talk')}/R</button><button class="btn sm" data-tool="cell">${ic('edit_note')}Dettagli</button></div>
        ${groups.map(([g, lb]) => { const list = shiftList().filter(s => s.group === g); if (!list.length) return ''; return `<div><div class="pal-sec">${lb}</div><div class="pal-grid">${list.map(s => { const st = shiftStyle({ s: s.code }, '2026-01-01'); const col = s.group === 'T' ? '#111' : st.fg; return `<button data-shift="${esc(s.code)}" title="${esc(s.label)}" style="background:${st.bg};color:${col}">${esc(s.code)}</button>`; }).join('')}</div></div>`; }).join('')}
        <div><div class="pal-sec">Assenze</div><div class="pal-grid">${absList().map(a => `<button data-abs="${esc(a.code)}" title="${esc(a.label)}" style="background:${a.bg};color:${a.fg}">${esc(a.code)}</button>`).join('')}</div></div>
        <div><div class="pal-sec">Permesso a ore e bordi</div><div class="pal-grid"><button data-hours title="Permesso straordinario a ore" style="background:#00B0F0;color:#fff">1-7 h</button><button data-mark="serv" title="Esigenza di servizio" style="background:#fff;box-shadow:inset 0 0 0 3px #f00">servizio</button><button data-mark="pers" title="Richiesta personale" style="background:#fff;box-shadow:inset 0 0 0 3px #00f">personale</button><button data-note title="Nota sulla casella" style="background:#fff">nota</button></div></div>
        <div class="small muted" style="line-height:1.45">Scegli un codice e tocca o trascina sulle caselle. Con <b>Seleziona</b>: trascina per selezionare, poi scegli il codice; <kbd>Canc</kbd> svuota, <kbd>Ctrl+C</kbd>/<kbd>Ctrl+V</kbd> copia e incolla, scrivi un codice e premi <kbd>Invio</kbd>. Doppio clic = dettagli.</div>
      </div>`;
    const setTool = (t, btn) => {
      tool = t; pal.querySelectorAll('.on').forEach(b => b.classList.remove('on')); if (btn) btn.classList.add('on');
      $('#pal-cur', pal).textContent = t.kind === 'select' ? '' : (t.code || toolLabel(t));
      sc.style.cursor = t.kind === 'select' ? '' : 'crosshair';
      // con una selezione attiva il codice si applica subito
      if (t.kind !== 'select' && t.kind !== 'cell' && sel.size) { stroke = uid('st'); applyTo([...sel], t); stroke = null; }
    };
    pal.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b || b.id === 'pal-min') return; vibrate();
      if (b.dataset.tool === 'cell') { if (sel.size === 1) cellEditor([...sel][0]); else toast('Seleziona una sola casella', 'warn'); return; }
      if (b.dataset.tool) return setTool({ kind: b.dataset.tool }, b);
      if (b.dataset.shift) return setTool({ kind: 'shift', code: b.dataset.shift }, b);
      if (b.dataset.abs) return setTool({ kind: 'abs', code: b.dataset.abs }, b);
      if (b.dataset.mark) return setTool({ kind: 'mark', code: b.dataset.mark }, b);
      if (b.dataset.hours !== undefined) { const v = await promptBox('Permesso a ore', { label: 'Numero di ore (1-7)', type: 'number', value: '2' }); if (v == null) return; return setTool({ kind: 'hours', code: Math.max(0, Math.min(12, parseInt(v) || 0)) }, b); }
      if (b.dataset.note !== undefined) { if (!sel.size) return toast('Seleziona prima le caselle', 'warn'); const k0 = [...sel][0]; const v = await promptBox('Nota', { label: 'Testo della nota (vuoto per toglierla)', value: (store.cell(...k0.split('|')) || {}).n || '', textarea: true }); if (v == null) return; store.stage([...sel].map(k => ({ key: k, val: Object.assign({}, store.cell(...k.split('|')) || {}, { n: v.trim() || undefined }) })), 'Nota'); }
    });
    $('#pal-min', pal).onclick = () => pal.classList.toggle('min');
    // trascina la tavolozza
    let drag = null;
    $('#pal-h', pal).addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = pal.getBoundingClientRect(), pr = $('.sheet-wrap', el).getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, pr }; pal.setPointerCapture(e.pointerId); });
    pal.addEventListener('pointermove', e => { if (!drag) return; pal.style.left = Math.max(0, e.clientX - drag.dx - drag.pr.left) + 'px'; pal.style.top = Math.max(0, e.clientY - drag.dy - drag.pr.top) + 'px'; pal.style.right = 'auto'; pal.style.bottom = 'auto'; });
    pal.addEventListener('pointerup', () => drag = null);

    // pennello e selezione
    tbl.addEventListener('pointerdown', e => {
      const td = e.target.closest('td.c-s, td.c-a'); if (!td || e.button > 0) return;
      const k = keyOf(td);
      if (tool.kind === 'select') {
        if (e.shiftKey && anchor) selectRect(anchor, k);
        else if (e.ctrlKey || e.metaKey) { if (sel.has(k)) sel.delete(k); else sel.add(k); anchor = k; }
        else { sel = new Set([k]); anchor = k; }
        painting = e.pointerType !== 'touch'; markSel(); return;
      }
      stroke = uid('st'); applyTo([k]); painting = e.pointerType !== 'touch';
      if (painting) e.preventDefault();
    });
    tbl.addEventListener('pointerover', e => {
      if (!painting) return; const td = e.target.closest('td.c-s, td.c-a'); if (!td) return;
      const k = keyOf(td);
      if (tool.kind === 'select') { selectRect(anchor, k); return; }
      applyTo([k]);
    });
    const endPaint = () => { painting = false; stroke = null; };
    window.addEventListener('pointerup', endPaint);
    tbl.addEventListener('dblclick', e => { const td = e.target.closest('td.c-s, td.c-a'); if (td) cellEditor(keyOf(td)); });
    function selectRect(a, b) {
      const [oa, da] = a.split('|'), [ob, db] = b.split('|');
      const ids = ops.map(o => o.id); const i0 = Math.min(ids.indexOf(oa), ids.indexOf(ob)), i1 = Math.max(ids.indexOf(oa), ids.indexOf(ob));
      const d0 = da < db ? da : db, d1 = da < db ? db : da;
      sel = new Set(); for (let d = d0; d <= d1; d = addDays(d, 1)) for (let i = i0; i <= i1; i++) sel.add(ids[i] + '|' + d);
      markSel();
    }
    // tastiera: Canc, copia/incolla, frecce, scrittura veloce del codice
    let typed = '', typedTimer = null;
    const onKey = e => {
      if (document.querySelector('.modal-bg') || /input|textarea|select/i.test(document.activeElement.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const l = store.undo(); if (l) toast('Annullato: ' + (l === true ? '' : l), 'info', { ms: 1400 }); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); store.redo(); return; }
      if (!sel.size) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySel(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteSel(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); applyTo([...sel], { kind: 'erase' }); return; }
      if (e.key.startsWith('Arrow') && anchor) {
        e.preventDefault(); const [op, d] = anchor.split('|'); const ids = ops.map(o => o.id); let i = ids.indexOf(op), dd = d;
        if (e.key === 'ArrowDown') dd = addDays(d, 1); if (e.key === 'ArrowUp') dd = addDays(d, -1); if (e.key === 'ArrowLeft') i = Math.max(0, i - 1); if (e.key === 'ArrowRight') i = Math.min(ids.length - 1, i + 1);
        const k = ids[i] + '|' + dd; if (e.shiftKey) selectRect(anchor.split('|')[0] === ids[i] ? anchor : anchor, k); else { sel = new Set([k]); anchor = k; markSel(); }
        const td = tbl.querySelector(`td.c-s[data-op="${ids[i]}"][data-d="${dd}"]`); if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      if (e.key === 'Enter' && typed) { e.preventDefault(); applyTyped(typed); typed = ''; $('#pal-cur', pal).textContent = ''; return; }
      if (e.key === 'Escape') { sel = new Set(); markSel(); typed = ''; return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { typed += e.key; $('#pal-cur', pal).textContent = '⌨ ' + typed; clearTimeout(typedTimer); typedTimer = setTimeout(() => { typed = ''; $('#pal-cur', pal).textContent = ''; }, 4000); }
    };
    document.addEventListener('keydown', onKey);
    function applyTyped(t) {
      const v = t.trim(); const sh = shiftList().find(s => s.code.toLowerCase() === v.toLowerCase()) || (v.toUpperCase() === 'R' ? shiftList().find(s => s.code === 'R') : null);
      if (sh) return applyTo([...sel], { kind: 'shift', code: sh.code });
      const ab = absList().find(a => a.code.toLowerCase() === v.toLowerCase()); if (ab) return applyTo([...sel], { kind: 'abs', code: ab.code });
      if (/^\d{1,2}$/.test(v)) return applyTo([...sel], { kind: 'hours', code: +v });
      if (v === '/R' || v === '/r') return applyTo([...sel], { kind: 'rep' });
      // codice libero (come scrivere nel foglio)
      return applyTo([...sel], { kind: 'shift', code: v });
    }
    function copySel() {
      const keys = [...sel]; const ids = ops.map(o => o.id);
      const dates = [...new Set(keys.map(k => k.split('|')[1]))].sort(); const opsSel = ids.filter(i => keys.some(k => k.startsWith(i + '|')));
      clip = dates.map(d => opsSel.map(op => store.cell(op, d)));
      toast(`Copiate ${dates.length}×${opsSel.length} caselle`, 'info', { ms: 1500 });
    }
    function pasteSel() {
      if (!clip || !anchor) return; const ids = ops.map(o => o.id); const [op0, d0] = anchor.split('|'); const i0 = ids.indexOf(op0);
      const ch = []; clip.forEach((row, r) => row.forEach((c, k) => { const op = ids[i0 + k]; if (!op) return; ch.push({ key: op + '|' + addDays(d0, r), val: c ? JSON.parse(JSON.stringify(c)) : null }); }));
      store.stage(ch, 'Incolla'); toast('Incollato', 'ok', { ms: 1200 });
    }

    // editor completo della singola casella
    function cellEditor(k) {
      const [op, d] = k.split('|'); const prev = store.cell(op, d) || {}; const o = store.op(op);
      const shOpts = `<option value="">— nessun turno —</option>` + shiftList().map(s => `<option value="${esc(s.code)}" ${prev.s === s.code ? 'selected' : ''}>${esc(s.code)} · ${esc(s.label)}</option>`).join('') + (prev.s && !shiftList().some(s => s.code === prev.s) ? `<option selected value="${esc(prev.s)}">${esc(prev.s)} (libero)</option>` : '');
      const abOpts = `<option value="">— nessuna assenza —</option>` + absList().map(a => `<option value="${esc(a.code)}" ${prev.a === a.code ? 'selected' : ''}>${esc(a.code)} · ${esc(a.label)}</option>`).join('');
      const m = modal({
        title: `${o.name} ${cap1(o.surname)} · ${fmtDate(d, { wd: true })}`, icon: 'edit_note', foot: '',
        body: `<div class="col">
          <div class="grid g2"><label class="field">Turno<select class="inp" id="ce-s">${shOpts}</select></label><label class="field">Codice libero<input class="inp" id="ce-free" placeholder="es. matt2" value=""></label></div>
          <div class="grid g2"><label class="field">Assenza<select class="inp" id="ce-a">${abOpts}</select></label><label class="field">Permesso a ore<input class="inp" id="ce-ph" type="number" min="0" max="12" value="${prev.ph || ''}"></label></div>
          <div class="grid g2"><label class="field">Ore accreditate <span class="hint">conteggio orario (es. 7:25)</span><input class="inp" id="ce-cr" value="${prev.cr != null ? hm(prev.cr) : ''}" placeholder="automatico"></label>
          <label class="field">Motivo del cambio<select class="inp" id="ce-mk"><option value="">—</option><option value="serv" ${prev.mk === 'serv' ? 'selected' : ''}>Esigenza di servizio (bordo rosso)</option><option value="pers" ${prev.mk === 'pers' ? 'selected' : ''}>Richiesta personale (bordo blu)</option></select></label></div>
          <label class="field">Nota<textarea class="inp" id="ce-n" style="min-height:60px">${esc(prev.n || '')}</textarea></label>
          <div class="note small">${ic('lightbulb')}<div>Ore suggerite per un’assenza in questo giorno: <b>${hm(suggestedCredit(op, d, store.rawCell(op, d)))}</b> (turno teorico della linea). Lascia vuoto per il calcolo automatico.</div></div></div>`
      });
      m.foot.innerHTML = `<button class="btn" data-clear>${ic('ink_eraser')}Svuota</button><span class="sp"></span><button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('check')}Applica</button>`;
      m.foot.querySelector('[data-c]').onclick = () => m.close();
      m.foot.querySelector('[data-clear]').onclick = () => { store.stage([{ key: k, val: null }], 'Svuota'); m.close(); };
      m.foot.querySelector('[data-o]').onclick = () => {
        const v = id => m.body.querySelector(id).value.trim();
        const c = {}; const s = v('#ce-free') || v('#ce-s'); if (s) c.s = s;
        if (v('#ce-a')) c.a = v('#ce-a'); if (v('#ce-ph')) c.ph = +v('#ce-ph');
        const cr = parseHM(v('#ce-cr')); if (cr != null) c.cr = cr; else if (c.a && !isRest(c)) c.cr = suggestedCredit(op, d, store.rawCell(op, d));
        if (v('#ce-mk')) c.mk = v('#ce-mk'); if (v('#ce-n')) c.n = v('#ce-n');
        store.stage([{ key: k, val: c }], 'Dettagli casella'); m.close();
      };
    }
    // reperibilità: cessione di una fascia
    function repEditor(d, i) {
      const cur = repOf(d); const def = repDefault(d); const bands = repBands();
      const m = modal({
        title: `Reperibilità · ${fmtDate(d, { wd: true })}`, icon: 'phone_in_talk', foot: '',
        body: `<div class="col"><div class="muted small">Di norma la reperibilità segue chi ha <b>/R</b>: 13-20 e 20-24 del giorno, 00-07 e 07-13 del giorno dopo. Qui puoi cedere una o più fasce (come scrivere un altro nome nelle colonne AQ-AT).</div>
        ${bands.map((b, k) => `<label class="field">${b.label}${k === i ? ' <span class="pill acc">scelta</span>' : ''}<select class="inp" data-b="${k}"><option value="">— nessuno —</option>${store.ops().map(o => `<option value="${o.id}" ${cur[k] === o.id ? 'selected' : ''}>${esc(o.name)} ${esc(cap1(o.surname))}${def[k] === o.id ? ' (automatico)' : ''}</option>`).join('')}</select></label>`).join('')}</div>`
      });
      m.foot.innerHTML = `<button class="btn" data-auto>${ic('autorenew')}Torna automatico</button><span class="sp"></span><button class="btn" data-c>Annulla</button><button class="btn pri" data-o>Applica</button>`;
      m.foot.querySelector('[data-c]').onclick = () => m.close();
      m.foot.querySelector('[data-auto]').onclick = () => { store.stage([{ key: 'rep|' + d, val: null }], 'Reperibilità automatica'); m.close(); };
      m.foot.querySelector('[data-o]').onclick = () => {
        const v = [0, 1, 2, 3].map(k => m.body.querySelector(`[data-b="${k}"]`).value);
        store.stage([{ key: 'rep|' + d, val: JSON.stringify(v) === JSON.stringify(def) ? null : v }], 'Cessione reperibilità'); m.close();
      };
    }
    // pulsanti in alto
    const updPend = () => { const n = store.pendingCount(); $('#pub-n', el).textContent = n || ''; $('#pend-info', el).innerHTML = n ? `${n} modific${n === 1 ? 'a' : 'he'} in bozza` : 'Nessuna modifica in bozza'; };
    updPend();
    $('#btn-undo', el).onclick = () => { const l = store.undo(); if (!l) toast('Niente da annullare', 'info', { ms: 1200 }); };
    $('#btn-redo', el).onclick = () => store.redo();
    $('#btn-discard', el).onclick = async () => { if (!store.pendingCount()) return; if (await confirmBox('Scartare la bozza?', `Le ${store.pendingCount()} modifiche non pubblicate andranno perse.`, { ok: 'Scarta', danger: true })) { store.discard(); toast('Bozza scartata'); } };
    $('#btn-check', el).onclick = () => checkMonth(currentMonth());
    $('#btn-pub', el).onclick = () => publishBox();
    function checkMonth(mi) {
      const mo = months[mi]; const days = monthDays(mo.y, mo.m);
      const iss = validate(days[0], days[days.length - 1]).filter(i => i.level !== 'info');
      modal({ title: `Controlli · ${MONTHS[mo.m]} ${mo.y}`, icon: 'fact_check', size: 'wide', body: iss.length ? `<div class="card"><div class="card-b flush">${iss.map(i => `<div class="list-i click" data-d="${i.date}"><span class="pill ${i.level === 'err' ? 'err' : 'warn'}">${esc(i.cat)}</span><span class="grow">${esc(i.msg)}</span></div>`).join('')}</div></div>` : `<div class="note ok">${ic('verified')}<div>Nessun problema trovato nel mese: coperture, doppioni, sequenze e riposi sono a posto.</div></div>` })
        .body.addEventListener('click', e => { const r = e.target.closest('[data-d]'); if (r) { document.querySelector('.modal-bg [data-x]').click(); jumpDate(r.dataset.d); } });
    }
    async function publishBox() {
      const n = store.pendingCount(); if (!n) return toast('Non ci sono modifiche da pubblicare', 'info');
      const keys = Object.keys(store.pending); const dates = [...new Set(keys.map(k => k.startsWith('rep|') ? k.slice(4) : k.split('|')[1]))].sort();
      const iss = validate(dates[0], dates[dates.length - 1]).filter(i => i.level === 'err');
      const opsT = [...new Set(keys.filter(k => !k.startsWith('rep|')).map(k => k.split('|')[0]))];
      const m = modal({
        title: 'Pubblica le modifiche', icon: 'publish', foot: '',
        body: `<div class="col"><div>Stai per pubblicare <b>${n}</b> modific${n === 1 ? 'a' : 'he'} (dal ${fmtDate(dates[0])} al ${fmtDate(dates[dates.length - 1])}).</div>
        <div class="row wrap">${opsT.map(o => opChip(o)).join(' ')}</div>
        <div class="small muted">Gli operatori coinvolti riceveranno la notifica «I tuoi turni sono cambiati».</div>
        ${iss.length ? `<div class="note warn">${ic('warning')}<div><b>${iss.length} problemi di copertura</b> nel periodo, ad es.: ${esc(iss.slice(0, 3).map(i => i.msg).join('; '))}</div></div>` : ''}
        <label class="field">Nota per lo storico (facoltativa)<input class="inp" id="pb-note" placeholder="es. cambio turno Rossi/Bianchi"></label></div>`
      });
      m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('publish')}Pubblica</button>`;
      m.foot.querySelector('[data-c]').onclick = () => m.close();
      m.foot.querySelector('[data-o]').onclick = async () => {
        const b = m.foot.querySelector('[data-o]'); b.disabled = true; b.innerHTML = 'Pubblicazione…';
        try { const k = await store.publish(m.body.querySelector('#pb-note').value.trim()); m.close(); toast(`Pubblicate ${k} modifiche`); }
        catch (e) { console.error(e); toast('Errore: ' + e.message, 'err'); b.disabled = false; b.textContent = 'Riprova'; }
      };
    }
    var cleanupEdit = () => { document.removeEventListener('keydown', onKey); window.removeEventListener('pointerup', endPaint); };
    var updPendRef = updPend;
  }

  // ── stampa del mese (come il foglio "stampe mensili") ──
  function printMonth(mi) {
    const mo = months[mi]; const days = monthDays(mo.y, mo.m); const all = store.ops();
    const bands = repBands();
    const rows = days.map(d => {
      const w = dow(d); const cov = coverage(d); const r = repOf(d);
      return `<tr style="${w === 0 ? 'border-bottom:3px solid #cc00ff' : ''}"><td style="background:#00ff00;font-weight:700">${cov.tm + cov.dm}</td><td style="background:#00ff00;font-weight:700">${cov.tp + cov.dp}</td><td style="background:#00ff00;font-weight:700">${cov.tn}</td>
        <td style="color:#00f;font-weight:700;${store.isFestivo(d) ? 'background:#0ff' : ''}">${+d.slice(8)}</td><td style="color:#00f;background:${store.isFestivo(d) ? '#0ff' : w === 0 ? '#ccff33' : '#ccccff'}">${WD[w]}</td>
        ${all.map(o => { const c = store.cell(o.id, d); const st = shiftStyle(c, d); const a = absStyle(c); return `<td style="background:${a ? a.bg : st.bg};color:${a ? a.fg : st.fg};font-weight:700">${esc(c && c.s ? c.s : (a ? a.t : ''))}</td>`; }).join('')}
        ${r.map((x, i) => `<td style="font-size:9px;${repIsOverride(d, i) && store.op(x) ? `background:${store.op(x).color};color:${contrast(store.op(x).color)}` : ''}">${esc(REP_SHORT(x))}</td>`).join('')}</tr>`;
    }).join('');
    const pa = $('#print-area');
    pa.innerHTML = `<div class="paper"><div class="ph"><img src="assets/icon-118-192.png"><div><b style="font-size:16px">${esc(store.config.app.title)} — ${MONTHS[mo.m]} ${mo.y}</b><div style="font-size:11px">${esc(store.config.app.unit || '')}</div></div></div>
      <table style="margin-top:10px"><thead><tr><th style="color:#ffc000">M</th><th style="color:#f0f">P</th><th style="color:#00f">N</th><th colspan="2"></th>${all.map(o => `<th style="background:${o.color};color:#fff;font-size:10px">${esc(o.surname)}</th>`).join('')}${bands.map(b => `<th style="background:#00b0f0;color:#fff;font-size:9px">${b.from}<br>${b.to}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <div style="font-size:9px;margin-top:6px">Stampato il ${new Date().toLocaleString('it-IT')} · M/P/N = coperture mattina, pomeriggio, notte</div></div>`;
    setTimeout(() => window.print(), 150);
  }

  // ── reazioni ai cambiamenti ──
  const off = store.on((what, info) => {
    if (what === 'cells') {
      if (info && info.keys && info.keys.length < 400) updateDates(info.keys.map(k => k.startsWith('rep|') ? k.slice(4) : k.split('|')[1]));
      else { render(); jump(focusMonth); }
      if (edit && typeof updPendRef === 'function') updPendRef();
      clearTimeout(headT); headT = setTimeout(refreshHead, 600);
    }
    if (what === 'config') { render(); jump(focusMonth); }
    if (what === 'agenda' && ui.avail) render();
  });
  let headT = null;

  render(); renderLegend();
  requestAnimationFrame(() => { if (params.d) jumpDate(params.d); else jump(focusMonth); });
  return () => { off(); clearTimeout(fillTimer); if (io) io.disconnect(); if (typeof cleanupEdit === 'function') cleanupEdit(); if (edit) store.stopEdit(); };
}
