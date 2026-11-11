// "What's new": shown once after an update, and any time from Settings. Newest entry first.
import { esc } from '../shared/text.js';
import { t, getLang } from './i18n.js';
import { openSheet } from './ui.js';
import { acts } from './registry.js';

export const NEWS = [
  { id: '2026-11-11-e', date: '11.11.2026',
    ro: ['Scanezi cardul și, dacă mașina nu e în bază, formularul manual se completează singur cu codul și un nume probabil (le poți corecta).', 'Ecranul „Ce e nou" apare o dată după fiecare actualizare și poate fi deschis din Setări.'],
    en: ['Scan a card and, if the car is not in the database, the manual form is filled with the code and a likely name (you can correct them).', '"What\'s new" appears once after each update and can be opened from Settings.'] },
  { id: '2026-11-11-d', date: '11.11.2026',
    ro: ['„(2nd Color)" și „(3rd Color)" sunt acum variante ale aceluiași model: de la 4.536 la 2.470 de modele.', 'Mașinile și dorințele tale salvate au fost mutate automat pe modelul de bază.'],
    en: ['"(2nd Color)" and "(3rd Color)" rows are now versions of the same model: 4,536 models became 2,470.', 'Your saved cars and wishlist were moved to the base model automatically.'] },
  { id: '2026-11-11-c', date: '11.11.2026',
    ro: ['Număr de versiune real în Setări, plus „Verifică actualizări" și „Reîncărcare curată" (îți păstrează mașinile).', 'Aplicația caută singură o versiune nouă de fiecare dată când o redeschizi.'],
    en: ['A real version number in Settings, plus "Check for updates" and "Clean reload" (keeps your cars).', 'The app looks for a new version by itself every time you come back to it.'] },
  { id: '2026-11-11-b', date: '11.11.2026',
    ro: ['Adăugare mai clară: pași, culori cu nume, detalii opționale pliate, buton de salvare mereu vizibil.', 'La comparare, versiunile sunt rânduri cu an, serie, culoare și cod, nu cercuri goale.', 'Mașinile care nu sunt în bază se adaugă manual cu codul tău (ex. HNT17), iar aplicația le regăsește după cod. Lista lor e în Statistici, cu export CSV.'],
    en: ['Clearer adding: steps, named colours, optional details folded away, a save button that stays in view.', 'In Compare, versions are rows with year, series, colour and code instead of bare circles.', 'Cars missing from the database are added by hand with your code (e.g. HNT17) and found again by that code. The list is in Stats, with a CSV export.'] },
];

const KEY = 'cc.news';
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

export const markNewsSeen = () => set(NEWS[0].id);

function html(list) {
  const l = getLang() === 'ro' ? 'ro' : 'en';
  return `<h2>${esc(t('news.title'))}</h2>${list.map((n) => `<div class="card"><p class="mu small">${esc(n.date)}</p><ul class="news">${n[l].map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
  <button type="button" class="btn primary" data-act="sheet-close">${esc(t('news.ok'))}</button>`;
}

/** all = from Settings (last entries); otherwise only what is new since the last time it was shown. */
export function openNews(all = false) {
  const seen = get(); const i = NEWS.findIndex((n) => n.id === seen);
  const list = all ? NEWS.slice(0, 5) : NEWS.slice(0, i < 0 ? 4 : i).slice(0, 4);
  if (!list.length) return false;
  openSheet(html(list)); markNewsSeen(); return true;
}

/** Called once after start for an already-set-up app (a brand-new install records the latest entry during onboarding instead). */
export function maybeShowNews() { if (get() !== NEWS[0].id) openNews(false); }

acts['news-open'] = () => openNews(true);
