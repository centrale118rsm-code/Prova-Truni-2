// ═══════════════════════════════════════════════════════════════════════════
// AREA PERSONALE — la mia pagina, disponibilità e agenda (con conciliazione
// famiglia, come le colonne personali del foglio TURNI), notifiche, calendario .ics
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, today, addDays, fmtDate, fmtShort, hm, monthDays, dow, mondayOf, pad, download, relTime, yearOf, monthIdx, parse, stamp } from '../util.js';
import { ic, modal, toast, popover, chipFor, opChip, avatar, cap1, shiftStyle, absStyle, donut } from '../ui.js';
import { shiftInfo, absInfo, weeks, yearStats, repOf, repBands, workedMin, creditMin, describe, hasRep, busyWindows } from '../calc.js';
import { AVAILABILITY } from '../profile.js';

function whoFor(params, el, ctx) {
  const id = params.op || store.me;
  if (!id || !store.op(id)) {
    el.innerHTML = `<div class="page"><div class="card"><div class="empty">${ic('person_search')}<div style="font-weight:700;color:var(--ink);margin-bottom:6px">Scegli chi sei</div><div>Per vedere la pagina personale scegli il tuo nome.</div><div class="row wrap" style="justify-content:center;margin-top:16px">${store.ops().map(o => `<button class="btn" data-op="${o.id}">${avatar(o.id)} ${esc(o.name)} ${esc(cap1(o.surname))}</button>`).join('')}</div></div></div></div>`;
    el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { if (store.isManager()) ctx.go(location.hash.includes('agenda') ? 'agenda' : 'me', { op: b.dataset.op }); else { store.setMe(b.dataset.op); } });
    return null;
  }
  return id;
}

// ── La mia pagina ──
export function home(el, params, ctx) {
  const id = whoFor(params, el, ctx); if (!id) return;
  const o = store.op(id); const y = store.config.year; const tm = today();
  ctx.setTitle(id === store.me ? 'La mia pagina' : `Pagina di ${o.name} ${cap1(o.surname)}`, `${o.label || store.profile.roleOne} · ${y}`);
  let calM = yearOf(tm) === y ? monthIdx(tm) : 0;
  const draw = () => {
    const c = store.cell(id, tm); const s = c && c.s ? shiftInfo(c.s) : null;
    // prossimo turno lavorato
    let next = null; for (let d = addDays(tm, 1); d <= addDays(tm, 60); d = addDays(d, 1)) { const x = store.cell(id, d); if (x && x.s && workedMin(x) > 0) { next = d; break; } }
    const st = yearStats(id, y); const w = weeks(id, y);
    const curW = w.find(x => x.monday <= tm && x.sunday >= tm); const lastClosed = [...w].reverse().find(x => x.sunday < tm);
    const bal = lastClosed ? lastClosed.balance : (o.initBalance || 0);
    const rToday = repOf(tm); const bands = repBands();
    const myRep = rToday.map((x, i) => x === id ? bands[i].label : null).filter(Boolean);
    const mates = c && c.s ? store.ops().filter(x => x.id !== id).map(x => ({ x, c: store.cell(x.id, tm) })).filter(z => z.c && z.c.s && workedMin(z.c) > 0) : [];
    const myReq = Object.values(store.requests).filter(r => r.op === id).sort((a, b) => b.ts - a.ts).slice(0, 4);
    el.innerHTML = `<div class="page">
      <div class="hero"><div class="row wrap" style="gap:18px;align-items:flex-start">
        ${avatar(id, 'lg')}
        <div class="grow"><h2>${greet()} ${esc(o.name)}</h2><p>${esc(fmtDate(tm, { wd: true, year: true }))}${store.isFestivo(tm) ? ' · festivo' : ''}</p>
          <div class="row wrap" style="margin-top:14px;gap:22px">
            <div><div class="small" style="opacity:.75">Oggi</div><div class="hero-shift">${c ? esc(c.s || (c.a ? absInfo(c.a).label : '—')) : '—'}</div><div class="small" style="opacity:.85">${s && s.from ? `${s.from} – ${s.to}` : (c && c.a ? absInfo(c.a).label : describe(c))}</div></div>
            <div><div class="small" style="opacity:.75">Prossimo turno</div><div style="font-size:20px;font-weight:700;margin-top:4px">${next ? esc(store.cell(id, next).s) : '—'}</div><div class="small" style="opacity:.85">${next ? esc(fmtDate(next, { wd: true })) : ''}</div></div>
            <div><div class="small" style="opacity:.75">Reperibilità oggi</div><div style="font-size:15px;font-weight:700;margin-top:6px">${myRep.length ? myRep.join(' · ') : 'no'}</div></div>
          </div></div>
        <div class="col" style="gap:8px"><button class="btn" data-a="req">${ic('assignment_add')}Nuova richiesta</button><button class="btn" data-a="ics">${ic('calendar_add_on')}Calendario sul telefono</button><button class="btn" data-a="cal">${ic('calendar_month')}Vedi nel foglio</button></div>
      </div></div>

      <div class="sec-t">Prossimi 14 giorni</div>
      <div class="day-strip">${Array.from({ length: 14 }, (_, i) => addDays(tm, i)).map(d => { const x = store.cell(id, d); const ss = x && x.s ? shiftStyle(x, d) : null; const a = absStyle(x); return `<div class="day-tile ${d === tm ? 'today' : ''} ${store.isFestivo(d) ? 'fest' : ''}" data-d="${d}"><div class="dt-w">${WD[dow(d)]}</div><div class="dt-d">${+d.slice(8)}</div><div class="dt-s" style="background:${a && !x.s ? a.bg : ss ? ss.bg : 'var(--bg-2)'};color:${a && !x.s ? a.fg : ss ? ss.fg : 'var(--muted)'}">${esc(x ? (x.s || (a ? a.t : '')) : '—')}</div>${hasRep(x) ? '<div class="tiny" style="color:#9C0006;font-weight:700;margin-top:3px">REP</div>' : ''}</div>`; }).join('')}</div>

      <div class="grid g4 mt">
        ${kpi('Saldo ore', hm(bal, { plus: true }), lastClosed ? `al ${fmtDate(lastClosed.sunday)}` : 'saldo iniziale', bal >= 0 ? 'var(--ok)' : 'var(--err)', 'schedule')}
        ${kpi('Questa settimana', curW ? hm(curW.total) : '—', `su ${hm(o.weeklyMin || store.profile.weeklyMin)} previste`, 'var(--accent)', 'date_range')}
        ${kpi('Ferie ' + y, st.ferieRestanti, `rimaste su ${st.ferieSpettanti}${st.ferieAP ? ` · residuo ${y - 1}: ${st.ferieAPRestanti}` : ''}`, st.ferieRestanti < 0 ? 'var(--err)' : '#ca8a04', 'beach_access')}
        ${kpi('Permessi', `${st.permGgRestanti} gg · ${st.permOreRestanti} h`, `pn usati: ${st.pn}`, '#16a34a', 'event_available')}
        ${kpi('Reperibilità', st.rep, `${hm(st.repMin)} ore nell’anno`, '#db2777', 'phone_in_talk')}
        ${kpi('Festivi lavorati', st.festLav, `${hm(st.oreFestLav)} ore · non goduti ${st.fng}`, '#0891b2', 'celebration')}
        ${kpi('Notti', st.notti, `${st.weekend} weekend lavorati`, '#4f46e5', 'dark_mode')}
        ${kpi('Turno / diurno / casa', `${st.turno}/${st.diurno}/${st.casa}`, 'giorni nell’anno', '#475569', 'pie_chart')}
      </div>

      <div class="grid g2 mt">
        <div class="card"><div class="card-h"><span class="ms ico">calendar_month</span><h3 class="grow" id="cm-title"></h3><button class="ibtn" data-cm="-1">${ic('chevron_left')}</button><button class="ibtn" data-cm="1">${ic('chevron_right')}</button></div><div class="card-b"><div class="cal-month" id="cm"></div></div></div>
        <div class="col" style="gap:16px">
          <div class="card"><div class="card-h"><span class="ms ico">groups</span><h3>Oggi in servizio con te</h3></div><div class="card-b flush">${mates.length ? mates.map(z => `<div class="list-i">${avatar(z.x.id)}<span class="grow"><b>${esc(z.x.name)} ${esc(cap1(z.x.surname))}</b>${z.x.phone ? `<div class="small muted">${esc(z.x.phone)}</div>` : ''}</span>${chipFor(z.c, tm)}</div>`).join('') : `<div class="empty" style="padding:20px">${ic('weekend')}${c && c.s ? 'Nessun collega in turno' : 'Oggi non sei in turno'}</div>`}</div></div>
          <div class="card"><div class="card-h"><span class="ms ico">assignment</span><h3 class="grow">Le mie richieste</h3><a href="#/richieste" class="btn sm ghost">Tutte</a></div><div class="card-b flush">${myReq.length ? myReq.map(r => `<div class="list-i"><span class="grow"><b>${esc(r.title || r.type)}</b><div class="small muted">${esc(r.from ? fmtDate(r.from) : '')}${r.to && r.to !== r.from ? ' → ' + fmtDate(r.to) : ''}</div></span>${statusPill(r.status)}</div>`).join('') : `<div class="empty" style="padding:20px">${ic('inbox')}Nessuna richiesta</div>`}</div></div>
        </div>
      </div></div>`;
    el.querySelector('[data-a="req"]').onclick = () => ctx.go('richieste', { new: 1 });
    el.querySelector('[data-a="ics"]').onclick = () => exportICS(id);
    el.querySelector('[data-a="cal"]').onclick = () => { ctx.go('calendario', { d: tm }); };
    el.querySelectorAll('.day-tile').forEach(t => t.onclick = () => dayInfo(id, t.dataset.d));
    el.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { calM = Math.max(0, Math.min(12, calM + +b.dataset.cm)); drawMonth(); });
    drawMonth();
  };
  const drawMonth = () => {
    const yy = calM === 12 ? y + 1 : y, mm = calM % 12;
    el.querySelector('#cm-title').textContent = `${MONTHS[mm]} ${yy}`;
    el.querySelector('#cm').innerHTML = monthGrid(yy, mm, d => { const x = store.cell(id, d); const ss = x && x.s ? shiftStyle(x, d) : null; const a = absStyle(x); return x ? `<div class="s" style="background:${a && !x.s ? a.bg : ss.bg};color:${a && !x.s ? a.fg : ss.fg}">${esc(x.s || a.t)}</div>${x.a && x.s ? `<div class="s" style="background:${a.bg};color:${a.fg}">${esc(a.t)}</div>` : ''}` : ''; });
    el.querySelectorAll('#cm [data-d]').forEach(t => t.onclick = () => dayInfo(id, t.dataset.d));
  };
  draw();
  const off = store.on(w => { if (['cells', 'requests', 'config'].includes(w)) draw(); });
  return off;
}
const greet = () => { const h = new Date().getHours(); return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; };
export const statusPill = s => ({ attesa: `<span class="pill warn">${ic('hourglass_top')}In attesa</span>`, collega: `<span class="pill info">${ic('person')}Attende il collega</span>`, approvata: `<span class="pill ok">${ic('check_circle')}Approvata</span>`, rifiutata: `<span class="pill err">${ic('cancel')}Rifiutata</span>`, ritirata: `<span class="pill">${ic('undo')}Ritirata</span>` }[s] || `<span class="pill">${esc(s || '')}</span>`);
function kpi(l, v, s, color, icon) { return `<div class="card kpi"><span class="k-ico" style="background:color-mix(in srgb, ${color} 14%, transparent);color:${color}">${ic(icon)}</span><span class="k-l">${esc(l)}</span><span class="k-v">${esc(String(v))}</span><span class="k-s">${esc(s)}</span></div>`; }
export { kpi };

export function monthGrid(y, m, cellFn, extraCls = () => '') {
  const days = monthDays(y, m); const first = days[0]; const start = mondayOf(first); const tm = today();
  let h = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => `<div class="cm-h">${d}</div>`).join('');
  for (let d = start; d <= days[days.length - 1] || dow(d) !== 1; d = addDays(d, 1)) {
    if (d > days[days.length - 1] && dow(d) === 1) break;
    const out = d < first || d > days[days.length - 1];
    h += `<div class="cm-d ${out ? 'out' : ''} ${d === tm ? 'today' : ''} ${store.isFestivo(d) ? 'fest' : ''} ${dow(d) === 0 ? 'sun' : ''} ${extraCls(d)}" data-d="${d}"><span class="n">${+d.slice(8)}</span>${out ? '' : cellFn(d)}</div>`;
  }
  return h;
}

function dayInfo(id, d) {
  const c = store.cell(id, d); const s = c && c.s ? shiftInfo(c.s) : null; const r = repOf(d); const bands = repBands();
  const mates = store.ops().filter(x => x.id !== id).map(x => ({ x, c: store.cell(x.id, d) })).filter(z => z.c && z.c.s && workedMin(z.c) > 0);
  modal({
    title: fmtDate(d, { wd: true, year: true }), icon: 'event',
    body: `<div class="col"><div style="font-size:18px">${chipFor(c, d, { big: true })}</div><div>${esc(describe(c))}</div>
    ${c && c.n ? `<div class="note">${ic('sticky_note_2')}<div>${esc(c.n)}</div></div>` : ''}
    <div class="grid g2"><div class="card kpi"><span class="k-l">Ore</span><span class="k-v">${hm(workedMin(c) + creditMin(c))}</span></div><div class="card kpi"><span class="k-l">Reperibile</span><span style="font-weight:700">${r.map((x, i) => x === id ? bands[i].label : '').filter(Boolean).join(', ') || 'no'}</span></div></div>
    <div class="sec-t" style="margin:4px 0">Colleghi in servizio</div><div class="col" style="gap:6px">${mates.map(z => `<div class="row">${opChip(z.x.id, { full: true })}<span class="sp"></span>${chipFor(z.c, d)}</div>`).join('') || '<span class="muted">nessuno</span>'}</div></div>`
  });
}

// ── Calendario .ics per il telefono ──
export function exportICS(id) {
  const o = store.op(id); const y = store.config.year;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Turni118//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:Turni ${o.name} ${cap1(o.surname)}`, 'X-WR-TIMEZONE:Europe/Rome'];
  const dt = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
  for (let d = addDays(today(), -31); d <= `${y + 1}-01-31`; d = addDays(d, 1)) {
    const c = store.cell(id, d); if (!c) continue;
    const s = c.s ? shiftInfo(c.s) : null;
    const uidv = `${id}-${d}@turni118`;
    if (s && s.from && s.to) {
      const end = s.to === '24:00' ? dt(addDays(d, 1), '00:00') : dt(d, s.to);
      L.push('BEGIN:VEVENT', `UID:${uidv}`, `DTSTAMP:${dt(today(), '00:00')}`, `DTSTART;TZID=Europe/Rome:${dt(d, s.from)}`, `DTEND;TZID=Europe/Rome:${end}`, `SUMMARY:${c.s}${hasRep(c) ? ' (reperibile)' : ''}`, `DESCRIPTION:${describe(c).replace(/[,;]/g, ' ')}`, 'END:VEVENT');
    } else if (c.s || c.a) {
      L.push('BEGIN:VEVENT', `UID:${uidv}`, `DTSTAMP:${dt(today(), '00:00')}`, `DTSTART;VALUE=DATE:${d.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(d, 1).replace(/-/g, '')}`, `SUMMARY:${c.a ? absInfo(c.a).label : c.s}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
  }
  L.push('END:VCALENDAR');
  download(`turni-${o.surname.toLowerCase()}.ics`, L.join('\r\n'), 'text/calendar');
  toast('File calendario scaricato: aprilo per aggiungerlo al telefono');
}

// ── Disponibilità e agenda ──
export function agenda(el, params, ctx) {
  const id = whoFor(params, el, ctx); if (!id) return;
  const o = store.op(id); const y = store.config.year; const tm = today();
  ctx.setTitle('Disponibilità e agenda', `${o.name} ${cap1(o.surname)}`);
  let m = yearOf(tm) === y ? monthIdx(tm) : 0; let brush = 'o';
  const canEdit = id === store.me || store.isManager();
  const draw = () => {
    const yy = m === 12 ? y + 1 : y, mm = m % 12;
    const ag = store.agenda[id] || {};
    const partner = (ag._partner && ag._partner.n) || '';
    // conflitti: giorni in cui lavorate tutti e due nella stessa fascia (colonne MICHI/MARY del foglio)
    let conflicts = 0;
    const days = monthDays(yy, mm);
    for (const d of days) if (conflict(id, d)) conflicts++;
    el.innerHTML = `<div class="page">
      <div class="page-h"><div><h2>Disponibilità e agenda</h2><p>Segna i giorni in cui sei libero, impossibilitato o disponibile solo mattina/pomeriggio: il coordinatore li vede mentre prepara i turni. Aggiungi note personali e i turni di un familiare per vedere i giorni “scoperti”.</p></div></div>
      <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:16px" id="ag-grid">
        <div class="card"><div class="card-h"><button class="ibtn" data-m="-1">${ic('chevron_left')}</button><h3 class="grow" style="text-align:center">${MONTHS[mm]} ${yy}</h3><button class="ibtn" data-m="1">${ic('chevron_right')}</button></div>
          <div class="card-b"><div class="cal-month" id="ag-cal">${monthGrid(yy, mm, d => {
            const x = store.cell(id, d); const a = (store.agenda[id] || {})[d]; const ss = x && x.s ? shiftStyle(x, d) : null; const ab = absStyle(x);
            const av = a && a.c ? AVAILABILITY.find(v => v.code === a.c) : null;
            return `${x ? `<div class="s" style="background:${ab && !x.s ? ab.bg : ss.bg};color:${ab && !x.s ? ab.fg : ss.fg}">${esc(x.s || ab.t)}</div>` : ''}${a && a.p ? `<div class="s" style="background:var(--bg-2);color:var(--ink-2)">${esc(partner ? partner.slice(0, 5) : 'fam')}: ${esc(a.p)}</div>` : ''}${a && a.n ? `<div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.n)}</div>` : ''}${av ? `<span class="ag" style="background:${av.bg};color:${av.fg}">${esc(av.code)}</span>` : ''}${conflict(id, d) ? `<span class="ms" style="position:absolute;bottom:3px;right:3px;font-size:15px;color:var(--err)" title="Lavorate entrambi">warning</span>` : ''}`;
          })}</div></div></div>
        <div class="col" style="gap:16px">
          <div class="card"><div class="card-h"><span class="ms ico">brush</span><h3>Segna la disponibilità</h3></div><div class="card-b col">
            <div class="row wrap" id="brush">${AVAILABILITY.map(a => `<button class="btn sm ${brush === a.code ? 'pri' : ''}" data-b="${esc(a.code)}" style="${brush === a.code ? '' : `border-color:${a.bg}`}"><b style="background:${a.bg};color:${a.fg};padding:0 6px;border-radius:4px">${esc(a.code)}</b>${esc(a.label)}</button>`).join('')}<button class="btn sm ${brush === '' ? 'pri' : ''}" data-b="">${ic('ink_eraser')}Togli</button><button class="btn sm ${brush === 'note' ? 'pri' : ''}" data-b="note">${ic('sticky_note_2')}Nota</button><button class="btn sm ${brush === 'fam' ? 'pri' : ''}" data-b="fam">${ic('family_restroom')}Turno familiare</button></div>
            <div class="small muted">${canEdit ? 'Scegli una voce e tocca i giorni del calendario.' : 'Sola lettura.'}</div></div></div>
          <div class="card"><div class="card-h"><span class="ms ico">family_restroom</span><h3>Conciliazione famiglia</h3></div><div class="card-b col">
            <label class="field">Nome del familiare<input class="inp" id="pt-name" value="${esc(partner)}" placeholder="es. Maria" ${canEdit ? '' : 'disabled'}></label>
            <div class="row"><span class="pill ${conflicts ? 'err' : 'ok'}">${ic(conflicts ? 'warning' : 'check')}${conflicts} giorni con entrambi al lavoro</span></div>
            <div class="small muted">Inserisci i turni del familiare con “Turno familiare” (es. M, P, N, matt, pome, R): l’app segnala i giorni in cui lavorate tutti e due nella stessa fascia.</div></div></div>
          <div class="card"><div class="card-h"><span class="ms ico">summarize</span><h3>Riepilogo del mese</h3></div><div class="card-b">${AVAILABILITY.map(a => `<div class="row" style="padding:4px 0"><b style="background:${a.bg};color:${a.fg};padding:0 6px;border-radius:4px;min-width:30px;text-align:center">${esc(a.code)}</b><span class="grow">${esc(a.label)}</span><b>${days.filter(d => (ag[d] || {}).c === a.code).length}</b></div>`).join('')}</div></div>
        </div></div></div>`;
    if (innerWidth < 900) el.querySelector('#ag-grid').style.gridTemplateColumns = '1fr';
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { m = Math.max(0, Math.min(12, m + +b.dataset.m)); draw(); });
    el.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { brush = b.dataset.b; draw(); });
    const pn = el.querySelector('#pt-name'); pn.onchange = () => store.setAgenda(id, '_partner', { n: pn.value.trim() });
    el.querySelectorAll('#ag-cal [data-d]').forEach(t => t.onclick = async () => {
      if (!canEdit || t.classList.contains('out')) return;
      const d = t.dataset.d; const cur = Object.assign({}, (store.agenda[id] || {})[d] || {});
      if (brush === 'note') { const { promptBox } = await import('../ui.js'); const v = await promptBox('Nota del ' + fmtDate(d), { value: cur.n || '', textarea: true }); if (v == null) return; cur.n = v.trim(); }
      else if (brush === 'fam') { const { promptBox } = await import('../ui.js'); const v = await promptBox('Turno del familiare · ' + fmtDate(d), { label: 'Codice (M, P, N, matt, pome, R, …) — vuoto per togliere', value: cur.p || '' }); if (v == null) return; cur.p = v.trim(); }
      else cur.c = cur.c === brush ? '' : brush;
      for (const k of Object.keys(cur)) if (!cur[k]) delete cur[k];
      await store.setAgenda(id, d, Object.keys(cur).length ? cur : null);
    });
  };
  draw();
  return store.on(w => { if (w === 'agenda' || w === 'cells') draw(); });
}
function band(code) {
  if (!code) return null; const c = code.trim().toLowerCase();
  if (/^(m|mat|matt|mattina)/.test(c)) return 'm'; if (/^(p|pom|pome|pomeriggio)/.test(c)) return 'p'; if (/^(n|nott|notte)/.test(c)) return 'n'; return null;
}
function conflict(id, d) {
  const a = (store.agenda[id] || {})[d]; if (!a || !a.p) return false;
  const c = store.cell(id, d); if (!c || !c.s || !workedMin(c)) return false;
  const mine = band(c.s.replace('/R', '')) || (c.s === 'SM' ? 'n' : null);
  return mine && mine === band(a.p);
}

// ── Notifiche ──
export function notifications(el, params, ctx) {
  const draw = () => {
    const list = store.myNotif();
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Notifiche</h2><p>Cambi di turno, esiti delle richieste, avvisi del coordinatore.</p></div><div class="acts"><button class="btn" data-all>${ic('done_all')}Segna tutte come lette</button></div></div>
      <div class="card">${list.length ? list.map(([nid, n]) => `<div class="list-i" style="${n.read ? 'opacity:.62' : ''}"><span class="ms" style="color:${n.read ? 'var(--faint)' : 'var(--accent)'}">${n.kind === 'turni' ? 'event_repeat' : n.kind === 'richiesta' ? 'assignment' : 'notifications'}</span>
        <div class="grow"><b>${esc(n.title)}</b><div class="small muted">${esc(n.body || '')}${n.dates ? n.dates.slice(0, 12).map(d => `<span class="pill" style="margin:3px 3px 0 0">${esc(fmtShort(d))} ${store.me ? chipFor(store.cell(store.me, d), d) : ''}</span>`).join('') : ''}</div>${n.note ? `<div class="small">“${esc(n.note)}”</div>` : ''}</div>
        <span class="small muted nowrap">${relTime(n.ts)}</span>${n.read ? '' : `<button class="btn sm" data-r="${nid}">Letta</button>`}</div>`).join('') : `<div class="empty">${ic('notifications_off')}Nessuna notifica</div>`}</div></div>`;
    el.querySelector('[data-all]').onclick = () => store.markRead(list.filter(([, n]) => !n.read).map(([i]) => i));
    el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => store.markRead([b.dataset.r]));
  };
  draw();
  return store.on(w => { if (w === 'notif') draw(); });
}
