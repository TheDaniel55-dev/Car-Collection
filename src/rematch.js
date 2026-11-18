// A car added by hand stays a hand-made record for ever, even after a database update brings
// the real entry. This finds those matches and fills in what the user never had: series, line,
// year, number. The colour and the name stay as the user wrote them.
import { cat } from './catalogue.js';
import { own, variantsOf } from './search.js';
import { saveOwned } from './store.js';
import * as db from './db.js';
import { codeKey } from '../shared/text.js';

const FILL = ['ser', 'num', 'tp', 'wh', 'made', 'alt', 'toy', 'base'];
let skip = new Set();

export async function loadRematch() { skip = new Set((await db.getMeta('rematchSkip')) || []); }
const saveSkip = () => db.setMeta('rematchSkip', [...skip]);

/** Catalogue variants a hand-added car could be, found by its codes and its name. */
function candidatesFor(s) {
  const keys = new Set();
  for (const code of [s.base, s.toy]) {
    const c = codeKey(code);
    if (c.length >= 4) cat.byCode.get(c)?.forEach((k) => keys.add(k));
  }
  if (cat.byKey.has(s.key)) keys.add(s.key);
  let vs = [...keys].flatMap((k) => variantsOf(k));
  if (!vs.length) return [];
  // Narrow by what the user actually recorded. Each filter only applies if it leaves something.
  const narrow = (f) => { const n = vs.filter(f); if (n.length) vs = n; };
  if (s.cf) narrow((v) => v.cf === s.cf);
  if (s.y) narrow((v) => v.y === s.y);
  if (codeKey(s.toy).length >= 4) narrow((v) => codeKey(v.toy) === codeKey(s.toy));
  return vs;
}

/** What a match would add to a record, or null when it would add nothing. */
function gain(s, v) {
  const adds = {};
  for (const f of FILL) if (!String(s[f] ?? '').trim() && String(v[f] ?? '').trim()) adds[f] = v[f];
  if (!s.y && v.y) adds.y = v.y;
  if (!s.cy && v.cy) adds.cy = v.cy;
  if (v.ty && v.ty !== s.ty) adds.ty = v.ty;
  return Object.keys(adds).length ? adds : null;
}

/** One proposal per hand-added car that now has exactly one plausible catalogue entry. */
export function proposals() {
  if (!cat.ready) return [];
  const out = [];
  for (const rec of own.list) {
    if (rec.vid || skip.has(rec.id)) continue;
    const vs = candidatesFor(rec.snap);
    if (vs.length !== 1) continue;              // ambiguous: never guess for the user
    const adds = gain(rec.snap, vs[0]);
    if (adds) out.push({ rec, variant: vs[0], adds });
  }
  return out;
}

export async function applyProposal(p) {
  const rec = own.list.find((x) => x.id === p.rec.id) || p.rec;
  rec.vid = p.variant.id;
  Object.assign(rec.snap, p.adds);
  await saveOwned(rec);
}

export async function skipProposal(id) { skip.add(id); await saveSkip(); }
export async function skipAll(ids) { ids.forEach((i) => skip.add(i)); await saveSkip(); }

/** The catalogue version this device has already been offered matches for. */
export const seenVersion = () => db.getMeta('rematchSeen');
export const markSeen = () => db.setMeta('rematchSeen', cat.manifest?.version ?? 0);
