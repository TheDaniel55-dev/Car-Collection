// Export / import: encrypted JSON, plain JSON, CSV, and the old prototype format.
import * as db from './db.js';
import { castKey, codeKey } from '../shared/text.js';
import { colorFamily, RO_COLORS } from '../shared/colors.js';
import { norm } from '../shared/text.js';
import { S, uid, makeSnap, reloadOwned, saveProfile } from './store.js';
import { own } from './search.js';
import { encryptJSON, decryptJSON } from './crypto.js';
import { rarity } from './rarity.js';
import { learnCode } from './catalogue.js';

export function buildBackup() {
  const { pin, ...profile } = S.profile; // the PIN hash never leaves the device
  return { app: 'car-collection', v: 1, kind: 'backup', created: new Date().toISOString(), profile, owned: own.list };
}

export async function exportEncrypted(password) { return encryptJSON(buildBackup(), password); }

export function toCSV() {
  const head = ['name', 'base_code', 'card_code', 'colour', 'series', 'year', 'casting_year', 'qty', 'status', 'production_code', 'location', 'note', 'rarity_estimate'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = own.list.map((o) => [o.snap.name, o.snap.base, o.snap.toy, o.snap.col, o.snap.ser, o.snap.y || '', o.snap.cy || '', o.qty, o.st, o.prod, o.loc, o.note, rarity(o.snap)].map(q).join(','));
  return '﻿' + [head.join(','), ...rows].join('\n');
}

/** Save a file: iOS share sheet when possible, otherwise a normal download. */
export async function saveFile(name, text, mime = 'application/json') {
  const file = new File([text], name, { type: mime });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'shared'; }
  } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

const isEnvelope = (o) => o && o.app === 'car-collection' && o.enc === 'aes-gcm';

/** Parses text/JSON into a backup object (decrypting if needed). */
export async function parseBackup(text, password) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('format'); }
  if (isEnvelope(data)) {
    if (!password) throw new Error('password');
    try { data = await decryptJSON(data, password); } catch { throw new Error('wrong-password'); }
  }
  return data;
}

function fromPrototype(arr) {
  const out = []; let skipped = 0;
  for (const c of arr) {
    if (c.ex) { skipped++; continue; }
    const col = c.color || '';
    const cf = RO_COLORS[norm(col)] || colorFamily(col);
    const snap = makeSnap({ name: c.name || c.code, col, cf, ser: c.series, y: 0, cy: c.year, toy: c.card, base: c.code, made: c.made });
    out.push({ id: uid(), pid: S.profile.id, vid: null, snap, qty: 1, prod: codeKey(c.prod), loc: '', st: c.status === 'card' ? 'carded' : 'loose', note: c.note || '', photo: c.photo || '', added: Number(c.added) || Date.now() });
  }
  return { owned: out, skipped };
}

/** Restore into the ACTIVE profile (replaces its collection). Returns a summary. */
export async function restore(data) {
  let owned; let skipped = 0;
  if (Array.isArray(data)) ({ owned, skipped } = fromPrototype(data));
  else if (data?.app === 'car-collection' && Array.isArray(data.owned)) {
    owned = data.owned.map((o) => ({ ...o, id: o.id || uid(), pid: S.profile.id, snap: makeSnap({ ...o.snap, ty: o.snap?.ty }) }));
    if (data.profile && !S.profile.onboarded) {
      const keep = { id: S.profile.id, pin: S.profile.pin, created: S.profile.created };
      S.profile = { ...S.profile, ...data.profile, ...keep }; await saveProfile();
    }
  } else throw new Error('format');
  await db.deleteOwnedFor(S.profile.id);
  await db.putMany('owned', owned);
  for (const o of owned) if (o.snap.base) await learnCode(o.snap.base, o.snap.key);
  await reloadOwned();
  return { n: owned.length, skipped };
}
