// ═══════════════════════════════════════════════════════════════════════════
// SQUADRA — bacheca degli avvisi, uscite di gruppo (chi è libero), ruota della sfiga
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, today, addDays, fmtDate, fmtShort, rangeDays, uid, relTime, dow, stamp, vibrate } from '../util.js';
import { ic, modal, toast, confirmBox, chipFor, opChip, avatar, cap1 } from '../ui.js';
import { freeFor, busyWindows } from '../calc.js';

// ── Bacheca ──
export function board(el, params, ctx) {
  const draw = () => {
    const list = [...(store.config.announcements || [])].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts)
      .filter(a => store.isManager() || !a.to || a.to === '*' || a.to === store.me);
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Bacheca</h2><p>Comunicazioni del coordinamento a tutta la squadra.</p></div>${store.isManager() ? `<div class="acts"><button class="btn pri" id="add">${ic('add')}Nuovo avviso</button><button class="btn" id="wel">${ic('waving_hand')}Messaggio all’apertura</button></div>` : ''}</div>
      <div class="col" style="gap:14px">${list.length ? list.map(a => `<div class="card"><div class="card-h">${ic(a.pinned ? 'push_pin' : 'campaign', 'fill')}<h3 class="grow">${esc(a.title)}</h3>${a.to && a.to !== '*' ? `<span class="pill acc">per ${esc(store.opName(a.to))}</span>` : ''}${a.until && a.until < today() ? '<span class="pill">scaduto</span>' : ''}${a.popup ? '<span class="pill info">si apre all’avvio</span>' : ''}
        ${store.isManager() ? `<button class="ibtn" data-ed="${a.id}">${ic('edit')}</button><button class="ibtn" data-del="${a.id}">${ic('delete')}</button>` : ''}</div>
        <div class="card-b"><div style="white-space:pre-wrap;line-height:1.55">${esc(a.text)}</div><div class="small muted mt">${esc(a.by || '')} · ${stamp(a.ts)}${a.until ? ' · fino al ' + fmtDate(a.until) : ''}</div></div></div>`).join('') : `<div class="card"><div class="empty">${ic('campaign')}Nessun avviso in bacheca</div></div>`}</div></div>`;
    if (store.isManager()) {
      el.querySelector('#add').onclick = () => edit();
      el.querySelector('#wel').onclick = welcome;
      el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => edit((store.config.announcements || []).find(a => a.id === b.dataset.ed)));
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('Eliminare l’avviso?', '', { danger: true, ok: 'Elimina' })) await store.saveConfig({ announcements: store.config.announcements.filter(a => a.id !== b.dataset.del) }, 'Avviso eliminato'); });
    }
  };
  function edit(a) {
    a = a || { id: uid('a'), title: '', text: '', popup: true, pinned: false, to: '*', until: '' };
    const m = modal({
      title: a.title ? 'Modifica avviso' : 'Nuovo avviso', icon: 'campaign', foot: '',
      body: `<div class="col"><label class="field">Titolo<input class="inp" id="t" value="${esc(a.title)}"></label><label class="field">Testo<textarea class="inp" id="x" style="min-height:120px">${esc(a.text)}</textarea></label>
      <div class="grid g2"><label class="field">Destinatari<select class="inp" id="to"><option value="*">Tutti</option>${store.ops().map(o => `<option value="${o.id}" ${a.to === o.id ? 'selected' : ''}>${esc(o.name)} ${esc(cap1(o.surname))}</option>`).join('')}</select></label><label class="field">Visibile fino al<input class="inp" type="date" id="u" value="${a.until || ''}"></label></div>
      <label class="chk"><input type="checkbox" id="p" ${a.popup ? 'checked' : ''}>Mostra in una finestra all’apertura dell’app</label><label class="chk"><input type="checkbox" id="pin" ${a.pinned ? 'checked' : ''}>Fissa in alto</label><label class="chk"><input type="checkbox" id="nt" checked>Invia anche una notifica</label></div>`
    });
    m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('send')}Pubblica</button>`;
    m.foot.querySelector('[data-c]').onclick = () => m.close();
    m.foot.querySelector('[data-o]').onclick = async () => {
      const v = s => m.body.querySelector(s);
      if (!v('#t').value.trim()) return toast('Scrivi un titolo', 'warn');
      const n = Object.assign({}, a, { title: v('#t').value.trim(), text: v('#x').value, to: v('#to').value, until: v('#u').value || '', popup: v('#p').checked, pinned: v('#pin').checked, ts: a.ts || Date.now(), by: store.whoName() });
      const list = (store.config.announcements || []).filter(x => x.id !== n.id).concat(n);
      await store.saveConfig({ announcements: list }, 'Avviso in bacheca');
      if (v('#nt').checked) await store.notify(n.to || '*', n.title, n.text.slice(0, 140), { kind: 'avviso' });
      m.close(); toast('Avviso pubblicato');
    };
  }
  function welcome() {
    const w = store.config.welcome || {};
    const m = modal({ title: 'Messaggio all’apertura', icon: 'waving_hand', foot: '', body: `<div class="col"><label class="chk"><input type="checkbox" id="a" ${w.active ? 'checked' : ''}>Attivo (compare una volta per sessione)</label><label class="field">Titolo<input class="inp" id="t" value="${esc(w.title || 'Attenzione')}"></label><label class="field">Testo<textarea class="inp" id="x">${esc(w.text || 'In caso di dubbio verifica sempre i turni cartacei in guardiola.')}</textarea></label></div>` });
    m.foot.innerHTML = `<button class="btn pri">Salva</button>`;
    m.foot.firstChild.onclick = async () => { await store.saveConfig({ welcome: { active: m.body.querySelector('#a').checked, title: m.body.querySelector('#t').value, text: m.body.querySelector('#x').value } }, 'Messaggio di benvenuto'); m.close(); toast('Salvato'); };
  }
  draw();
  return store.on(w => { if (w === 'config') draw(); });
}

// ── Uscite di gruppo ──
const SLOTS = { colazione: ['Colazione', '07:30', '09:30', 'free_breakfast'], pranzo: ['Pranzo', '12:30', '14:30', 'lunch_dining'], aperitivo: ['Aperitivo', '18:30', '20:30', 'local_bar'], cena: ['Cena', '20:30', '23:30', 'dinner_dining'] };
export function outing(el, params, ctx) {
  let slot = 'cena', from = today(), to = addDays(today(), 30), sel = new Set(store.ops().map(o => o.id));
  const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const draw = () => {
    const [lb, a, b] = SLOTS[slot];
    const days = rangeDays(from, to).map(d => {
      const free = store.ops().filter(o => sel.has(o.id) && freeFor(o.id, d, toM(a), toM(b)) && !(slot !== 'colazione' && store.cell(o.id, addDays(d, 1)) && (store.cell(o.id, addDays(d, 1)).s || '').startsWith('MAT') && slot === 'cena' && false));
      return { d, free, busy: store.ops().filter(o => sel.has(o.id) && !free.includes(o)) };
    });
    const best = [...days].sort((x, y) => y.free.length - x.free.length).slice(0, 5);
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Uscite di gruppo</h2><p>Scegli il momento e il periodo: l’app trova i giorni in cui siete liberi in più persone.</p></div></div>
      <div class="card mb"><div class="card-b col"><div class="row wrap">${Object.entries(SLOTS).map(([k, v]) => `<button class="btn ${slot === k ? 'pri' : ''}" data-s="${k}">${ic(v[3])}${v[0]} <span class="small" style="opacity:.75">${v[1]}-${v[2]}</span></button>`).join('')}</div>
      <div class="row wrap"><label class="field">Dal<input class="inp" type="date" id="f" value="${from}"></label><label class="field">Al<input class="inp" type="date" id="t" value="${to}"></label></div>
      <div class="row wrap">${store.ops().map(o => `<label class="chk" style="padding:4px 10px;border:1px solid var(--line);border-radius:20px"><input type="checkbox" data-o="${o.id}" ${sel.has(o.id) ? 'checked' : ''}>${esc(o.name)} ${esc(cap1(o.surname))}</label>`).join('')}</div></div></div>
      <div class="sec-t">I giorni migliori per: ${esc(lb.toLowerCase())}</div>
      <div class="grid g3 mb">${best.map((x, i) => `<div class="card kpi" style="${i === 0 ? 'border-color:var(--ok);box-shadow:0 0 0 2px var(--ok-soft)' : ''}"><span class="k-l">${i === 0 ? ic('emoji_events') + ' ' : ''}${esc(fmtDate(x.d, { wd: true }))}</span><span class="k-v">${x.free.length} / ${sel.size}</span><span class="k-s">${x.free.map(o => esc(o.name)).join(', ') || 'nessuno'}</span><button class="btn sm" data-wa="${x.d}" style="margin-top:8px;width:max-content">${ic('share')}Proponi su WhatsApp</button></div>`).join('')}</div>
      <div class="card"><table class="tbl"><thead><tr><th>Giorno</th><th>Liberi</th><th>Occupati</th></tr></thead><tbody>${days.map(x => `<tr><td class="nowrap"><b>${esc(fmtShort(x.d))}</b>${store.isFestivo(x.d) ? ' <span class="pill info">festivo</span>' : ''}</td><td>${x.free.map(o => opChip(o.id)).join(' ')}</td><td class="small muted">${x.busy.map(o => `${esc(cap1(o.surname))} (${esc((busyWindows(o.id, x.d)[0] || {}).why || '')})`).join(', ')}</td></tr>`).join('')}</tbody></table></div></div>`;
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { slot = b.dataset.s; draw(); });
    el.querySelector('#f').onchange = e => { from = e.target.value || from; draw(); };
    el.querySelector('#t').onchange = e => { to = e.target.value || to; draw(); };
    el.querySelectorAll('[data-o]').forEach(c => c.onchange = () => { if (c.checked) sel.add(c.dataset.o); else sel.delete(c.dataset.o); draw(); });
    el.querySelectorAll('[data-wa]').forEach(b => b.onclick = () => { const x = days.find(z => z.d === b.dataset.wa); const txt = `${lb} di squadra ${fmtDate(x.d, { wd: true })} (${a})? Liberi: ${x.free.map(o => o.name).join(', ')} 🍽️`; window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank'); });
  };
  draw();
}

// ── Ruota della sfiga ──
export function wheel(el, params, ctx) {
  let sel = new Set(store.ops().map(o => o.id)); let angle = 0, spinning = false;
  const hist = store.lsGet('gt2:wheel') || [];
  el.innerHTML = `<div class="page"><div class="page-h"><div><h2>La ruota della sfiga</h2><p>A chi tocca? Scegli i partecipanti e gira la ruota. Chi viene estratto può essere tolto dal giro successivo.</p></div></div>
    <div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(260px,1fr);gap:16px" id="wg">
      <div class="card"><div class="card-b col" style="align-items:center"><div class="wheel-wrap"><div class="wheel-pin"></div><canvas id="cv" width="460" height="460"></canvas></div><button class="btn red lg" id="spin">${ic('casino')}Gira la ruota</button><div id="res" style="font-size:20px;font-weight:800;min-height:30px"></div></div></div>
      <div class="col" style="gap:16px"><div class="card"><div class="card-h"><span class="ms ico">group</span><h3>Partecipanti</h3></div><div class="card-b col" id="pp"></div></div>
      <div class="card"><div class="card-h"><span class="ms ico">history</span><h3 class="grow">Estrazioni</h3><button class="btn sm ghost" id="clr">Pulisci</button></div><div class="card-b flush" id="hh"></div></div></div></div></div>`;
  if (innerWidth < 900) el.querySelector('#wg').style.gridTemplateColumns = '1fr';
  const cv = el.querySelector('#cv'), g = cv.getContext('2d');
  const list = () => store.ops().filter(o => sel.has(o.id));
  function paint() {
    const L = list(), n = Math.max(1, L.length), R = 220, cx = 230, cy = 230;
    g.clearRect(0, 0, 460, 460);
    L.forEach((o, i) => {
      const a0 = angle + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath(); g.fillStyle = o.color; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(cx, cy); g.rotate(a0 + Math.PI / n); g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '700 17px Inter, sans-serif'; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 3; g.fillText(cap1(o.surname), R - 16, 6); g.restore();
    });
    g.beginPath(); g.arc(cx, cy, 34, 0, 2 * Math.PI); g.fillStyle = '#0c1424'; g.fill(); g.fillStyle = '#fff'; g.font = '800 16px Inter'; g.textAlign = 'center'; g.fillText('118', cx, cy + 6);
  }
  function side() {
    el.querySelector('#pp').innerHTML = store.ops().map(o => `<label class="chk"><input type="checkbox" data-o="${o.id}" ${sel.has(o.id) ? 'checked' : ''}>${opChip(o.id, { full: true })}</label>`).join('');
    el.querySelectorAll('[data-o]').forEach(c => c.onchange = () => { if (c.checked) sel.add(c.dataset.o); else sel.delete(c.dataset.o); paint(); });
    el.querySelector('#hh').innerHTML = hist.slice(-8).reverse().map(h => `<div class="list-i">${opChip(h.op, { full: true })}<span class="sp"></span><span class="small muted">${relTime(h.ts)}</span></div>`).join('') || '<div class="empty" style="padding:16px">Nessuna estrazione</div>';
  }
  el.querySelector('#clr').onclick = () => { hist.length = 0; store.lsSet('gt2:wheel', hist); side(); };
  el.querySelector('#spin').onclick = () => {
    const L = list(); if (spinning || !L.length) return;
    if (L.length === 1) return done(L[0]);
    spinning = true; vibrate(20);
    const win = Math.floor(Math.random() * L.length); const n = L.length;
    // il puntatore è in alto (-90°): si ferma al centro del settore vincente
    const target = -Math.PI / 2 - (win + 0.5) * 2 * Math.PI / n;
    const start = angle, total = (target - start) % (2 * Math.PI) - 2 * Math.PI * (5 + Math.random() * 2);
    const t0 = performance.now(), dur = 4200;
    const step = t => { const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 4); angle = start + total * e; paint(); if (p < 1) requestAnimationFrame(step); else { spinning = false; done(L[win]); } };
    requestAnimationFrame(step);
  };
  function done(o) {
    vibrate([30, 40, 30]);
    el.querySelector('#res').innerHTML = `🎯 Tocca a <span style="color:${o.color}">${esc(o.name)} ${esc(cap1(o.surname))}</span>`;
    hist.push({ op: o.id, ts: Date.now() }); store.lsSet('gt2:wheel', hist); side();
    modal({ title: 'Il verdetto della ruota', icon: 'casino', body: `<div style="text-align:center;padding:10px">${avatar(o.id, 'lg')}<div style="font-size:24px;font-weight:800;margin-top:10px">${esc(o.name)} ${esc(cap1(o.surname))}</div><div class="muted">Mi dispiace… tocca a te! 😅</div><button class="btn mt" id="rm">${ic('person_remove')}Togli dal prossimo giro</button></div>` }).body.querySelector('#rm').onclick = function () { sel.delete(o.id); paint(); side(); document.querySelector('.modal-bg [data-x]').click(); };
  }
  paint(); side();
}
