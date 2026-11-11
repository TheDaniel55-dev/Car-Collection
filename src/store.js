// App state: profiles (local "accounts"), owned cars, options.
import * as db from './db.js';
import { castKey, norm, codeKey, splitAlt } from '../shared/text.js';
import { colorFamily } from '../shared/colors.js';
import { classifyType } from '../shared/classify.js';
import { cat, learnCode } from './catalogue.js';
import { indexOwned, own } from './search.js';

export const S = {
  profile: null, profiles: [], tab: 'col', shop: false,
  f: { q: '', brand: '', sort: 'new', layout: 'list', status: '' },
  chk: { q: '', cf: '', prod: '', ser: '', photo: '', pick: null },
  sync: null, locked: false,
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const newProfile = (name = '') => ({
  id: uid(), name, lang: 'en', theme: 'track', mode: 'sys',
  opts: { prod: true, carded: false, auto: false, dup: 'exact', photo: 'medium' },
  prefs: { cats: [], brands: [], eras: [], how: 'both', goal: 'series', count: '', buy: [], lines: [] },
  onboarded: false, pin: null, created: Date.now(),
});

const LS = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export async function initStore() {
  let profiles = await db.getAll('profiles');
  if (!profiles.length) { const p = newProfile(); await db.put('profiles', p); profiles = [p]; }
  S.profiles = profiles;
  const want = LS.get('cc.pid');
  S.profile = profiles.find((p) => p.id === want) || profiles[0];
  LS.set('cc.pid', S.profile.id);
  LS.set('cc.theme', `${S.profile.theme}|${S.profile.mode}`);
  await reloadOwned();
  S.locked = !!S.profile.pin;
}

/**
 * Older versions treated "Name (2nd Color)" as another model. Fold such cars (and wishlist entries) into the base model;
 * the "2nd Color" text is kept as snap.alt. Safe to run on every load: it changes nothing once migrated.
 */
export async function migrateAlt(list, profile) {
  let n = 0;
  for (const o of list) {
    const sp = splitAlt(o.snap.name); const key = castKey(o.snap.name);
    if (!sp.alt && o.snap.key === key) continue;
    o.snap = { ...o.snap, name: sp.name || o.snap.name, key, ...(sp.alt && !o.snap.alt ? { alt: sp.alt } : {}) };
    await db.put('owned', o);
    if (o.snap.base) await learnCode(o.snap.base, key);
    n++;
  }
  if (profile?.wish?.length) {
    let ch = false;
    profile.wish = profile.wish.map((w) => { const sp = splitAlt(w.name); const k = castKey(w.name || ''); if (!w.name || (!sp.alt && w.key === k)) return w; ch = true; return { ...w, name: sp.name, key: k }; });
    if (ch) { await db.put('profiles', profile); n++; }
  }
  return n;
}

export async function reloadOwned() {
  const list = (await db.getAllBy('owned', 'pid', S.profile.id)).sort((a, b) => (a.added || 0) - (b.added || 0));
  await migrateAlt(list, S.profile);
  indexOwned(list);
}

export const saveProfile = async () => {
  await db.put('profiles', S.profile);
  LS.set('cc.theme', `${S.profile.theme}|${S.profile.mode}`);
};

export async function switchProfile(id) {
  const p = S.profiles.find((x) => x.id === id);
  if (!p) return;
  S.profile = p; LS.set('cc.pid', id);
  LS.set('cc.theme', `${p.theme}|${p.mode}`);
  S.locked = !!p.pin;
  await reloadOwned();
}

export async function createProfile(name) {
  const p = newProfile(name);
  p.lang = S.profile?.lang || 'en'; p.theme = S.profile?.theme || 'track'; p.mode = S.profile?.mode || 'sys';
  await db.put('profiles', p); S.profiles.push(p);
  return p;
}

export async function deleteProfile(id) {
  if (S.profiles.length < 2) return false;
  await db.deleteOwnedFor(id); await db.del('profiles', id);
  S.profiles = S.profiles.filter((p) => p.id !== id);
  if (S.profile.id === id) await switchProfile(S.profiles[0].id);
  return true;
}

export const opt = (k) => S.profile.opts[k];

/** Frozen description of a car, so it stays valid even if the catalogue changes later. */
export function makeSnap(src) {
  const name = String(src.name || '').trim();
  const col = String(src.col || '').trim();
  return {
    name, key: castKey(name), col, cf: src.cf || colorFamily(col),
    ser: String(src.ser || '').trim(), y: Number(src.y) || 0, cy: Number(src.cy) || 0,
    toy: codeKey(src.toy), base: codeKey(src.base), num: String(src.num || '').trim(),
    ty: src.ty || classifyType(src.ser), made: String(src.made || '').trim(),
    tp: String(src.tp || '').trim(), wh: String(src.wh || '').trim(), alt: String(src.alt || '').trim(),
  };
}

function findExact(snap, vid) {
  if (vid) { const same = (own.byVid.get(vid) || []).find((o) => (o.snap.cf || '') === (snap.cf || '')); if (same) return same; }
  if (!snap.cf) return null;
  return (own.byKey.get(snap.key) || []).find((o) => !o.vid === !vid && o.snap.cf === snap.cf && norm(o.snap.ser) === norm(snap.ser)) || null;
}

export async function addOwned({ vid = null, snap, qty = 1, prod = '', loc = '', st = 'loose', note = '', photo = '', separate = false }) {
  const ex = separate ? null : findExact(snap, vid);
  let rec; let merged = false;
  if (ex) { ex.qty += qty; rec = ex; merged = true; if (prod && !ex.prod) ex.prod = codeKey(prod); }
  else rec = { id: uid(), pid: S.profile.id, vid, snap, qty, prod: codeKey(prod), loc, st, note, photo, added: Date.now() };
  await db.put('owned', rec);
  if (!merged) { own.list.push(rec); }
  indexOwned(own.list);
  if (snap.base) await learnCode(snap.base, snap.key);
  return { rec, merged };
}

export async function saveOwned(rec) {
  await db.put('owned', rec);
  indexOwned(own.list);
  if (rec.snap.base) await learnCode(rec.snap.base, rec.snap.key);
}

export async function removeOwned(id) {
  await db.del('owned', id);
  indexOwned(own.list.filter((o) => o.id !== id));
}

export async function wipeCollection() {
  await db.deleteOwnedFor(S.profile.id);
  indexOwned([]);
}

export const isDark = () => {
  const p = S.profile; if (!p) return false;
  return p.theme === 'neon' || p.mode === 'dark' || (p.mode === 'sys' && matchMedia('(prefers-color-scheme: dark)').matches);
};
