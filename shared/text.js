// Text helpers shared by the app and the data pipeline.
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Casting key: normalised name without spaces. Same model => same key. */
/** The wiki lists a second paint of the same casting as "Name (2nd Color)". That is the same model, so the suffix is split off. */
const ALT_RE = /\s*\(\s*\d+(?:st|nd|rd|th)\s+colou?r\b[^)]*\)\s*$/i;
export function splitAlt(name) {
  const s = String(name ?? '').trim(); const m = ALT_RE.exec(s);
  if (!m || m.index === 0) return { name: s, alt: '' };
  return { name: s.slice(0, m.index).trim(), alt: m[0].replace(/^\s*\(|\)\s*$/g, '').trim() };
}
export const baseName = (s) => splitAlt(s).name;
export const castKey = (s) => norm(baseName(s)).replace(/ /g, '');

/** Code key: uppercase letters and digits only (GRX20, U48N). */
export const codeKey = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function levenshtein(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
