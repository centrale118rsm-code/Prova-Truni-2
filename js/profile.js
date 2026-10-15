// ═══════════════════════════════════════════════════════════════════════════
// PROFILO — tutto ciò che distingue "autisti" da "infermieri": codici turno,
// assenze, orari, colori del foglio Excel, fasce di reperibilità, coperture.
// Le stesse regole del file "Autisti 2026.xlsm", rese configurabili.
// ═══════════════════════════════════════════════════════════════════════════

// Turni. group: T = turnista (ciclo a 5 linee), D = diurno, R = riposo, X = solo reperibilità
// min = minuti conteggiati (foglio CONTEGGI ORARI), from/to = orario (foglio "test")
// cnt = in quale contatore di copertura entra (colonne B-G del foglio TURNI)
// pos = posizione nel ciclo POM → MAT → NOTT → SM → R (serve a colorare la linea)
export const DEFAULT_SHIFTS = [
  { code: 'MAT',    label: 'Mattina turnista',           group: 'T', min: 405, from: '06:30', to: '13:15', pos: 1, cnt: ['tm'] },
  { code: 'MAT/R',  label: 'Mattina turnista + reperibilità', group: 'T', min: 405, from: '06:30', to: '13:15', pos: 1, cnt: ['tm'], rep: true },
  { code: 'POM',    label: 'Pomeriggio turnista',        group: 'T', min: 445, from: '12:45', to: '20:10', pos: 0, cnt: ['tp'] },
  { code: 'NOTT',   label: 'Notte turnista',             group: 'T', min: 255, from: '19:45', to: '24:00', pos: 2, cnt: ['tn'] },
  { code: 'SM',     label: 'Smonto notte',               group: 'T', min: 440, from: '00:00', to: '07:20', pos: 3, cnt: [] },
  { code: 'R',      label: 'Riposo turnista',            group: 'R', min: 0,   pos: 4, cnt: [] },
  { code: 'MAT+N',  label: 'Mattina + notte',            group: 'T', min: 660, from: '06:30', to: '24:00', pos: 1, cnt: ['tm', 'tn'] },
  { code: 'matt',   label: 'Mattina diurno',             group: 'D', min: 432, from: '06:30', to: '13:42', cnt: ['dm'] },
  { code: 'matt/R', label: 'Mattina diurno + reperibilità', group: 'D', min: 432, from: '06:30', to: '13:42', cnt: ['dm'], rep: true },
  { code: 'pome',   label: 'Pomeriggio diurno',          group: 'D', min: 432, from: '13:15', to: '20:27', cnt: ['dp'] },
  { code: 'matt 8', label: 'Mattina diurno dalle 8',     group: 'D', min: 432, from: '08:00', to: '15:12', cnt: ['dm'], needs: { dm: 2 } },
  { code: 'mat8/R', label: 'Mattina dalle 8 + reperibilità', group: 'D', min: 432, from: '08:00', to: '15:12', cnt: ['dm'], rep: true },
  { code: 'pom14',  label: 'Pomeriggio dalle 14',        group: 'D', min: 432, from: '14:00', to: '21:12', cnt: ['dp'], needs: { dp: 2 } },
  { code: 'matt2',  label: 'Mattina diurno (2°)',        group: 'D', min: 432, from: '06:30', to: '13:42', cnt: ['dm'] },
  { code: 'pom2',   label: 'Pomeriggio diurno (2°)',     group: 'D', min: 432, from: '13:15', to: '20:27', cnt: ['dp'] },
  { code: 'matt+N', label: 'Mattina diurno + notte',     group: 'D', min: 687, from: '06:30', to: '24:00', cnt: ['dm', 'tn'] },
  { code: 'ripo',   label: 'Riposo diurno',              group: 'R', min: 0,   cnt: ['rip'] },
  { code: '/R',     label: 'Solo reperibilità',          group: 'X', min: 0,   cnt: [], rep: true }
];

// Assenze (colonna stretta accanto al turno). bg/fg = colori del foglio TURNI.
// kind: ferie | ferieAP | perm | permOre | mal | rec | fest | altro — per i conteggi
export const DEFAULT_ABSENCES = [
  { code: 'f',  label: 'Congedo ordinario (ferie)',   bg: '#FFFF00', fg: '#7a6a00', kind: 'ferie' },
  { code: 'v',  label: 'C.O. residuo anno precedente', bg: '#FFC000', fg: '#5a3b00', kind: 'ferieAP' },
  { code: 'p',  label: 'Permesso straordinario',      bg: '#00FF00', fg: '#0b4d0b', kind: 'perm' },
  { code: 'pn', label: 'Permesso straordinario (PN)',  bg: '#C6EFCE', fg: '#1E4E79', kind: 'perm' },
  { code: 'pv', label: 'Permesso straord. anno prec.', bg: '#92D050', fg: '#1d3b08', kind: 'perm' },
  { code: 'm',  label: 'Malattia',                    bg: '#FF0000', fg: '#ffffff', kind: 'mal' },
  { code: 'r',  label: 'Recupero ore',                bg: '#FF66FF', fg: '#4a004a', kind: 'rec' },
  { code: 'c',  label: 'Studio / corso',              bg: '#0066FF', fg: '#ffffff', kind: 'altro' },
  { code: 'e',  label: 'Aspettativa',                 bg: '#8EA9DB', fg: '#13294b', kind: 'altro' },
  { code: 'l',  label: 'Permesso lutto',              bg: '#000000', fg: '#ffffff', kind: 'altro' },
  { code: 's',  label: 'Permesso sportivo',           bg: '#33CCCC', fg: '#053b3b', kind: 'altro' },
  { code: 'a',  label: 'Permesso matrimonio',         bg: '#FF99FF', fg: '#4a004a', kind: 'altro' },
  { code: 'k',  label: 'Distacco speciale',           bg: '#9966FF', fg: '#ffffff', kind: 'altro' },
  { code: 'x',  label: 'Assenza giustificata',        bg: '#FF0000', fg: '#ffffff', kind: 'altro' },
  { code: 'ng', label: 'Festività non goduta',        bg: '#00FFFF', fg: '#004d4d', kind: 'fest' },
  { code: 'nl', label: 'Festività non lavorata',      bg: '#E6FFFF', fg: '#00A3A3', kind: 'fest' }
];

// Colori delle 5 linee del ciclo turnisti (font del foglio TURNI, ricavati dal file):
// linea = (giorno dell'anno − posizione nel ciclo) mod 5
export const LINE_COLORS = ['#FF0000', '#00B050', '#0000FF', '#FF9900', '#FF00FF'];
export const CYCLE = ['POM', 'MAT', 'NOTT', 'SM', 'R'];

// Fasce di reperibilità (colonne AQ-AT): chi ha "/R" copre 13-20 e 20-24 del giorno
// e 00-07 e 07-13 del giorno dopo.
export const DEFAULT_REP_BANDS = [
  { label: '00:00 – 07:00', from: '00:00', to: '07:00', min: 420, prevDay: true },
  { label: '07:00 – 13:00', from: '07:00', to: '13:00', min: 360, prevDay: true },
  { label: '13:00 – 20:00', from: '13:00', to: '20:00', min: 420, prevDay: false },
  { label: '20:00 – 24:00', from: '20:00', to: '24:00', min: 240, prevDay: false }
];

// Contatori di copertura (colonne B-G). want = valore corretto; colors = scala del foglio
export const COVERAGE = [
  { key: 'tm',  label: 'T MATTINA',    short: 'TM', want: 1 },
  { key: 'tp',  label: 'T POMERIGGIO', short: 'TP', want: 1 },
  { key: 'tn',  label: 'T NOTTE',      short: 'TN', want: 1 },
  { key: 'dm',  label: 'D MATTINA',    short: 'DM', scale: true },
  { key: 'dp',  label: 'D POMERIGGIO', short: 'DP', scale: true },
  { key: 'rip', label: 'RIPOSO',       short: 'RI', rest: true }
];

// Disponibilità personali (legenda in fondo al foglio TURNI)
export const AVAILABILITY = [
  { code: 'o',  label: 'Libero, ok',            bg: '#00CC99', fg: '#ffffff' },
  { code: 'x',  label: 'Impossibile',           bg: '#FF0000', fg: '#ffffff' },
  { code: 'm/', label: 'Solo mattina',          bg: '#FFC000', fg: '#3b2a00' },
  { code: '/p', label: 'Solo pomeriggio',       bg: '#FF5050', fg: '#ffffff' },
  { code: 'g',  label: 'Preferenza / impegno',  bg: '#FFCCFF', fg: '#4a004a' }
];

// Turni degli infermieri (file infermieri.xlsx): stesse ore degli autisti, codici di una lettera,
// stesso ciclo P → M → N → S → R; squadre da 3 per fascia.
export const INF_SHIFTS = [
  { code: 'M',     label: 'Mattina',                    group: 'T', min: 405, from: '06:30', to: '13:15', pos: 1, cnt: ['tm'] },
  { code: 'M/R',   label: 'Mattina + reperibilità',     group: 'T', min: 405, from: '06:30', to: '13:15', pos: 1, cnt: ['tm'], rep: true },
  { code: 'P',     label: 'Pomeriggio',                 group: 'T', min: 445, from: '12:45', to: '20:10', pos: 0, cnt: ['tp'] },
  { code: 'N',     label: 'Notte',                      group: 'T', min: 255, from: '19:45', to: '24:00', pos: 2, cnt: ['tn'] },
  { code: 'S',     label: 'Smonto notte',               group: 'T', min: 440, from: '00:00', to: '07:20', pos: 3, cnt: [] },
  { code: 'R',     label: 'Riposo',                     group: 'R', min: 0,   pos: 4, cnt: [] },
  { code: 'M+N',   label: 'Mattina + notte',            group: 'T', min: 660, from: '06:30', to: '24:00', pos: 1, cnt: ['tm', 'tn'] },
  { code: 'm',     label: 'Mattina diurno',             group: 'D', min: 432, from: '06:30', to: '13:42', cnt: ['dm'] },
  { code: 'm/R',   label: 'Mattina diurno + reperibilità', group: 'D', min: 432, from: '06:30', to: '13:42', cnt: ['dm'], rep: true },
  { code: 'p',     label: 'Pomeriggio diurno',          group: 'D', min: 432, from: '13:15', to: '20:27', cnt: ['dp'] },
  { code: 'p/R',   label: 'Pomeriggio diurno + reperibilità', group: 'D', min: 432, from: '13:15', to: '20:27', cnt: ['dp'], rep: true },
  { code: 'r',     label: 'Riposo diurno',              group: 'R', min: 0,   cnt: ['rip'] },
  { code: '/R',    label: 'Solo reperibilità',          group: 'X', min: 0,   cnt: [], rep: true }
];
export const INF_ABSENCES = DEFAULT_ABSENCES.concat([
  { code: 'gr', label: 'Gravidanza / maternità',      bg: '#F9A8D4', fg: '#701a43', kind: 'altro' },
  { code: 'Z',  label: 'Sostituzione coordinatore',   bg: '#334155', fg: '#ffffff', kind: 'altro' }
]);

export const PROFILES = {
  autisti: {
    key: 'autisti', short: 'Autisti', icon: 'airport_shuttle', accent: '#c8102e',
    title: 'Turni Autisti Soccorritori',
    unit: 'U.O.C. Pronto Soccorso e Degenza Breve',
    entity: 'Istituto per la Sicurezza Sociale — Repubblica di San Marino',
    repTitle: 'Quadro reperibilità autisti soccorritori',
    roleOne: 'autista', roleMany: 'autisti',
    seed: 'data/seed-autisti-2026.json', ns: 'gt2',
    shifts: DEFAULT_SHIFTS, absences: DEFAULT_ABSENCES,
    coverageWant: { tm: 1, tp: 1, tn: 1 },
    // assenza: si accreditano le ore del turno teorico della linea (come nel file Excel)
    creditMode: 'line',
    weeklyMin: 36 * 60,
    contractDayMin: 432,
    defaults: { ferie: 31, permOre: 14, permGg: 6 }
  },
  infermieri: {
    key: 'infermieri', short: 'Infermieri', icon: 'medical_services', accent: '#0e7490',
    title: 'Turni Infermieri',
    unit: 'U.O.C. Pronto Soccorso e Degenza Breve',
    entity: 'Istituto per la Sicurezza Sociale — Repubblica di San Marino',
    repTitle: 'Quadro reperibilità infermieri',
    roleOne: 'infermiere', roleMany: 'infermieri',
    seed: 'data/seed-infermieri-2026.json', ns: 'gt2inf',
    shifts: INF_SHIFTS, absences: INF_ABSENCES,
    coverageWant: { tm: 3, tp: 3, tn: 3 },
    // assenza giustificata: ore settimanali ÷ 6 dal lunedì al sabato, la domenica 0 (programma infermieri)
    creditMode: 'six',
    weeklyMin: 36 * 60,
    contractDayMin: 360,
    defaults: { ferie: 31, permOre: 14, permGg: 6 }
  }
};

// Palette per i nuovi operatori (come le intestazioni colorate del foglio)
export const OPERATOR_PALETTE = ['#FF0000', '#00B050', '#FF66FF', '#FFC000', '#038EED', '#BFBFBF', '#A6A6A6', '#808080', '#595959', '#7030A0', '#00B0F0', '#C55A11', '#548235', '#2F5597', '#BF9000'];
