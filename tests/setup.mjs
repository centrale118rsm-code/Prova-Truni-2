// Prepara l'ambiente per i test in Node: niente browser, dati caricati dai file di partenza.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = new Map();
globalThis.window = globalThis.window || { addEventListener() { } };
globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i], get length() { return mem.size; } };
globalThis.location = globalThis.location || { search: '', href: 'http://localhost/', pathname: '/', hash: '' };
globalThis.document = globalThis.document || { documentElement: { dataset: {} } };

const imp = f => import(pathToFileURL(path.join(ROOT, 'js', f)).href);
export const { store } = await imp('store.js');
export const calc = await imp('calc.js');
export const util = await imp('util.js');
export const gen = await imp('gen.js');
const { PROFILES } = await imp('profile.js');

// Carica il profilo e i turni di partenza direttamente in memoria (come al primo avvio)
export function loadProfile(key) {
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `seed-${key}-2026.json`), 'utf8'));
  store.profile = PROFILES[key];
  store.months = {}; store.agenda = {}; store.requests = {}; store.pending = {}; store.editing = false;
  store.config = store.normalizeConfig({
    year: seed.year, festivi: seed.festivi,
    operators: seed.operators.map((o, i) => ({ ...o, order: i, params: { ...store.profile.defaults, ...(seed.params[o.id] || {}) }, initBalance: (seed.initBalance || {})[o.id] || 0, prevWeek: (seed.prevWeek || {})[o.id] || 0 }))
  });
  for (const [op, cells] of Object.entries(seed.cells)) for (const [d, c] of Object.entries(cells)) { const m = d.slice(0, 7); (store.months[m] ||= { cells: {}, rep: {} }).cells[op + '|' + d] = c; }
  for (const [d, r] of Object.entries(seed.rep || {})) { const m = d.slice(0, 7); (store.months[m] ||= { cells: {}, rep: {} }).rep[d] = r; }
  return seed;
}
