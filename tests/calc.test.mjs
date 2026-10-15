// Test delle formule: i valori attesi sono quelli calcolati dal file "Autisti 2026.xlsm"
// (righe 2-5 del foglio TURNI, tabelle REPERIBILITA' e FESTIVI, foglio CONTEGGI ORARI).
// Si lanciano con:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store, calc, util, gen, loadProfile } from './setup.mjs';

const OPS = ['pazzaglia', 'barbieri', 'sarti', 'volpini', 'ghiotti', 'michelotti', 'berardi', 'bianchi', 'fabbri'];
const col = (k, f = s => s[k]) => OPS.map(op => f(calc.yearStats(op, 2026)));

test('autisti · saldo settimanale sulle 36 ore (CONTEGGI ORARI)', () => {
  loadProfile('autisti');
  const v = calc.weeks('volpini', 2026).slice(0, 3).map(w => util.hm(w.balance));
  assert.deepEqual(v, ['1:25', '-4:35', '-4:01']);
  const p = calc.weeks('pazzaglia', 2026).slice(0, 2).map(w => util.hm(w.balance));
  assert.deepEqual(p, ['0:44', '-1:39']);
});

test('autisti · ferie, pn, ore e giorni di permesso rimasti (righe 2-5 del foglio TURNI)', () => {
  loadProfile('autisti');
  assert.deepEqual(col('ferieRestanti'), [1, 0, 6, 5, 12, 0, 10, 8, 0]);
  assert.deepEqual(col('pn'), [2, 1, 2, 0, 1, 2, 2, 0, 2]);
  assert.deepEqual(col('permOreRestanti'), [10, 2, 0, 7, 14, 0, 2, 5, 0]);
  assert.deepEqual(col('permGgRestanti'), [0, 0, 0, 2, 2, 0, 0, 1, 0]);
});

test('autisti · ore di reperibilità nell’anno (Michelotti corretto: 961, il file ne conta 937)', () => {
  loadProfile('autisti');
  assert.deepEqual(col('repMin', s => s.repMin / 60), [976, 1000, 977, 986, 876, 961, 965, 1016, 1003]);
});

test('autisti · tabella FESTIVI', () => {
  loadProfile('autisti');
  assert.deepEqual(col('festLav'), [12, 10, 11, 10, 10, 9, 13, 10, 9]);
  assert.deepEqual(col('fng'), [3, 0, 1, 2, 0, 1, 0, 3, 2]);
  assert.deepEqual(col('fnl'), [0, 3, 2, 2, 2, 1, 0, 1, 2]);
  assert.deepEqual(col('festR'), [1, 3, 2, 2, 2, 5, 2, 1, 2]);
});

test('autisti · coperture e reperibilità a fasce', () => {
  loadProfile('autisti');
  const c = calc.coverage('2026-01-01');
  assert.equal(c.tm, 1); assert.equal(c.tp, 1); assert.equal(c.tn, 1);
  assert.deepEqual(calc.repOf('2026-01-01'), ['ghiotti', 'ghiotti', 'sarti', 'sarti']);
  assert.deepEqual(calc.repOf('2026-01-21'), ['ghiotti', 'sarti', 'michelotti', 'michelotti']);   // cessione
  // turno + giorno = colore della linea del ciclo (rosso, verde, blu, arancio, fucsia)
  assert.equal(calc.lineOf('POM', '2026-01-01'), 0);   // linea rossa, come Pazzaglia nel file
  assert.equal(calc.codeForLine(0, '2026-01-02'), 'MAT');
});

test('autisti · ogni giorno ha una sola mattina, un pomeriggio e una notte (quasi sempre)', () => {
  loadProfile('autisti');
  const errs = calc.validate('2026-01-01', '2026-12-31').filter(i => i.cat === 'Copertura');
  assert.ok(errs.length < 40, `troppi buchi di copertura: ${errs.length}`);
});

test('infermieri · codici riconosciuti, squadre da 3, ore accreditate a 6 ore', () => {
  loadProfile('infermieri');
  let unknown = 0, full = 0;
  for (const m of Object.values(store.months)) for (const c of Object.values(m.cells)) if (c.s && calc.shiftInfo(c.s).unknown) unknown++;
  assert.equal(unknown, 0);
  for (const d of util.rangeDays('2026-01-01', '2026-12-31')) { const c = calc.coverage(d); if (c.tm >= 2 && c.tp >= 2 && c.tn >= 2) full++; }
  assert.ok(full > 340, `giorni con le squadre complete: ${full}`);
  assert.equal(calc.creditMin({ a: 'f' }, '2026-03-10'), 360);   // martedì: 36 h ÷ 6
  assert.equal(calc.creditMin({ a: 'f' }, '2026-03-08'), 0);     // domenica
  assert.equal(calc.cycle().join(' '), 'POM MAT NOTT SM R');
});

test('bozza automatica · copre tutte le fasce di un mese vuoto', () => {
  loadProfile('autisti');
  // si svuota novembre e si chiede una bozza da zero
  for (const k of Object.keys(store.months['2026-11'].cells)) delete store.months['2026-11'].cells[k];
  const roles = {}; ['pazzaglia', 'barbieri', 'sarti', 'volpini', 'ghiotti'].forEach(o => roles[o] = 'AUTO'); ['michelotti', 'berardi', 'bianchi', 'fabbri'].forEach(o => roles[o] = 'DA');
  const r = gen.build(2026, 10, roles, { optimize: true, onlyEmpty: false, keepAbs: true, rep: 'eq', weekendDiurni: 'ripo', respectAvail: false, pendingRequests: false });
  assert.equal(r.summary.gaps, 0);
  assert.equal(new Set(Object.values(r.lines)).size, 5);   // 5 turnisti su 5 linee diverse
});

test('utilità · ore, Pasqua, festività di San Marino', () => {
  assert.equal(util.hm(445), '7:25'); assert.equal(util.hm(-99), '-1:39'); assert.equal(util.parseHM('-2:30'), -150);
  assert.equal(util.easter(2026), '2026-04-05'); assert.equal(util.easter(2027), '2027-03-28');
  const h = util.holidaysSM(2026).map(x => x.date);
  for (const d of ['2026-01-01', '2026-02-05', '2026-03-25', '2026-04-01', '2026-06-04', '2026-07-28', '2026-09-03', '2026-12-26']) assert.ok(h.includes(d), d);
});

test('sicurezza · password con PBKDF2 e vecchie impronte ancora valide', async () => {
  const h = await util.hashPass('Prova123!');
  assert.ok(h.startsWith('pbkdf2$150000$'));
  assert.equal(await util.verifyPass('Prova123!', h), true);
  assert.equal(await util.verifyPass('sbagliata', h), false);
  const legacy = await util.sha256('gt2:vecchia1');
  assert.equal(await util.verifyPass('vecchia1', legacy, 'gt2:'), true);
});
