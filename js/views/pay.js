// ═══════════════════════════════════════════════════════════════════════════
// PAGHE E INDENNITÀ — riepilogo mensile per l'ufficio del personale:
// ore lavorate, notturne (fascia configurabile, di norma 22-06), festive (festivi
// e, se scelto, domeniche), festive notturne, notti, buoni pasto, reperibilità,
// ore oltre il contratto. Tariffe in euro configurabili; esportazione CSV e stampa.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, MONTHS, WD, today, addDays, fmtShort, hm, parseHM, monthDays, dow, download, yearOf, monthIdx, contrast } from '../util.js';
import { ic, modal, toast, opChip, cap1, chipFor } from '../ui.js';
import { shiftInfo, workedMin, weeks, repOf, repBands, isNightCode, hasRep } from '../calc.js';

export const PAY_DEFAULTS = { nightFrom: '22:00', nightTo: '06:00', sundayFestive: true, minMeal: 360, rNight: 0, rFest: 0, rFestNight: 0, rNightShift: 0, rRep: 0, rMeal: 0, rOver: 0 };
const toM = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const eur = v => v ? v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : '—';

// Minuti notturni di un intervallo nella giornata (la fascia può passare la mezzanotte)
function nightMin(from, to, P) {
  const nf = toM(P.nightFrom), nt = toM(P.nightTo);
  const wins = nf > nt ? [[nf, 1440], [0, nt]] : [[nf, nt]];
  return wins.reduce((s, [w0, w1]) => s + overlap(from, to, w0, w1), 0);
}

export function payRow(op, y, m, P) {
  const r = { worked: 0, night: 0, fest: 0, festNight: 0, nights: 0, shifts: 0, meals: 0, repMin: 0, repN: 0, over: 0, days: [] };
  const bands = repBands();
  for (const d of monthDays(y, m)) {
    const c = store.cell(op, d); const s = c && c.s ? shiftInfo(c.s) : null; const w = workedMin(c);
    const festive = store.isFestivo(d) || (P.sundayFestive && dow(d) === 0);
    let nm = 0, fm = 0, fnm = 0;
    if (s && s.from && s.to && w > 0) {
      const a = toM(s.from), b = s.to === '24:00' ? 1440 : toM(s.to);
      nm = nightMin(a, b, P); if (festive) { fm = w; fnm = nm; }
      r.shifts++; if (w >= P.minMeal) r.meals++;
      if (isNightCode(c.s)) r.nights++;
    }
    let rm = 0; repOf(d).forEach((x, i) => { if (x === op) rm += bands[i].min; });
    if (hasRep(c)) r.repN++;
    r.worked += w; r.night += nm; r.fest += fm; r.festNight += fnm; r.repMin += rm;
    r.days.push({ d, c, w, nm, fm, rm, festive });
  }
  // ore oltre il contratto: settimane che finiscono nel mese, solo la parte positiva
  for (const wk of weeks(op, y)) if (wk.sunday.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}` && wk.delta > 0) r.over += wk.delta;
  r.eur = {
    night: (r.night - r.festNight) / 60 * P.rNight, fest: (r.fest - r.festNight) / 60 * P.rFest, festNight: r.festNight / 60 * P.rFestNight,
    nightShift: r.nights * P.rNightShift, rep: r.repMin / 60 * P.rRep, meal: r.meals * P.rMeal, over: r.over / 60 * P.rOver
  };
  r.eur.tot = Object.values(r.eur).reduce((a, b) => a + b, 0);
  return r;
}

export function pay(el, params, ctx) {
  if (!store.isManager()) { el.innerHTML = `<div class="page"><div class="empty">${ic('lock')}Area riservata</div></div>`; ctx.askLogin('coord', () => ctx.go('paghe')); return; }
  let mi = yearOf(today()) === store.config.year ? monthIdx(today()) : 0;
  const draw = () => {
    const P = Object.assign({}, PAY_DEFAULTS, store.config.pay || {});
    const y = mi === 12 ? store.config.year + 1 : store.config.year, m = mi % 12;
    const rows = store.ops().map(o => ({ o, r: payRow(o.id, y, m, P) }));
    const T = k => rows.reduce((a, x) => a + x.r[k], 0); const TE = k => rows.reduce((a, x) => a + x.r.eur[k], 0);
    const anyRate = P.rNight || P.rFest || P.rFestNight || P.rNightShift || P.rRep || P.rMeal || P.rOver;
    el.innerHTML = `<div class="page wide"><div class="page-h"><div><h2>Paghe e indennità</h2><p>Riepilogo del mese per l’ufficio del personale. Ore notturne dalle ${P.nightFrom} alle ${P.nightTo}; festive = festivi${P.sundayFestive ? ' e domeniche' : ''}; buono pasto per turni di almeno ${hm(P.minMeal)} ore.</p></div>
      <div class="acts"><select class="inp" id="mo" style="width:auto">${MONTHS.map((mm, i) => `<option value="${i}" ${mi === i ? 'selected' : ''}>${mm} ${store.config.year}</option>`).join('')}<option value="12" ${mi === 12 ? 'selected' : ''}>Gennaio ${store.config.year + 1}</option></select><button class="btn" id="rates">${ic('euro')}Tariffe</button><button class="btn" id="csv">${ic('download')}CSV</button><button class="btn" id="pr">${ic('print')}Stampa</button></div></div>
      ${anyRate ? '' : `<div class="note mb">${ic('info')}<div>Le ore sono già calcolate. Per vedere anche gli <b>importi in euro</b> imposta le tariffe con il pulsante “Tariffe”.</div></div>`}
      <div class="card"><div class="tbl-wrap"><table class="tbl pay-tbl" id="ptbl"><thead><tr><th>Operatore</th><th class="r">Turni</th><th class="r">Ore lavorate</th><th class="r">Notturne</th><th class="r">Festive</th><th class="r">Fest. notturne</th><th class="r">Notti</th><th class="r">Buoni pasto</th><th class="r">Reperib. (n / ore)</th><th class="r">Oltre contratto</th>${anyRate ? '<th class="r">Totale €</th>' : ''}</tr></thead>
      <tbody>${rows.map(({ o, r }) => `<tr data-op="${o.id}" style="cursor:pointer"><td>${opChip(o.id, { full: true })}</td><td class="num">${r.shifts}</td><td class="num">${hm(r.worked)}</td><td class="num">${hm(r.night)}</td><td class="num">${hm(r.fest)}</td><td class="num">${hm(r.festNight)}</td><td class="num">${r.nights}</td><td class="num">${r.meals}</td><td class="num">${r.repN} / ${hm(r.repMin)}</td><td class="num ${r.over ? 'pos' : ''}">${hm(r.over)}</td>${anyRate ? `<td class="num b">${eur(r.eur.tot)}</td>` : ''}</tr>`).join('')}</tbody>
      <tfoot><tr><td>Totale</td><td class="num">${T('shifts')}</td><td class="num">${hm(T('worked'))}</td><td class="num">${hm(T('night'))}</td><td class="num">${hm(T('fest'))}</td><td class="num">${hm(T('festNight'))}</td><td class="num">${T('nights')}</td><td class="num">${T('meals')}</td><td class="num">${T('repN')} / ${hm(T('repMin'))}</td><td class="num">${hm(T('over'))}</td>${anyRate ? `<td class="num">${eur(TE('tot'))}</td>` : ''}</tr></tfoot></table></div></div>
      <div class="small muted mt">Tocca un operatore per il dettaglio giorno per giorno. Gli importi sono indicativi: verifica sempre le tariffe del contratto in vigore.</div></div>`;
    el.querySelector('#mo').onchange = e => { mi = +e.target.value; draw(); };
    el.querySelector('#rates').onclick = () => ratesBox(P);
    el.querySelectorAll('tr[data-op]').forEach(t => t.onclick = () => detail(t.dataset.op, y, m, P));
    el.querySelector('#csv').onclick = () => {
      const head = ['Operatore', 'Turni', 'Ore lavorate', 'Ore notturne', 'Ore festive', 'Ore festive notturne', 'Notti', 'Buoni pasto', 'Reperibilità (n)', 'Reperibilità (ore)', 'Ore oltre contratto', '€ notturne', '€ festive', '€ festive notturne', '€ turni notte', '€ reperibilità', '€ buoni pasto', '€ straordinari', '€ totale'];
      const lines = [head].concat(rows.map(({ o, r }) => [`${o.surname} ${o.name}`.trim(), r.shifts, hm(r.worked), hm(r.night), hm(r.fest), hm(r.festNight), r.nights, r.meals, r.repN, hm(r.repMin), hm(r.over), ...['night', 'fest', 'festNight', 'nightShift', 'rep', 'meal', 'over', 'tot'].map(k => r.eur[k].toFixed(2).replace('.', ','))]));
      download(`paghe-${store.profile.key}-${y}-${String(m + 1).padStart(2, '0')}.csv`, '﻿' + lines.map(l => l.map(v => /[;"]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n'), 'text/csv');
    };
    el.querySelector('#pr').onclick = () => {
      const t = el.querySelector('#ptbl').outerHTML.replace(/class="tbl pay-tbl"/, '');
      document.querySelector('#print-area').innerHTML = `<div class="paper"><div class="ph"><img src="assets/icon-118-192.png"><div><b style="font-size:16px">Paghe e indennità — ${MONTHS[m]} ${y}</b><div style="font-size:11px">${esc(store.config.app.title)} · ${esc(store.config.app.unit || '')}</div></div></div><div style="margin-top:10px">${t}</div><div style="font-size:9px;margin-top:6px">Notturne ${P.nightFrom}-${P.nightTo} · festive: festivi${P.sundayFestive ? ' e domeniche' : ''} · stampato il ${new Date().toLocaleString('it-IT')}</div></div>`;
      setTimeout(() => print(), 150);
    };
  };
  function ratesBox(P) {
    const f = (id, l, v, hint = '') => `<label class="field">${l}${hint ? ` <span class="hint">${hint}</span>` : ''}<input class="inp" id="${id}" value="${v}"></label>`;
    const mm = modal({
      title: 'Parametri e tariffe', icon: 'euro', size: 'wide', foot: '',
      body: `<div class="col"><div class="grid g3">${f('nf', 'Inizio fascia notturna', P.nightFrom)}${f('nt', 'Fine fascia notturna', P.nightTo)}${f('mm', 'Buono pasto da (ore)', hm(P.minMeal))}</div>
      <label class="chk"><input type="checkbox" id="sf" ${P.sundayFestive ? 'checked' : ''}>Le domeniche contano come ore festive</label>
      <div class="sec-t" style="margin:4px 0 0">Tariffe in euro</div>
      <div class="grid g4">${f('r1', 'Ora notturna', P.rNight, '€/h')}${f('r2', 'Ora festiva', P.rFest, '€/h')}${f('r3', 'Ora festiva notturna', P.rFestNight, '€/h')}${f('r4', 'Turno di notte', P.rNightShift, '€ a turno')}</div>
      <div class="grid g4">${f('r5', 'Ora di reperibilità', P.rRep, '€/h')}${f('r6', 'Buono pasto', P.rMeal, '€')}${f('r7', 'Ora oltre contratto', P.rOver, '€/h')}</div></div>`
    });
    mm.foot.innerHTML = `<button class="btn pri">${ic('save')}Salva</button>`;
    const num = id => parseFloat(String(mm.body.querySelector('#' + id).value).replace(',', '.')) || 0;
    mm.foot.firstChild.onclick = async () => {
      await store.saveConfig({ pay: { nightFrom: mm.body.querySelector('#nf').value, nightTo: mm.body.querySelector('#nt').value, minMeal: parseHM(mm.body.querySelector('#mm').value) || 360, sundayFestive: mm.body.querySelector('#sf').checked, rNight: num('r1'), rFest: num('r2'), rFestNight: num('r3'), rNightShift: num('r4'), rRep: num('r5'), rMeal: num('r6'), rOver: num('r7') } }, 'Tariffe paghe');
      mm.close(); toast('Tariffe salvate');
    };
  }
  function detail(op, y, m, P) {
    const r = payRow(op, y, m, P);
    modal({
      title: `${store.opName(op)} · ${MONTHS[m]} ${y}`, icon: 'payments', size: 'wide',
      body: `<div class="card"><div class="tbl-wrap" style="max-height:60vh"><table class="tbl"><thead><tr><th>Giorno</th><th>Turno</th><th class="r">Ore</th><th class="r">Notturne</th><th class="r">Festive</th><th class="r">Reperib.</th></tr></thead><tbody>${r.days.map(x => `<tr style="${x.festive ? 'background:var(--info-soft)' : ''}"><td class="nowrap">${esc(fmtShort(x.d))}</td><td>${chipFor(x.c, x.d)}</td><td class="r num">${x.w ? hm(x.w) : ''}</td><td class="r num">${x.nm ? hm(x.nm) : ''}</td><td class="r num">${x.fm ? hm(x.fm) : ''}</td><td class="r num">${x.rm ? hm(x.rm) : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid g4 mt">${[['Notturne', hm(r.night), r.eur.night], ['Festive', hm(r.fest), r.eur.fest + r.eur.festNight], ['Reperibilità', hm(r.repMin), r.eur.rep], ['Oltre contratto', hm(r.over), r.eur.over]].map(([l, h, e]) => `<div class="card kpi"><span class="k-l">${l}</span><span class="k-v">${h}</span><span class="k-s">${eur(e)}</span></div>`).join('')}</div>`
    });
  }
  draw();
  return store.on(w => { if (w === 'cells' || w === 'config') draw(); });
}
