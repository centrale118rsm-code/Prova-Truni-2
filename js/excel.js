// ═══════════════════════════════════════════════════════════════════════════
// EXCEL — importa il file dei turni (stessa struttura del foglio TURNI di
// "Autisti 2026.xlsm": per ogni operatore 3 colonne [segno | assenza | turno],
// righe dal 1° gennaio, reperibilità nelle 4 colonne dopo "REPERIBILITA'")
// ed esporta un .xlsx con turni, ore, ferie e reperibilità.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from './store.js';
import { loadScript, addDays, fmtDate, WD, dow, hm, rangeDays, download, monthDays } from './util.js';
import { repDefault, repOf, repBands, weeks, yearStats, workedMin, creditMin, absInfo, shifts } from './calc.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

// ── Bordi delle caselle ──
// La versione gratuita di SheetJS non legge gli stili: si apre il file (è uno zip) e si leggono
// direttamente styles.xml e il foglio. Bordo spesso rosso = esigenza di servizio, blu = richiesta personale.
const colNum = l => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export async function readBorders(buf, sheetName) {
  if (!window.JSZip) await loadScript(JSZIP_URL);
  const zip = await window.JSZip.loadAsync(buf);
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sh = [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find(m => m[1] === sheetName);
  if (!sh) return null;
  const rel = [...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].find(m => m[1] === sh[2]);
  if (!rel) return null;
  const sheetPath = 'xl/' + rel[2].replace(/^\/?xl\//, '');
  const styles = await zip.file('xl/styles.xml').async('string');
  const bordersXml = (styles.match(/<borders[^>]*>([\s\S]*?)<\/borders>/) || [])[1] || '';
  const borderMark = [...bordersXml.matchAll(/<border\b[^>]*?(?:\/>|>([\s\S]*?)<\/border>)/g)].map(m => {
    const body = m[1] || ''; const cnt = {};
    for (const side of body.matchAll(/<(left|right|top|bottom)\s+style="(medium|thick|double)"[^>]*>\s*<color\s+rgb="([0-9A-Fa-f]{8})"/g)) { const c = side[3].slice(2).toUpperCase(); cnt[c] = (cnt[c] || 0) + 1; }
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    return top[0] === 'FF0000' ? 'serv' : (top[0] === '0000FF' || top[0] === '3333FF') ? 'pers' : null;
  });
  const xfsXml = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
  const xfMark = [...xfsXml.matchAll(/<xf\b([^>]*)/g)].map(m => { const b = (m[1].match(/borderId="(\d+)"/) || [])[1]; return b != null ? borderMark[+b] : null; });
  const xml = await zip.file(sheetPath).async('string');
  const marks = new Map();
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)" s="(\d+)"/g)) { const mk = xfMark[+m[3]]; if (mk) marks.set(`${+m[2] - 1}:${colNum(m[1])}`, mk); }
  return marks;
}
async function lib() { if (!window.XLSX) await loadScript(XLSX_URL); return window.XLSX; }

const norm = s => String(s ?? '').trim();
const findOp = name => {
  const n = norm(name).toUpperCase().replace(/\.$/, ''); if (n.length < 3) return null;
  return store.ops(true).find(o => o.surname.toUpperCase().startsWith(n.slice(0, Math.min(7, n.length))) || n.startsWith(o.surname.toUpperCase().slice(0, 7)));
};

// Legge il file e restituisce le caselle trovate
export async function parseWorkbook(file) {
  const X = await lib();
  const buf = await file.arrayBuffer();
  const wb = X.read(buf, { type: 'array', cellFormula: false, cellStyles: false });
  const sh = wb.Sheets['TURNI'] || wb.Sheets[wb.SheetNames[0]];
  if (!sh) throw new Error('Foglio TURNI non trovato');
  const rows = X.utils.sheet_to_json(sh, { header: 1, raw: true, defval: '' });
  // formato "orizzontale" (file infermieri / foglio CARTELLINO): una riga per persona, colonne = giorni
  const horiz = rows.slice(2, 80).filter(r => findOp(r[0])).length >= 2 && (rows[1] || []).slice(1, 6).every((v, i) => v === i + 1);
  if (horiz) return parseHorizontal(rows, wb.SheetNames.includes('TURNI') ? 'TURNI' : wb.SheetNames[0]);
  // anno: cella A4 (o il primo numero 20xx in alto)
  let year = store.config.year;
  for (let r = 0; r < 8; r++) for (const v of rows[r] || []) if (typeof v === 'number' && v > 2000 && v < 2100) { year = v; r = 99; break; }
  // riga dei cognomi: quella con più operatori riconosciuti
  let nameRow = -1, best = 0;
  for (let r = 0; r < 12; r++) { const hits = (rows[r] || []).filter(v => findOp(v)).length; if (hits > best) { best = hits; nameRow = r; } }
  if (nameRow < 0 || best < 2) throw new Error('Non trovo la riga con i cognomi degli operatori');
  const cols = []; (rows[nameRow] || []).forEach((v, c) => { const o = findOp(v); if (o && !cols.some(x => x.op === o.id)) cols.push({ op: o.id, c, name: norm(v) }); });
  // prima riga dei giorni: quella sotto i cognomi con il numero 1
  let start = nameRow + 1; for (let r = nameRow + 1; r < nameRow + 6; r++) if ((rows[r] || []).some(v => v === 1)) { start = r; break; }
  // colonne della reperibilità
  let repCol = -1; for (let r = 0; r <= nameRow; r++) (rows[r] || []).forEach((v, c) => { if (/REPERIBILIT/i.test(norm(v)) && repCol < 0 && c > cols[cols.length - 1].c) repCol = c + 1; });
  const cells = {}, rep = {}; let n = 0;
  for (let i = 0; i < 400; i++) {
    const row = rows[start + i]; if (!row) break;
    const d = addDays(`${year}-01-01`, i);
    for (const { op, c } of cols) {
      const a = row[c + 1], s = row[c + 2]; const cell = {};
      const sv = norm(s); if (sv) cell.s = sv === 'R' ? 'R' : sv;
      if (typeof a === 'number' && a > 0) cell.ph = a; else if (norm(a)) cell.a = norm(a);
      cells[op + '|' + d] = Object.keys(cell).length ? cell : null; n++;
    }
    if (repCol > 0) { const r4 = [0, 1, 2, 3].map(k => { const o = findOp(row[repCol + k]); return o ? o.id : ''; }); if (r4.some(Boolean)) rep[d] = r4; }
  }
  // bordi rosso/blu sulle caselle del turno (riga r del file = start + i, colonna = cognome + 2)
  let hasMarks = false;
  try {
    const marks = await readBorders(buf, wb.SheetNames.includes('TURNI') ? 'TURNI' : wb.SheetNames[0]);
    if (marks) { hasMarks = true; for (let i = 0; i < 400; i++) { const d = addDays(`${year}-01-01`, i); for (const { op, c } of cols) { const mk = marks.get(`${start + i}:${c + 2}`); const k = op + '|' + d; if (mk && cells[k]) cells[k].mk = mk; } } }
  } catch (e) { console.warn('Bordi non letti', e); }
  return { year, ops: cols, cells, rep, count: n, hasMarks, sheet: wb.SheetNames.includes('TURNI') ? 'TURNI' : wb.SheetNames[0] };
}

const ABS_MAP = { F: 'f', V: 'v', PN: 'pn', NL: 'nl', NG: 'ng', K: 'k', P: 'p', M: 'm', Z: 'Z', z: 'Z', C: 'c', E: 'e', L: 'l', S: 's', A: 'a', X: 'x' };
// codici di una lettera del file esportato (infermieri.xlsx) → codici del file principale
const SHORT = { M: 'MAT', P: 'POM', N: 'NOTT', S: 'SM', m: 'matt', p: 'pome', r: 'ripo', 'm/R': 'matt/R', 'p/R': 'pome/R', 'S/R': 'SM/R' };
function parseHorizontal(rows, sheet) {
  let year = store.config.year; const y0 = rows[0] && rows[0][0]; if (typeof y0 === 'number' && y0 > 2000) year = y0;
  const nDays = (rows[1] || []).length - 1;
  const cells = {}, rep = {}, ops = []; let n = 0;
  for (let r = 2; r < rows.length; r++) {
    const o = findOp(rows[r][0]); if (!o || ops.some(x => x.op === o.id)) continue;
    // solo le righe "persona" (sotto c'è la riga delle assenze)
    if (!(rows[r] || []).slice(1, 40).some(v => /^(M|P|N|S|R|-|m|p|r|M\/R|MAT|POM|NOTT|SM)$/.test(norm(v)))) continue;
    ops.push({ op: o.id, c: r, name: norm(rows[r][0]) });
    for (let i = 0; i < nDays; i++) {
      const d = addDays(`${year}-01-01`, i); const sv = norm(rows[r][i + 1]); const a = (rows[r + 1] || [])[i + 1];
      const cell = {};
      if (/^(gravidanza|maternit)/i.test(sv)) cell.a = 'gr';
      else if (sv && sv !== '-' && sv !== '0') cell.s = shifts().has(sv) ? sv : (SHORT[sv] || sv);
      if (typeof a === 'number' && a > 0) cell.ph = a;
      else if (norm(a) && norm(a) !== '0') { const av = norm(a); const mr = av.match(/^r(\d)$/); if (mr) { cell.a = 'r'; cell.ph = +mr[1]; } else cell.a = ABS_MAP[av] || av; }
      cells[o.id + '|' + d] = Object.keys(cell).length ? cell : null; n++;
    }
  }
  // riga con un cognome per giorno = chi copre le fasce 00-13 (il reperibile del giorno prima)
  const holder = d => { for (const { op } of ops) { const c = cells[op + '|' + d]; if (c && c.s && c.s.includes('/R')) return op; } return ''; };
  for (let r = 2; r < rows.length; r++) {
    const vals = (rows[r] || []).slice(1, nDays + 1); if (vals.filter(v => findOp(v)).length < nDays / 3) continue;
    vals.forEach((v, i) => { const o = findOp(v); if (!o) return; const d = addDays(`${year}-01-01`, i); const prev = holder(addDays(d, -1)); if (o.id !== prev) { const t = holder(d); rep[d] = [o.id, o.id, t, t]; } });
    break;
  }
  return { year, ops, cells, rep, count: n, sheet, layout: 'orizzontale' };
}

// Differenze tra il file e i turni attuali (mantiene note, bordi e crediti se il codice non cambia)
export function diffImport(parsed, { fromDate = null, withRep = true } = {}) {
  const ch = [];
  for (const [k, v] of Object.entries(parsed.cells)) {
    const [op, d] = k.split('|'); if (fromDate && d < fromDate) continue;
    const cur = store.cell(op, d) || null;
    const same = (cur && cur.s || '') === (v && v.s || '') && (cur && cur.a || '') === (v && v.a || '') && (cur && cur.ph || 0) === (v && v.ph || 0) && (!parsed.hasMarks || (cur && cur.mk || '') === (v && v.mk || ''));
    if (same) continue;
    const nv = v ? Object.assign({}, v) : null;
    if (nv && cur) { if (cur.n) nv.n = cur.n; if (!parsed.hasMarks && cur.mk && (cur.s === nv.s)) nv.mk = cur.mk; if (cur.cr != null && cur.a === nv.a) nv.cr = cur.cr; }
    ch.push({ key: k, val: nv, before: cur });
  }
  if (withRep) {
    // la reperibilità scritta nel file diventa una cessione solo dove differisce dall'automatica
    const tmp = new Map(); for (const c of ch) tmp.set(c.key, c.val);
    for (const [d, r] of Object.entries(parsed.rep)) {
      if (fromDate && d < fromDate) continue;
      const def = repDefault(d); const cur = store.repOverride(d);
      const want = JSON.stringify(r) === JSON.stringify(def) ? null : r;
      if (JSON.stringify(want) !== JSON.stringify(cur || null)) ch.push({ key: 'rep|' + d, val: want, before: cur });
    }
  }
  return ch;
}

// Esporta un .xlsx: TURNI (come il foglio), ORE, FERIE, REPERIBILITÀ
export async function exportWorkbook() {
  const X = await lib(); const y = store.config.year; const ops = store.ops(); const bands = repBands();
  const wb = X.utils.book_new();
  const head1 = ['', ''], head2 = ['Data', 'Giorno'];
  ops.forEach(o => { head1.push(o.surname, ''); head2.push('Ass.', 'Turno'); });
  head1.push(...bands.map(b => 'REPERIBILITÀ')); head2.push(...bands.map(b => b.label));
  const aoa = [[store.config.app.title + ' ' + y], head1, head2];
  for (const d of rangeDays(`${y}-01-01`, `${y + 1}-01-31`)) {
    const row = [d.split('-').reverse().join('/'), WD[dow(d)] + (store.isFestivo(d) ? ' (F)' : '')];
    for (const o of ops) { const c = store.cell(o.id, d); row.push(c ? (c.a || (c.ph ? c.ph : '')) : '', c && c.s ? c.s : ''); }
    repOf(d).forEach(x => row.push(x ? store.op(x).surname : ''));
    aoa.push(row);
  }
  const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 11 }, { wch: 8 }, ...ops.flatMap(() => [{ wch: 4 }, { wch: 8 }]), ...bands.map(() => ({ wch: 12 }))];
  X.utils.book_append_sheet(wb, ws, 'TURNI');
  const ore = [['Operatore', 'Settimana dal', 'Lavorate', 'Accreditate', 'Totale', 'Differenza', 'Saldo']];
  for (const o of ops) for (const w of weeks(o.id, y)) ore.push([o.surname, w.monday, hm(w.worked), hm(w.credit), hm(w.total), hm(w.delta), hm(w.balance)]);
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(ore), 'CONTEGGI ORARI');
  const fer = [['Operatore', 'Ferie spettanti', 'Usate', 'Residuo usato gen.', 'Rimaste', 'Residuo AP', 'Rimasto AP', 'Permessi gg rimasti', 'PN', 'Ore permesso rimaste', 'Festivi lavorati', 'Ore festive', 'FNG', 'FNL', 'Festivi R', 'Reperibilità', 'Ore rep.', 'Turno', 'Diurno', 'Casa']];
  for (const o of ops) { const s = yearStats(o.id, y); fer.push([o.surname, s.ferieSpettanti, s.ferieUsate, s.vNext, s.ferieRestanti, s.ferieAP, s.ferieAPRestanti, s.permGgRestanti, s.pn, s.permOreRestanti, s.festLav, hm(s.oreFestLav), s.fng, s.fnl, s.festR, s.rep, Math.round(s.repMin / 60), s.turno, s.diurno, s.casa]); }
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(fer), 'RIEPILOGO');
  const rep = [['Data', ...bands.map(b => b.label), ...ops.map(o => 'Ore ' + o.surname)]];
  for (const d of rangeDays(`${y}-01-01`, `${y}-12-31`)) { const r = repOf(d); rep.push([d, ...r.map(x => x ? store.op(x).surname : ''), ...ops.map(o => r.reduce((a, x, i) => a + (x === o.id ? bands[i].min / 60 : 0), 0))]); }
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rep), 'REPERIBILITA');
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  download(`turni-${store.profile.key}-${y}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
