// ═══════════════════════════════════════════════════════════════════════════
// RICHIESTE — l'operatore chiede ferie, permessi, recuperi, cambi turno con un
// collega, cessioni di reperibilità; il collega accetta, il coordinatore approva
// e la richiesta si scrive da sola sul calendario (con il bordo blu "richiesta personale").
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../store.js';
import { esc, today, addDays, fmtDate, fmtShort, rangeDays, relTime, stamp, hm, dow } from '../util.js';
import { ic, modal, toast, confirmBox, promptBox, chipFor, opChip, avatar, cap1 } from '../ui.js';
import { yearStats, suggestedCredit, isRest, repOf, repDefault, repBands, hasRep, coverage, describe, absInfo } from '../calc.js';
import { statusPill } from './me.js';

export const TYPES = {
  ferie:    { label: 'Ferie (congedo ordinario)', icon: 'beach_access', color: '#ca8a04', code: 'f', range: true },
  ferieAP:  { label: 'Ferie residue anno precedente', icon: 'history', color: '#ea580c', code: 'v', range: true },
  permesso: { label: 'Permesso straordinario (giornata)', icon: 'event_available', color: '#16a34a', code: 'p', range: true },
  ore:      { label: 'Permesso a ore', icon: 'more_time', color: '#0284c7', hours: true },
  recupero: { label: 'Recupero ore', icon: 'restore', color: '#db2777', code: 'r', range: true },
  cambio:   { label: 'Cambio turno con un collega', icon: 'swap_horiz', color: '#4f46e5', peer: true },
  cessione: { label: 'Cessione reperibilità', icon: 'phone_forwarded', color: '#be185d', peer: true },
  malattia: { label: 'Comunicazione malattia', icon: 'sick', color: '#dc2626', code: 'm', range: true },
  altro:    { label: 'Altra richiesta', icon: 'chat', color: '#475569', range: true }
};

// ── Vista operatore ──
export function requests(el, params, ctx) {
  const me = store.me || (store.isManager() ? params.op : null);
  if (!me) { el.innerHTML = `<div class="page"><div class="empty">${ic('person_search')}Scegli prima chi sei (menu in basso a sinistra).</div></div>`; return; }
  let tab = 'mie';
  const draw = () => {
    const all = Object.values(store.requests).filter(r => r.type !== 'offerta').sort((a, b) => b.ts - a.ts);
    const mine = all.filter(r => r.op === me);
    const forMe = all.filter(r => r.peer === me && r.op !== me);
    const toAnswer = forMe.filter(r => r.status === 'collega').length;
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Richieste</h2><p>Ferie, permessi, cambi turno e cessioni di reperibilità. Il coordinatore riceve la richiesta e, se la approva, il calendario si aggiorna da solo.</p></div><div class="acts"><button class="btn pri lg" data-new>${ic('add')}Nuova richiesta</button></div></div>
      <div class="tabs" style="width:max-content;max-width:100%;margin-bottom:14px"><button data-t="mie" class="${tab === 'mie' ? 'on' : ''}">${ic('person')}Le mie (${mine.length})</button><button data-t="peer" class="${tab === 'peer' ? 'on' : ''}">${ic('group')}Dai colleghi ${toAnswer ? `<span class="badge">${toAnswer}</span>` : `(${forMe.length})`}</button></div>
      <div class="card">${(tab === 'mie' ? mine : forMe).map(r => reqRow(r, me)).join('') || `<div class="empty">${ic('inbox')}${tab === 'mie' ? 'Non hai ancora fatto richieste' : 'Nessuna richiesta dai colleghi'}</div>`}</div></div>`;
    el.querySelector('[data-new]').onclick = () => newRequest(me);
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    bindRowActions(el, me, false);
  };
  draw();
  if (params.new) setTimeout(() => newRequest(me, params.d), 50);
  return store.on(w => { if (w === 'requests') draw(); });
}

function reqRow(r, viewer, mgr = false) {
  const t = TYPES[r.type] || TYPES.altro;
  const when = r.from ? `${fmtDate(r.from, { wd: true })}${r.to && r.to !== r.from ? ' → ' + fmtDate(r.to, { wd: true }) : ''}` : '';
  const detail = [];
  if (r.type === 'ore') detail.push(`${r.hours} ore`);
  if (r.type === 'cambio') detail.push(`con ${store.opName(r.peer)}${r.peerDate && r.peerDate !== r.from ? ` (suo turno del ${fmtShort(r.peerDate)})` : ''}`);
  if (r.type === 'cessione') detail.push(`a ${store.opName(r.peer)} · fasce: ${(r.bands || []).map(i => repBands()[i].label).join(', ')}`);
  const acts = [];
  if (r.op === viewer && ['attesa', 'collega'].includes(r.status)) acts.push(`<button class="btn sm" data-act="ritira" data-id="${r.id}">${ic('undo')}Ritira</button>`);
  if (r.peer === viewer && r.status === 'collega') acts.push(`<button class="btn sm" data-act="rifiuta-peer" data-id="${r.id}">${ic('close')}No</button><button class="btn sm ok" data-act="accetta-peer" data-id="${r.id}">${ic('check')}Accetto</button>`);
  if (mgr && r.status === 'attesa') acts.push(`<button class="btn sm" data-act="vedi" data-id="${r.id}">${ic('visibility')}Anteprima</button><button class="btn sm" data-act="rifiuta" data-id="${r.id}">${ic('close')}Rifiuta</button><button class="btn sm ok" data-act="approva" data-id="${r.id}">${ic('check')}Approva</button>`);
  if (mgr && r.status !== 'attesa') acts.push(`<button class="btn sm ghost" data-act="elimina" data-id="${r.id}" title="Elimina">${ic('delete')}</button>`);
  return `<div class="req"><span class="rq-ico" style="background:color-mix(in srgb, ${t.color} 14%, transparent);color:${t.color}">${ic(t.icon)}</span>
    <div class="grow"><div class="row wrap" style="gap:8px"><span class="rq-t">${esc(t.label)}</span>${statusPill(r.status)}</div>
    <div class="rq-s">${mgr || r.op !== viewer ? `${opChip(r.op, { full: true })} · ` : ''}${esc(when)}${detail.length ? ' · ' + esc(detail.join(' · ')) : ''}</div>
    ${r.text ? `<div class="small" style="margin-top:6px">“${esc(r.text)}”</div>` : ''}
    ${r.answer ? `<div class="small" style="margin-top:6px;color:var(--ink-2)">${ic('reply')} ${esc(r.answer)}</div>` : ''}
    <div class="tiny muted" style="margin-top:6px">Inviata ${relTime(r.ts)}${r.decidedBy ? ` · ${r.status} da ${esc(r.decidedBy)} il ${stamp(r.decidedAt)}` : ''}</div></div>
    <div class="row wrap" style="justify-content:flex-end">${acts.join('')}</div></div>`;
}

function bindRowActions(el, viewer, mgr) {
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
    const r = store.requests[b.dataset.id]; if (!r) return;
    const a = b.dataset.act;
    if (a === 'ritira') { if (await confirmBox('Ritirare la richiesta?', 'Il coordinatore non la vedrà più tra quelle da gestire.')) { r.status = 'ritirata'; await store.saveRequest(r); toast('Richiesta ritirata'); } }
    if (a === 'accetta-peer') { r.status = 'attesa'; r.peerOk = Date.now(); await store.saveRequest(r); await store.notify(r.op, `${store.opName(r.peer)} ha accettato`, `${TYPES[r.type].label} del ${fmtDate(r.from)}: ora la decide il coordinatore.`, { kind: 'richiesta' }); await store.notify('@manager', 'Nuova richiesta da approvare', `${store.opName(r.op)} · ${TYPES[r.type].label} · ${fmtDate(r.from)}`, { kind: 'richiesta' }); toast('Accettata: passa al coordinatore'); }
    if (a === 'rifiuta-peer') { const why = await promptBox('Rifiuti la richiesta?', { label: 'Motivo (facoltativo)', ok: 'Rifiuta' }); if (why === null) return; r.status = 'rifiutata'; r.answer = `${store.opName(r.peer)}: ${why || 'non disponibile'}`; await store.saveRequest(r); await store.notify(r.op, `${store.opName(r.peer)} non ha accettato`, r.answer, { kind: 'richiesta' }); }
    if (a === 'vedi') previewReq(r);
    if (a === 'approva') approve(r);
    if (a === 'rifiuta') { const why = await promptBox('Rifiuta la richiesta', { label: 'Motivo da comunicare all’operatore', ok: 'Rifiuta', textarea: true }); if (why === null) return; r.status = 'rifiutata'; r.answer = why; r.decidedBy = store.whoName(); r.decidedAt = Date.now(); await store.saveRequest(r); await store.notify(r.op, 'Richiesta rifiutata', `${TYPES[r.type].label} del ${fmtDate(r.from)}${why ? ': ' + why : ''}`, { kind: 'richiesta' }); toast('Richiesta rifiutata'); }
    if (a === 'elimina') { if (await confirmBox('Eliminare la richiesta?', 'Resterà solo nello storico delle modifiche del calendario.', { danger: true, ok: 'Elimina' })) await store.deleteRequest(r.id); }
  });
}

// ── Nuova richiesta ──
function newRequest(me, d0) {
  const st = yearStats(me);
  const t0 = today();
  const m = modal({
    title: 'Nuova richiesta', icon: 'assignment_add', foot: '', size: 'wide',
    body: `<div class="col">
      <div class="grid g3" id="nr-types">${Object.entries(TYPES).map(([k, t], i) => `<label class="card" style="padding:12px;cursor:pointer;display:flex;gap:10px;align-items:center"><input type="radio" name="nr-t" value="${k}" ${i === 0 ? 'checked' : ''} style="accent-color:${t.color}"><span class="ms" style="color:${t.color}">${t.icon}</span><span class="small b">${esc(t.label)}</span></label>`).join('')}</div>
      <div class="note small" id="nr-saldo">${ic('account_balance_wallet')}<div>Ferie ${store.config.year} rimaste: <b>${st.ferieRestanti}</b> · residuo anno precedente: <b>${st.ferieAPRestanti}</b> · permessi: <b>${st.permGgRestanti} gg</b> e <b>${st.permOreRestanti} h</b></div></div>
      <div class="grid g2"><label class="field">Dal giorno<input class="inp" type="date" id="nr-from" value="${d0 || addDays(t0, 7)}"></label><label class="field" id="nr-to-w">Al giorno<input class="inp" type="date" id="nr-to" value="${d0 || addDays(t0, 7)}"></label></div>
      <div class="grid g2 hidden" id="nr-peer-w"><label class="field">Collega<select class="inp" id="nr-peer">${store.ops().filter(o => o.id !== me).map(o => `<option value="${o.id}">${esc(o.name)} ${esc(cap1(o.surname))}</option>`).join('')}</select></label>
        <label class="field" id="nr-pd-w">Giorno del turno del collega <span class="hint">uguale = scambio nello stesso giorno</span><input class="inp" type="date" id="nr-pd"></label></div>
      <div class="hidden" id="nr-bands-w"><div class="field">Fasce da cedere</div><div class="row wrap" id="nr-bands">${repBands().map((b, i) => `<label class="chk"><input type="checkbox" value="${i}" checked>${b.label}</label>`).join('')}</div></div>
      <label class="field hidden" id="nr-h-w">Ore di permesso<input class="inp" type="number" min="1" max="12" id="nr-h" value="2"></label>
      <div id="nr-prev" class="small"></div>
      <label class="field">Messaggio per il coordinatore<textarea class="inp" id="nr-text" placeholder="facoltativo"></textarea></label></div>`
  });
  const $m = s => m.body.querySelector(s);
  const type = () => m.body.querySelector('input[name="nr-t"]:checked').value;
  const upd = () => {
    const t = TYPES[type()];
    $m('#nr-to-w').classList.toggle('hidden', !t.range);
    $m('#nr-peer-w').classList.toggle('hidden', !t.peer);
    $m('#nr-pd-w').classList.toggle('hidden', type() !== 'cambio');
    $m('#nr-bands-w').classList.toggle('hidden', type() !== 'cessione');
    $m('#nr-h-w').classList.toggle('hidden', !t.hours);
    if (!$m('#nr-pd').value) $m('#nr-pd').value = $m('#nr-from').value;
    // anteprima: cosa c'è adesso nei giorni scelti
    const from = $m('#nr-from').value, to = t.range ? ($m('#nr-to').value || from) : from;
    if (!from || to < from) { $m('#nr-prev').innerHTML = '<span class="neg">Controlla le date</span>'; return; }
    const days = rangeDays(from, to).slice(0, 40);
    let warn = '';
    if (type() === 'ferie') { const n = days.filter(d => !isRest(store.cell(me, d))).length; if (n > st.ferieRestanti) warn = `<div class="note warn">${ic('warning')}<div>Chiedi ${n} giorni di ferie ma te ne restano ${st.ferieRestanti}.</div></div>`; }
    if (type() === 'permesso') { const n = days.length; if (n > st.permGgRestanti) warn = `<div class="note warn">${ic('warning')}<div>Ti restano ${st.permGgRestanti} giorni di permesso.</div></div>`; }
    if (type() === 'cessione' && !hasRep(store.cell(me, from))) warn = `<div class="note warn">${ic('info')}<div>Il ${fmtDate(from)} non risulti reperibile (/R). Puoi comunque cedere le fasce che ti sono assegnate.</div></div>`;
    $m('#nr-prev').innerHTML = `${warn}<div class="row wrap" style="gap:6px;margin-top:6px">${days.map(d => `<span class="pill">${esc(fmtShort(d))} ${chipFor(store.cell(me, d), d)}</span>`).join('')}</div>`;
  };
  m.body.addEventListener('change', upd); upd();
  m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${ic('send')}Invia richiesta</button>`;
  m.foot.querySelector('[data-c]').onclick = () => m.close();
  m.foot.querySelector('[data-o]').onclick = async () => {
    const t = type(), T = TYPES[t];
    const from = $m('#nr-from').value; const to = T.range ? ($m('#nr-to').value || from) : from;
    if (!from || to < from) return toast('Controlla le date', 'warn');
    const r = { type: t, op: me, from, to, text: $m('#nr-text').value.trim(), title: T.label, status: T.peer ? 'collega' : 'attesa' };
    if (T.hours) r.hours = +$m('#nr-h').value || 1;
    if (T.peer) r.peer = $m('#nr-peer').value;
    if (t === 'cambio') r.peerDate = $m('#nr-pd').value || from;
    if (t === 'cessione') { r.bands = [...m.body.querySelectorAll('#nr-bands input:checked')].map(i => +i.value); if (!r.bands.length) return toast('Scegli almeno una fascia', 'warn'); }
    await store.saveRequest(r);
    if (T.peer) await store.notify(r.peer, `${store.opName(me)} ti chiede: ${T.label.toLowerCase()}`, `${fmtDate(from, { wd: true })} — apri Richieste per rispondere`, { kind: 'richiesta' });
    else await store.notify('@manager', 'Nuova richiesta', `${store.opName(me)} · ${T.label} · ${fmtDate(from)}${to !== from ? ' → ' + fmtDate(to) : ''}`, { kind: 'richiesta' });
    m.close(); toast(T.peer ? 'Inviata al collega: quando accetta passa al coordinatore' : 'Richiesta inviata al coordinatore');
  };
}

// ── Cosa cambia sul calendario se la richiesta viene approvata ──
export function changesFor(r) {
  const ch = [];
  const cell = (op, d) => Object.assign({}, store.cell(op, d) || {});
  if (TYPES[r.type].code && TYPES[r.type].range) {
    for (const d of rangeDays(r.from, r.to || r.from)) {
      const prev = store.cell(r.op, d); const c = cell(r.op, d);
      if (r.type !== 'malattia' && isRest(prev)) continue;          // ferie in un giorno di riposo: non serve
      c.a = TYPES[r.type].code; c.cr = suggestedCredit(r.op, d, prev); if (c.s && !isRest(c) && !c.s.startsWith('/R')) delete c.s; c.mk = 'pers';
      ch.push({ key: r.op + '|' + d, val: c });
    }
  } else if (r.type === 'ore') {
    const c = cell(r.op, r.from); c.ph = r.hours; c.mk = 'pers'; ch.push({ key: r.op + '|' + r.from, val: c });
  } else if (r.type === 'cambio') {
    const a = store.cell(r.op, r.from), b = store.cell(r.peer, r.peerDate || r.from);
    if ((r.peerDate || r.from) === r.from) {
      ch.push({ key: r.op + '|' + r.from, val: Object.assign({}, b || {}, { mk: 'pers' }) });
      ch.push({ key: r.peer + '|' + r.from, val: Object.assign({}, a || {}, { mk: 'pers' }) });
    } else {
      // scambio su due giorni: io faccio il suo turno nel suo giorno e lui il mio nel mio
      const a2 = store.cell(r.op, r.peerDate), b1 = store.cell(r.peer, r.from);
      ch.push({ key: r.op + '|' + r.from, val: Object.assign({}, b1 || {}, { mk: 'pers' }) });
      ch.push({ key: r.peer + '|' + r.from, val: Object.assign({}, a || {}, { mk: 'pers' }) });
      ch.push({ key: r.op + '|' + r.peerDate, val: Object.assign({}, b || {}, { mk: 'pers' }) });
      ch.push({ key: r.peer + '|' + r.peerDate, val: Object.assign({}, a2 || {}, { mk: 'pers' }) });
    }
  } else if (r.type === 'cessione') {
    // le fasce 1-2 del giorno dopo appartengono a chi è reperibile oggi: si sposta sul giorno giusto
    const today_ = repOf(r.from).slice(); const next = addDays(r.from, 1); const tomorrow = repOf(next).slice();
    let t1 = false, t2 = false;
    for (const i of r.bands) { if (i >= 2) { today_[i] = r.peer; t1 = true; } else { tomorrow[i] = r.peer; t2 = true; } }
    if (t1) ch.push({ key: 'rep|' + r.from, val: today_ });
    if (t2) ch.push({ key: 'rep|' + next, val: tomorrow });
  }
  return ch;
}
function previewReq(r) {
  const ch = changesFor(r);
  modal({
    title: 'Anteprima sul calendario', icon: 'visibility', size: 'wide',
    body: ch.length ? `<div class="card"><table class="tbl"><thead><tr><th>Chi</th><th>Giorno</th><th>Ora</th><th>Dopo</th></tr></thead><tbody>${ch.map(c => {
      if (c.key.startsWith('rep|')) { const d = c.key.slice(4); return `<tr><td>Reperibilità</td><td>${fmtShort(d)}</td><td class="small">${repOf(d).map(x => store.opName(x, true) || '—').join(' / ')}</td><td class="small b">${c.val.map(x => store.opName(x, true) || '—').join(' / ')}</td></tr>`; }
      const [op, d] = c.key.split('|'); return `<tr><td>${opChip(op)}</td><td>${fmtShort(d)}</td><td>${chipFor(store.cell(op, d), d)}</td><td>${chipFor(c.val, d)}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="note">${ic('info')}<div>Questa richiesta non modifica il calendario: approvandola si avvisa solo l’operatore.</div></div>`
  });
}
async function approve(r) {
  const ch = changesFor(r);
  const ok = await confirmBox('Approvare la richiesta?', `${esc(store.opName(r.op))} · ${esc(TYPES[r.type].label)} · ${fmtDate(r.from)}${r.to && r.to !== r.from ? ' → ' + fmtDate(r.to) : ''}.<br>${ch.length ? `Il calendario verrà aggiornato subito (${ch.length} caselle) e ${r.peer ? 'entrambi gli operatori riceveranno' : 'l’operatore riceverà'} la notifica.` : 'Il calendario non cambia.'}`, { ok: 'Approva' });
  if (!ok) return;
  try {
    if (ch.length) await store.applyNow(ch, `Richiesta approvata: ${TYPES[r.type].label} (${store.opName(r.op)})`);
    r.status = 'approvata'; r.decidedBy = store.whoName(); r.decidedAt = Date.now();
    await store.saveRequest(r);
    await store.notify(r.op, 'Richiesta approvata', `${TYPES[r.type].label} · ${fmtDate(r.from)}${r.to && r.to !== r.from ? ' → ' + fmtDate(r.to) : ''}`, { kind: 'richiesta' });
    if (r.peer) await store.notify(r.peer, 'Richiesta approvata', `${TYPES[r.type].label} con ${store.opName(r.op)} · ${fmtDate(r.from)}`, { kind: 'richiesta' });
    toast('Richiesta approvata e applicata');
  } catch (e) { console.error(e); toast('Errore: ' + e.message, 'err'); }
}

// ── Vista coordinatore ──
export function manage(el, params, ctx) {
  let tab = 'attesa', q = '';
  const draw = () => {
    const all = Object.values(store.requests).filter(r => r.type !== 'offerta').sort((a, b) => b.ts - a.ts);
    const list = all.filter(r => (tab === 'tutte' || r.status === tab) && (!q || store.opName(r.op).toLowerCase().includes(q) || (TYPES[r.type] || {}).label.toLowerCase().includes(q)));
    const n = s => all.filter(r => r.status === s).length;
    el.innerHTML = `<div class="page"><div class="page-h"><div><h2>Richieste da gestire</h2><p>Approva o rifiuta: le richieste approvate vengono scritte sul calendario e notificate agli interessati.</p></div><div class="acts"><input class="inp" id="rq-q" placeholder="Cerca operatore o tipo" value="${esc(q)}" style="width:220px"></div></div>
      <div class="tabs" style="width:max-content;max-width:100%;margin-bottom:14px">${[['attesa', 'In attesa', 'hourglass_top'], ['collega', 'Dal collega', 'group'], ['approvata', 'Approvate', 'check_circle'], ['rifiutata', 'Rifiutate', 'cancel'], ['tutte', 'Tutte', 'list']].map(([k, l, i]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${ic(i)}${l}${k !== 'tutte' ? ` <span class="badge" style="background:${k === 'attesa' ? 'var(--brand)' : 'var(--faint)'}">${n(k) || ''}</span>` : ''}</button>`).join('')}</div>
      <div class="card">${list.map(r => reqRow(r, null, true)).join('') || `<div class="empty">${ic('task_alt')}Nessuna richiesta ${tab === 'attesa' ? 'in attesa' : ''}</div>`}</div></div>`;
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const qi = el.querySelector('#rq-q'); qi.oninput = () => { q = qi.value.toLowerCase(); const p = qi.selectionStart; draw(); const n2 = el.querySelector('#rq-q'); n2.focus(); n2.setSelectionRange(p, p); };
    bindRowActions(el, null, true);
  };
  draw();
  return store.on(w => { if (w === 'requests') draw(); });
}
