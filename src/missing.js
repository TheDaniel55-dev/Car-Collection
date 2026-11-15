// A local note of what the app could not find, so the gaps in the dataset can be reported.
// Stays on this device; nothing is sent anywhere.
import * as db from './db.js';

const CAP = 200;
let list = [];

export async function loadMissing() { list = (await db.getMeta('missing')) || []; return list; }
export const missingList = () => list;

export async function addMissing(q, extra = {}) {
  const s = String(q ?? '').trim();
  if (!s) return false;
  const k = s.toLowerCase();
  const was = list.find((x) => x.q.toLowerCase() === k);
  list = [{ q: s, ts: Date.now(), n: (was?.n || 0) + 1, ...extra }, ...list.filter((x) => x.q.toLowerCase() !== k)];
  if (list.length > CAP) list.length = CAP;
  await db.setMeta('missing', list);
  return true;
}

export async function clearMissing() { list = []; await db.setMeta('missing', []); }

/** Plain text, ready to paste into a message. */
export function missingText() {
  const d = (ts) => new Date(ts).toISOString().slice(0, 10);
  return list.map((x) => `${x.q}${x.n > 1 ? ` (×${x.n})` : ''} — ${d(x.ts)}${x.where ? ` — ${x.where}` : ''}`).join('\n');
}
