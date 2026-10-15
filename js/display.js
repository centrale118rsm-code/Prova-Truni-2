// ═══════════════════════════════════════════════════════════════════════════
// COSA VEDERE — scelte dell'amministratore su cosa mostrano le pagine agli operatori.
// Coordinatori e amministratori vedono sempre tutto.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from './store.js';

export const DISPLAY_DEFAULTS = {
  calView: 'mese',        // vista con cui si apre il calendario: mese | settimana | giorno | foglio
  showRep: true,          // reperibilità nel calendario
  absReasons: true,       // i colleghi vedono il motivo di un'assenza (altrimenti solo "Assente")
  othersCounts: true,     // gli operatori vedono ore, saldi e ferie dei colleghi
  showPhones: true,       // numeri di telefono dei colleghi
  showNotes: true,        // note scritte sulle caselle
  showHours: true,        // orari e ore nelle caselle del calendario
  showRest: false,        // chi è a riposo nel dettaglio del giorno
  // pagine visibili agli operatori
  tabs: { foglio: true, oggi: true, anno: true, cartellino: true, borsa: true, disponibilita: true, ore: true, ferie: true, reperibilita: true, festivi: true, statistiche: true, squadra: true }
};

export function display() {
  const d = (store.config && store.config.display) || {};
  return Object.assign({}, DISPLAY_DEFAULTS, d, { tabs: Object.assign({}, DISPLAY_DEFAULTS.tabs, d.tabs || {}) });
}
const boss = () => store.isManager();
// L'operatore può vedere i dati personali di quel collega?
export const canSeeCounts = opId => boss() || opId === store.me || display().othersCounts;
export const canSeePhone = opId => boss() || opId === store.me || display().showPhones;
export const canSeeAbsReason = opId => boss() || opId === store.me || display().absReasons;
export const canSeeNotes = opId => boss() || opId === store.me || display().showNotes;
// Elenco degli operatori di cui mostrare i conteggi
export const countOps = () => (boss() || display().othersCounts) ? store.ops() : store.ops().filter(o => o.id === store.me);
// Pagina nascosta agli operatori?
export function tabHidden(key) {
  if (!key || boss()) return false;
  const d = display();
  if (key === 'statistiche' && !d.othersCounts) return true;   // senza i conteggi dei colleghi l'equità non ha senso
  return d.tabs[key] === false;
}
