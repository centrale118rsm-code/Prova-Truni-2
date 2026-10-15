// ═══════════════════════════════════════════════════════════════════════════
// BORSA SCAMBI — "metto in borsa il mio turno": i colleghi vedono le offerte con
// l'indicazione se per loro vanno bene (sono liberi, rispettano il riposo), si
// propongono; chi ha offerto sceglie; il coordinatore approva e il calendario si aggiorna.
// Le offerte vivono nell'archivio delle richieste (tipo "offerta").
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, WD, today, addDays, fmtDate, fmtShort, relTime, dow, rangeDays, hm } from '../util.js';
import { ic, modal, toast, confirmBox, chipFor, opChip, avatar, cap1 } from '../ui.js';
import { shiftInfo, workedMin, isRest, isNightCode, isSmontoCode, absInfo } from '../calc.js';

const offers = () => Object.values(store.requests).filter(r => r.type === 'offerta');
const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Va bene per me prendere il turno di quel giorno?
export function fitFor(me, d, code) {
  const mine = store.cell(me, d);
  if (mine && mine.a && !isRest(mine)) return { ok: false, why: `sei assente (${absInfo(mine.a).label.toLowerCase()})` };
  if (mine && mine.s && workedMin(mine)) return { ok: false, why: `lavori già (${mine.s})`, swap: true };
  if (mine && mine.s && isSmontoCode(mine.s)) return { ok: false, why: 'smonti dalla notte' };
  const s = shiftInfo(code); const prev = store.cell(me, addDays(d, -1)); const next = store.cell(me, addDays(d, 1));
  if (s && s.from && prev && prev.s && isNightCode(prev.s)) return { ok: false, why: 'la notte prima sei di turno' };
  if (s && s.to && next && next.s) { const ns = shiftInfo(next.s); if (ns && ns.from && (1440 - toM(s.to === '24:00' ? '24:00' : s.to) + toM(ns.from)) < 11 * 60 && workedMin(next)) return { ok: 'warn', why: `poco riposo prima del turno ${next.s} del giorno dopo` }; }
  return { ok: true, why: 'sei libero quel giorno' };
}
export function marketBadge() {
  if (!store.me) return '';
  const n = offers().filter(o => o.status === 'aperta' && o.op !== store.me && o.from >= today() && fitFor(store.me, o.from, o.code).ok === true).length;
  return n || '';
}

export function market(el, params, ctx) {
  const me = store.me;
  if (!me) { el.innerHTML = `<div class="page"><div class="empty">${ic('person_search')}Scegli prima chi sei.</div></div>`; return; }
  let tab = 'colleghi';
  const draw = () => {
    const open = offers().filter(o => o.status === 'aperta' && o.from >= today()).sort((a, b) => a.from < b.from ? -1 : 1);
    const theirs = open.filter(o => o.op !== me);
    const mine = offers().filter(o => o.op === me).sort((a, b) => b.ts - a.ts);
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Borsa scambi</h2><p>Metti in borsa un tuo turno da cedere o da scambiare: i colleghi vedono subito se per loro va bene. Quando vi accordate, la richiesta passa al coordinatore.</p></div><div class="acts"><button class="btn pri lg" id="add">${ic('add_business')}Metti un turno in borsa</button></div></div>
      <div class="tabs" style="width:max-content;max-width:100%;margin-bottom:14px"><button data-t="colleghi" class="${tab === 'colleghi' ? 'on' : ''}">${ic('storefront')}Offerte dei colleghi (${theirs.length})</button><button data-t="mie" class="${tab === 'mie' ? 'on' : ''}">${ic('sell')}Le mie offerte (${mine.filter(o => o.status === 'aperta').length})</button></div>
      <div class="col" style="gap:10px">${tab === 'colleghi' ? (theirs.map(o => card(o, me)).join('') || empty('Nessun turno in borsa al momento')) : (mine.map(o => card(o, me)).join('') || empty('Non hai turni in borsa'))}</div></div>`;
    el.querySelector('#add').onclick = () => newOffer(me);
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act, store.requests[b.dataset.id], me, b.dataset.extra));
  };
  draw();
  return store.on(w => { if (w === 'requests' || w === 'cells') draw(); });
}
const empty = t => `<div class="card"><div class="empty">${ic('storefront')}${t}</div></div>`;

function card(o, me) {
  const c = store.cell(o.op, o.from); const fit = o.op !== me ? fitFor(me, o.from, o.code) : null;
  const fitHtml = fit ? `<span class="mk-fit" style="background:${fit.ok === true ? 'var(--ok-soft)' : fit.ok === 'warn' ? 'var(--warn-soft)' : 'var(--err-soft)'};color:${fit.ok === true ? 'var(--ok)' : fit.ok === 'warn' ? 'var(--warn)' : 'var(--err)'}">${ic(fit.ok === true ? 'check_circle' : fit.ok === 'warn' ? 'warning' : 'block')} ${esc(fit.why)}</span>` : '';
  const props = (o.proposals || []);
  const myProp = props.find(p => p.op === me);
  let actions = '';
  if (o.op === me && o.status === 'aperta') actions = `<button class="btn sm" data-act="ritira" data-id="${o.id}">${ic('undo')}Ritira</button>`;
  else if (o.status === 'aperta' && !myProp) {
    if (o.mode === 'cedo' && fit.ok) actions = `<button class="btn sm ok" data-act="prendo" data-id="${o.id}">${ic('front_hand')}Lo prendo</button>`;
    actions += `<button class="btn sm" data-act="propongo" data-id="${o.id}">${ic('swap_horiz')}Propongo uno scambio</button>`;
  } else if (myProp) actions = `<span class="pill info">${ic('hourglass_top')}hai proposto ${myProp.date ? 'il ' + esc(fmtShort(myProp.date)) : 'di prenderlo'}</span>`;
  const propList = o.op === me && props.length ? `<div class="col" style="gap:6px;margin-top:10px">${props.map((p, i) => `<div class="row" style="padding:8px 10px;border-radius:10px;background:var(--surface-2)">${avatar(p.op)}<span class="grow small"><b>${esc(store.opName(p.op))}</b> ${p.date ? `ti dà il suo ${esc(fmtShort(p.date))} ${chipFor(store.cell(p.op, p.date), p.date)}` : 'prende il turno'}</span>${o.status === 'aperta' ? `<button class="btn sm ok" data-act="accetto" data-id="${o.id}" data-extra="${i}">${ic('handshake')}Accetto</button>` : ''}</div>`).join('')}</div>` : '';
  const status = o.status === 'aperta' ? '' : `<span class="pill ${o.status === 'accordo' ? 'ok' : ''}">${o.status === 'accordo' ? 'accordo trovato · al coordinatore' : esc(o.status)}</span>`;
  return `<div class="mk-card"><div class="mk-date"><small>${WD[dow(o.from)]}</small><b>${+o.from.slice(8)}</b><small>${fmtDate(o.from).split(' ')[1].slice(0, 3)}</small></div>
    <div class="grow"><div class="row wrap" style="gap:8px">${chipFor(c, o.from)}<span class="pill ${o.mode === 'cedo' ? 'acc' : 'warn'}">${o.mode === 'cedo' ? 'da cedere' : 'da scambiare'}</span>${status}${fitHtml}</div>
    <div class="small muted" style="margin-top:6px">${o.op !== me ? `${opChip(o.op, { full: true })} · ` : ''}messo in borsa ${relTime(o.ts)}${o.wish ? ` · preferirebbe: ${esc(o.wish)}` : ''}</div>${o.text ? `<div class="small" style="margin-top:4px">“${esc(o.text)}”</div>` : ''}${propList}</div>
    <div class="row wrap" style="justify-content:flex-end">${actions}</div></div>`;
}

function newOffer(me) {
  const days = rangeDays(addDays(today(), 1), addDays(today(), 75)).filter(d => { const c = store.cell(me, d); return c && c.s && workedMin(c) > 0 && !isSmontoCode(c.s); });   // lo smonto segue la propria notte
  if (!days.length) return toast('Non hai turni nei prossimi mesi da mettere in borsa', 'info');
  const m = modal({
    title: 'Metti un turno in borsa', icon: 'add_business', foot: '',
    body: `<div class="col"><label class="field">Quale turno<select class="inp" id="d">${days.map(d => `<option value="${d}">${esc(fmtDate(d, { wd: true }))} · ${esc(store.cell(me, d).s)}</option>`).join('')}</select></label>
      <div class="field">Come<div class="seg" id="mode"><button data-v="cedo" class="on">Lo cedo (chi lo prende lavora al posto mio)</button><button data-v="scambio">Lo scambio con un suo turno</button></div></div>
      <label class="field">Preferenze per lo scambio <span class="hint">facoltativo, es. "una mattina della settimana dopo"</span><input class="inp" id="w"></label>
      <label class="field">Messaggio ai colleghi<input class="inp" id="t" placeholder="facoltativo"></label></div>`
  });
  let mode = 'cedo';
  m.body.querySelectorAll('#mode button').forEach(b => b.onclick = () => { mode = b.dataset.v; m.body.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b)); });
  m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('storefront')}Pubblica in borsa</button>`;
  m.foot.querySelector('[data-c]').onclick = () => m.close();
  m.foot.querySelector('[data-o]').onclick = async () => {
    const d = m.body.querySelector('#d').value;
    const o = await store.saveRequest({ type: 'offerta', op: me, from: d, to: d, code: store.cell(me, d).s, mode, wish: m.body.querySelector('#w').value.trim(), text: m.body.querySelector('#t').value.trim(), status: 'aperta', proposals: [] });
    // avvisa i colleghi per cui va bene
    for (const x of store.ops()) if (x.id !== me && fitFor(x.id, d, o.code).ok === true) await store.notify(x.id, 'Turno in borsa', `${store.opName(me)} ${mode === 'cedo' ? 'cede' : 'scambia'} ${o.code} di ${fmtDate(d, { wd: true })}: quel giorno sei libero`, { kind: 'borsa' });
    m.close(); toast('Turno messo in borsa');
  };
}

async function act(a, o, me, extra) {
  if (!o) return;
  if (a === 'ritira') { if (await confirmBox('Ritirare l’offerta?', '')) { o.status = 'ritirata'; await store.saveRequest(o); } return; }
  if (a === 'prendo') {
    if (!await confirmBox('Prendi il turno?', `Lavorerai tu il ${esc(o.code)} di ${esc(fmtDate(o.from, { wd: true }))} al posto di ${esc(store.opName(o.op))}. Serve l’approvazione del coordinatore.`, { ok: 'Lo prendo' })) return;
    o.proposals = (o.proposals || []).concat({ op: me, date: null, ts: Date.now() });
    return deal(o, o.proposals.length - 1);
  }
  if (a === 'propongo') {
    const mine = rangeDays(addDays(today(), 1), addDays(today(), 75)).filter(d => { const c = store.cell(me, d); return c && c.s && workedMin(c) > 0 && !isSmontoCode(c.s) && fitFor(o.op, d, c.s).ok; });
    if (!mine.length) return toast('Non hai turni che il collega possa fare al posto tuo', 'info');
    const m = modal({ title: 'Proponi uno scambio', icon: 'swap_horiz', foot: '', body: `<div class="col"><div class="small muted">Tu fai il ${esc(o.code)} del ${esc(fmtDate(o.from))}; ${esc(store.opName(o.op))} fa un tuo turno. Ti mostro solo quelli in cui è libero.</div><label class="field">Il turno che gli dai<select class="inp" id="pd">${mine.map(d => `<option value="${d}">${esc(fmtDate(d, { wd: true }))} · ${esc(store.cell(me, d).s)}</option>`).join('')}</select></label></div>` });
    m.foot.innerHTML = `<button class="btn pri">${ic('send')}Proponi</button>`;
    m.foot.firstChild.onclick = async () => { o.proposals = (o.proposals || []).concat({ op: me, date: m.body.querySelector('#pd').value, ts: Date.now() }); await store.saveRequest(o); await store.notify(o.op, 'Proposta di scambio', `${store.opName(me)} ti propone il suo turno del ${fmtDate(m.body.querySelector('#pd').value)} in cambio del tuo ${o.code}`, { kind: 'borsa' }); m.close(); toast('Proposta inviata'); };
    return;
  }
  if (a === 'accetto') return deal(o, +extra);
}
// Accordo trovato: nasce la richiesta di cambio, già accettata da entrambi, per il coordinatore
async function deal(o, i) {
  const p = o.proposals[i];
  o.status = 'accordo'; o.dealWith = p.op; await store.saveRequest(o);
  await store.saveRequest({ type: 'cambio', op: o.op, peer: p.op, from: o.from, to: o.from, peerDate: p.date || o.from, status: 'attesa', title: 'Cambio turno (borsa scambi)', text: o.text || '', fromMarket: o.id, peerOk: Date.now() });
  await store.notify('@manager', 'Accordo in borsa scambi', `${store.opName(o.op)} e ${store.opName(p.op)}: ${o.code} del ${fmtDate(o.from)}${p.date ? ' ↔ ' + fmtDate(p.date) : ''}`, { kind: 'richiesta' });
  await store.notify(o.op === store.me ? p.op : o.op, 'Accordo trovato', `Il cambio del ${fmtDate(o.from)} è passato al coordinatore per l’approvazione`, { kind: 'borsa' });
  toast('Accordo trovato: ora decide il coordinatore');
}
