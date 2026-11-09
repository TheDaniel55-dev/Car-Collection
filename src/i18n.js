import en from './locales/en.json';
import ro from './locales/ro.json';

export const LANGS = { en, ro };
let lang = 'en';

export const setLang = (l) => { lang = LANGS[l] ? l : 'en'; document.documentElement.lang = lang; };
export const getLang = () => lang;

export function t(key, vars) {
  let s = LANGS[lang][key] ?? en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}
export const tl = (key) => t(key).split('|');

export function fmtDate(ts) {
  try { return new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ts)); }
  catch { return new Date(ts).toISOString().slice(0, 10); }
}
