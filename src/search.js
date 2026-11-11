// Search, fuzzy matching (OCR) and the "do I already own it?" verdict.
import { norm, castKey, codeKey, levenshtein } from '../shared/text.js';
import { brandOf } from '../shared/brands.js';
import { cat } from './catalogue.js';

/** Index of what the active profile owns. Rebuilt after every change. */
export const own = { list: [], byKey: new Map(), byVid: new Map(), byBase: new Map(), extra: new Map() };

export function indexOwned(list) {
  own.list = list; own.byKey = new Map(); own.byVid = new Map(); own.byBase = new Map(); own.extra = new Map();
  for (const o of list) {
    const k = o.snap.key;
    (own.byKey.get(k) || own.byKey.set(k, []).get(k)).push(o);
    if (o.vid) (own.byVid.get(o.vid) || own.byVid.set(o.vid, []).get(o.vid)).push(o);
    const b = codeKey(o.snap.base);
    if (b) own.byBase.set(b, k);
    // A card/toy code typed by hand (e.g. a Premium car missing from the catalogue) must also find the car again.
    const tc = codeKey(o.snap.toy);
    if (tc.length >= 4 && !own.byBase.has(tc)) own.byBase.set(tc, k);
    if (!cat.castings.has(k) && !own.extra.has(k)) {
      own.extra.set(k, { key: k, name: o.snap.name, n: norm(o.snap.name), brand: brandOf(o.snap.name), count: 0, y0: 9999, y1: 0, bases: new Set(b ? [b] : []), from: 'own' });
    }
  }
}

const tokensOf = (q) => norm(q).split(' ').filter(Boolean);

function* allCastings() { yield* cat.castings.values(); yield* own.extra.values(); }

/** Castings for one code (base or toy code): catalogue, learned, or owned. */
export function castingsForCode(code) {
  const ck = codeKey(code);
  const keys = new Set();
  cat.byCode.get(ck)?.forEach((k) => keys.add(k));
  if (cat.learned.has(ck)) keys.add(cat.learned.get(ck));
  if (own.byBase.has(ck)) keys.add(own.byBase.get(ck));
  return [...keys];
}

export function castingByKey(key) { return cat.castings.get(key) || own.extra.get(key) || null; }

export function searchCastings(q, limit = 8) {
  const nq = norm(q);
  if (!nq) return [];
  const ck = codeKey(q);
  const out = new Map();
  const bump = (key, score) => { const c = castingByKey(key); if (c && (out.get(key)?.score ?? -1) < score) out.set(key, { ...c, score }); };

  if (ck.length >= 3) {
    for (const k of castingsForCode(ck)) bump(k, 100);
    if (/\d/.test(ck) && ck.length >= 3) {
      for (const code of cat.codeList) if (code.startsWith(ck) && code !== ck) for (const k of cat.byCode.get(code)) bump(k, 70);
      for (const [code, k] of cat.learned) if (code.startsWith(ck) && code !== ck) bump(k, 70);
    }
  }
  const toks = tokensOf(q);
  for (const c of allCastings()) {
    let s = 0;
    if (toks.every((t) => c.n.includes(t))) {
      s = 50 + (c.n.startsWith(nq) ? 15 : 0) + (c.n.split(' ').some((w) => w === toks[0]) ? 5 : 0);
    } else if (toks.length === 1 && toks[0].length >= 4) {
      for (const w of c.n.split(' ')) { if (w.length >= 4 && levenshtein(w, toks[0], 1) <= 1) { s = 25; break; } }
    }
    if (s) bump(c.key, s + Math.min(5, c.count / 10));
  }
  return [...out.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

export const variantsOf = (key) => cat.byKey.get(key) || [];
export const ownedOf = (key) => own.byKey.get(key) || [];
export const isVariantOwned = (vid) => own.byVid.get(vid)?.reduce((a, o) => a + o.qty, 0) || 0;

/* ---------------- OCR text -> candidates ---------------- */
const D2L = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z' };
const L2D = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2' };

/** Fix common OCR confusions in 5-char Hot Wheels codes (LLLDD). */
export function fixCode(tok) {
  if (tok.length !== 5) return tok;
  const a = [...tok];
  for (let i = 0; i < 3; i++) if (D2L[a[i]]) a[i] = D2L[a[i]];
  for (let i = 3; i < 5; i++) if (L2D[a[i]]) a[i] = L2D[a[i]];
  return a.join('');
}

export function parseOcrText(text) {
  const up = String(text || '').toUpperCase();
  const raw = up.match(/[A-Z0-9]{4,6}/g) || [];
  const codes = new Set();
  for (const t of raw) {
    if (!/\d/.test(t)) continue;
    codes.add(t);
    if (t.length === 5) codes.add(fixCode(t));
  }
  const words = norm(text).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  return { codes: [...codes], words };
}

const NOISE = new Set('MATTEL HOT WHEELS PREMIUM CAR CULTURE MALAYSIA CHINA THAILAND INDONESIA VIETNAM SCALE DIECAST DIE CAST METAL REAL RIDERS HAMMER DROP TM INC EL SEGUNDO CA USA MADE IN ALL RIGHTS RESERVED AGES YEARS WARNING CHOKING HAZARD SMALL PARTS COLLECTOR COLLECTORS SERIES NEW MODEL THE AND FOR WITH OF'.split(' '));
const titleWord = (w) => (w.length <= 3 && !/[AEIOUY]/.test(w) ? w : w[0] + w.slice(1).toLowerCase());

/** Best guess of code and model name from card/base text. Heuristic: OCR on a blister is noisy, so the result is only a starting point. */
export function ocrGuess(text) {
  const { codes } = parseOcrText(text);
  const code = codes.find((c) => /^[A-Z]{3}\d{2}$/.test(c)) || codes.find((c) => /^[A-Z]{2,4}\d{1,3}[A-Z]?$/.test(c)) || '';
  const seen = new Set(); const cand = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const toks = line.toUpperCase().replace(/[^A-Z0-9'\- ]/g, ' ').split(/\s+/).filter(Boolean);
    const codeLike = (w) => w === code || /^\d{4,}$/.test(w) || (/\d/.test(w) && /[A-Z]/.test(w) && w.length >= 4);
    const words = toks.filter((w) => !codeLike(w));
    const keep = words.filter((w) => !NOISE.has(w));
    const letters = keep.join('').replace(/[^A-Z]/g, '').length;
    if (keep.length < 1 || keep.length > 6 || letters < 5 || keep.length < words.length * 0.6) continue;
    const name = keep.map(titleWord).join(' ');
    if (seen.has(name)) continue; seen.add(name); cand.push({ name, letters, words: keep.length });
  }
  cand.sort((a, b) => (b.words >= 2 && b.words <= 4) - (a.words >= 2 && a.words <= 4) || b.letters - a.letters);
  return { code, codes, names: cand.slice(0, 3).map((x) => x.name) };
}

export function matchOcr(text, limit = 6) {
  const { codes, words } = parseOcrText(text);
  const out = new Map();
  const bump = (key, score, why) => {
    const c = castingByKey(key);
    if (c && (out.get(key)?.score ?? -1) < score) out.set(key, { ...c, score, why });
  };
  for (const code of codes) {
    for (const k of castingsForCode(code)) bump(k, 100, code);
  }
  if (!out.size) {
    for (const code of codes) {
      if (code.length < 4) continue;
      for (const known of cat.codeList) {
        if (Math.abs(known.length - code.length) <= 1 && levenshtein(known, code, 1) <= 1) cat.byCode.get(known).forEach((k) => bump(k, 80, known));
      }
    }
  }
  if (words.length) {
    const wset = new Set(words);
    for (const c of allCastings()) {
      const cw = c.n.split(' ').filter((w) => w.length >= 3);
      if (!cw.length) continue;
      const hit = cw.filter((w) => wset.has(w)).length;
      if (hit >= 2 || (hit === 1 && cw.length === 1)) bump(c.key, 40 + (hit / cw.length) * 30, 'name');
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------------- Duplicate verdict ---------------- */
/**
 * @param key   casting key
 * @param opt   { cf: colour family, ser: series name, prod: production code, vid: exact variant id, mode: 'exact'|'model' }
 * @returns { level: 'red'|'amber'|'green', reason, mine: owned[], sameProd: boolean, cols: string[] }
 */
export function verdict(key, opt = {}) {
  const mine = ownedOf(key);
  if (!mine.length) return { level: 'green', reason: 'none', mine, cols: [] };
  const cols = [...new Set(mine.map((o) => o.snap.cf).filter(Boolean))];
  const prod = codeKey(opt.prod);
  const sameProd = !!prod && mine.some((o) => codeKey(o.prod) === prod);
  // A catalogue variant is the same car only in the same colour: colour is chosen by the user, never taken from the catalogue.
  if (opt.vid && own.byVid.has(opt.vid)) {
    const sameVar = own.byVid.get(opt.vid).filter((o) => (o.snap.cf || '') === (opt.cf || ''));
    if (sameVar.length) return { level: 'red', reason: 'variant', mine, cols, sameProd };
  }
  if (opt.cf) {
    const sameCol = mine.filter((o) => o.snap.cf === opt.cf);
    if (sameCol.length) {
      const sNorm = norm(opt.ser);
      const identical = sameCol.filter((o) => !sNorm || !o.snap.ser || norm(o.snap.ser) === sNorm);
      if (identical.length) return { level: 'red', reason: 'identical', mine, cols, sameProd };
      return { level: opt.mode === 'model' ? 'red' : 'amber', reason: 'otherSeries', mine, cols, sameProd };
    }
  }
  if (opt.mode === 'model') return { level: 'red', reason: 'model', mine, cols, sameProd };
  return { level: 'amber', reason: opt.cf ? 'otherColour' : 'modelOwned', mine, cols, sameProd };
}
