// ═══ Componenti dell'interfaccia: finestre, avvisi, menu, stili delle caselle ═══
import { esc, contrast, initials, vibrate } from './util.js';
import { store } from './store.js';
import { shiftInfo, absInfo, lineColor } from './calc.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const ic = (name, cls = '') => `<span class="ms ${cls}">${name}</span>`;

// ── Avvisi in basso ──
export function toast(msg, type = 'ok', opt = {}) {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + type;
  const icon = { ok: 'check_circle', err: 'error', warn: 'warning', info: 'info' }[type] || 'info';
  t.innerHTML = `${ic(icon)}<span>${esc(msg)}</span>${opt.action ? `<button>${esc(opt.action)}</button>` : ''}`;
  if (opt.action) t.querySelector('button').onclick = () => { opt.onAction && opt.onAction(); t.remove(); };
  box.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, opt.ms || 3200);
}

// ── Finestre ──
const stack = [];
export function modal({ title, body, foot, size = '', onClose, icon }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">
    <div class="modal-h">${icon ? `<span class="ms" style="color:var(--accent)">${icon}</span>` : ''}<h3>${esc(title || '')}</h3><button class="ibtn" data-x aria-label="Chiudi">${ic('close')}</button></div>
    <div class="modal-b"></div>${foot !== undefined ? '<div class="modal-f"></div>' : ''}</div>`;
  const b = bg.querySelector('.modal-b'); if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  if (foot !== undefined) { const f = bg.querySelector('.modal-f'); if (typeof foot === 'string') f.innerHTML = foot; else if (foot) f.appendChild(foot); }
  document.body.appendChild(bg);
  requestAnimationFrame(() => bg.classList.add('open'));
  const m = { el: bg, body: b, foot: bg.querySelector('.modal-f'), close };
  function close(v) {
    if (m.closed) return; m.closed = true;
    bg.classList.remove('open'); setTimeout(() => bg.remove(), 180);
    const i = stack.indexOf(m); if (i >= 0) stack.splice(i, 1);
    onClose && onClose(v);
  }
  bg.addEventListener('mousedown', e => { if (e.target === bg) m._down = true; });
  bg.addEventListener('click', e => { if (e.target === bg && m._down) close(); m._down = false; });
  bg.querySelector('[data-x]').onclick = () => close();
  stack.push(m);
  return m;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) { stack[stack.length - 1].close(); e.stopPropagation(); } });
export const topModalOpen = () => stack.length > 0;

export function confirmBox(title, text, { ok = 'Conferma', cancel = 'Annulla', danger = false } = {}) {
  return new Promise(res => {
    const m = modal({ title, body: `<p style="margin:0;line-height:1.5;color:var(--ink-2)">${text}</p>`, foot: '', onClose: v => res(!!v) });
    m.foot.innerHTML = `<button class="btn" data-c>${esc(cancel)}</button><button class="btn ${danger ? 'red' : 'pri'}" data-o>${esc(ok)}</button>`;
    m.foot.querySelector('[data-c]').onclick = () => m.close(false);
    m.foot.querySelector('[data-o]').onclick = () => m.close(true);
  });
}
export function promptBox(title, { label = '', value = '', type = 'text', placeholder = '', ok = 'Salva', textarea = false } = {}) {
  return new Promise(res => {
    const m = modal({
      title, foot: '', onClose: v => res(v === undefined ? null : v),
      body: `<label class="field">${esc(label)}${textarea ? `<textarea class="inp" id="pb-in" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="inp" id="pb-in" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`}</label>`
    });
    m.foot.innerHTML = `<button class="btn" data-c>Annulla</button><button class="btn pri" data-o>${esc(ok)}</button>`;
    const inp = m.body.querySelector('#pb-in'); setTimeout(() => inp.focus(), 60);
    const go = () => m.close(inp.value);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !textarea) go(); });
    m.foot.querySelector('[data-c]').onclick = () => m.close(undefined);
    m.foot.querySelector('[data-o]').onclick = go;
  });
}

// ── Menu a comparsa ──
let openPop = null;
export function popover(anchor, items, { align = 'right' } = {}) {
  closePop();
  const p = document.createElement('div'); p.className = 'pop';
  p.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.html ? it.html : `<button class="pi" data-i="${i}" ${it.disabled ? 'disabled style="opacity:.45"' : ''}>${it.icon ? ic(it.icon) : ''}<span class="grow">${esc(it.label)}</span>${it.right || ''}</button>`).join('');
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  const w = p.offsetWidth, h = p.offsetHeight;
  let left = align === 'right' ? r.right - w : r.left; left = Math.max(8, Math.min(left, innerWidth - w - 8));
  let top = r.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items[+b.dataset.i]; closePop(); vibrate(); it.run && it.run(); });
  openPop = p;
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  function outside(e) { if (!p.contains(e.target)) { closePop(); } }
  p._off = () => document.removeEventListener('pointerdown', outside, true);
  return p;
}
export function closePop() { if (openPop) { openPop._off && openPop._off(); openPop.remove(); openPop = null; } }

// ── Operatori ──
export function opColor(id) { const o = store.op(id); return o ? o.color : '#94a3b8'; }
export function avatar(id, cls = '') {
  const o = store.op(id); const c = o ? o.color : '#64748b';
  return `<span class="av ${cls}" style="background:${c};color:${contrast(c)}">${esc(initials(o ? `${o.name} ${o.surname}` : '?'))}</span>`;
}
export function opChip(id, opt = {}) {
  const o = store.op(id); if (!o) return `<span class="muted">${esc(id || '—')}</span>`;
  return `<span class="op-chip"><i style="background:${o.color}"></i>${esc(opt.full ? `${o.name} ${cap1(o.surname)}` : cap1(o.surname))}</span>`;
}
const cap1 = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
export { cap1 };

// ── Stili delle caselle (formattazione condizionale del foglio TURNI) ──
export function shiftStyle(c, date, ctx = {}) {
  if (!c || !c.s) return { bg: '#F8CBAD', fg: '#000' };           // vuota: pesca
  const code = c.s.trim(); const s = shiftInfo(code);
  if (ctx.dup) return { bg: '#FF0000', fg: '#FFFF00', b: 1 };
  if (code === 'R') return { bg: '#99FFCC', fg: '#008000', b: 1 };
  if (/ripo/i.test(code)) return { bg: '#00FFCC', fg: '#000', b: 1 };
  if (ctx.needsFail) return { bg: '#FF0000', fg: '#fff', b: 1 };
  if (code === 'mat8/R') return { bg: '#CC00FF', fg: '#fff', b: 1 };
  if (code.includes('/R')) return { bg: '#FFCCFF', fg: '#9C0006', b: 1 };
  if (code.includes('14')) return { bg: '#6699FF', fg: '#fff', b: 1 };
  if (code.includes('8')) return { bg: '#33CCFF', fg: '#fff', b: 1 };
  if (s && s.style) return s.style;
  if (s && s.group === 'T') return { bg: '#fff', fg: lineColor(code, date) || '#000', b: 1 };
  return { bg: '#fff', fg: '#000', b: 1 };
}
export function absStyle(c) {
  if (c && c.a) { const a = absInfo(c.a); return { bg: a.bg, fg: a.fg, t: a.code }; }
  if (c && c.ph) return { bg: '#00B0F0', fg: '#fff', t: String(c.ph) };
  return null;
}
export function chipFor(c, date, { big = false } = {}) {
  if (!c) return `<span class="muted">—</span>`;
  const parts = [];
  if (c.s) { const st = shiftStyle(c, date); parts.push(`<b style="background:${st.bg};color:${st.fg};padding:${big ? '4px 10px' : '1px 6px'};border-radius:5px;font-family:var(--font-sheet);font-weight:700;border:1px solid rgba(0,0,0,.08)">${esc(c.s)}</b>`); }
  const a = absStyle(c); if (a) parts.push(`<b title="${esc(c.a ? absInfo(c.a).label : 'permesso orario')}" style="background:${a.bg};color:${a.fg};padding:${big ? '4px 9px' : '1px 6px'};border-radius:5px;font-family:var(--font-sheet);font-weight:700">${esc(a.t)}</b>`);
  return parts.join(' ') || `<span class="muted">—</span>`;
}

// ── Grafici SVG leggeri ──
export function barChart({ labels, series, height = 260, colors, stacked = false, valueFmt = v => v, dark = false }) {
  const W = Math.max(520, labels.length * 74), H = height, pad = { l: 36, r: 12, t: 16, b: 38 };
  const max = Math.max(1, ...labels.map((_, i) => stacked ? series.reduce((a, s) => a + (s.values[i] || 0), 0) : Math.max(...series.map(s => s.values[i] || 0))));
  const step = niceStep(max); const top = Math.ceil(max / step) * step;
  const gw = (W - pad.l - pad.r) / labels.length; const bw = stacked ? Math.min(34, gw * .55) : Math.min(18, (gw * .78) / series.length);
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`;
  labels.forEach((lb, i) => {
    const cx = pad.l + gw * i + gw / 2;
    if (stacked) {
      let acc = 0;
      series.forEach((s, k) => { const v = s.values[i] || 0; if (!v) return; const y0 = y(acc), y1 = y(acc + v); g += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1)}" fill="${colors[k]}" rx="2"><title>${esc(s.name)}: ${valueFmt(v)}</title></rect>`; acc += v; });
      g += `<text x="${cx}" y="${y(acc) - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink-2)">${valueFmt(acc)}</text>`;
    } else {
      const x0 = cx - (bw * series.length) / 2;
      series.forEach((s, k) => { const v = s.values[i] || 0; g += `<rect x="${x0 + k * bw + 1}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, y(0) - y(v))}" fill="${colors[k]}" rx="3"><title>${esc(s.name)}: ${valueFmt(v)}</title></rect><text x="${x0 + k * bw + bw / 2}" y="${y(v) - 4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${colors[k]}">${valueFmt(v)}</text>`; });
    }
    g += `<text x="${cx}" y="${H - pad.b + 16}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink-2)">${esc(lb)}</text>`;
  });
  const leg = series.map((s, k) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);margin-right:14px"><i style="width:10px;height:10px;border-radius:3px;background:${colors[k]};display:inline-block"></i>${esc(s.name)}</span>`).join('');
  return `<div style="margin-bottom:8px">${leg}</div><div style="overflow-x:auto"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 520)}px">${g}</svg></div>`;
}
function niceStep(max) { const raw = max / 5; const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

export function donut(parts, size = 120) {
  const tot = parts.reduce((a, p) => a + p.v, 0) || 1; let a0 = -Math.PI / 2; const r = size / 2 - 8, cx = size / 2, cy = size / 2;
  let s = '';
  for (const p of parts) {
    if (!p.v) continue; const a1 = a0 + (p.v / tot) * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1 - 0.0001), y1 = cy + r * Math.sin(a1 - 0.0001);
    s += `<path d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}" stroke="${p.c}" stroke-width="14" fill="none"><title>${esc(p.l)}: ${p.v}</title></path>`; a0 = a1;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r}" stroke="var(--bg-2)" stroke-width="14" fill="none"/>${s}</svg>`;
}
