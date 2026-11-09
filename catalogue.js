// In-memory catalogue (loaded from IndexedDB) + sync with the published dataset.
import { norm, castKey, codeKey } from '../shared/text.js';
import { brandOf } from '../shared/brands.js';
import { colorFamily } from '../shared/colors.js';
import * as db from './db.js';

// Compact row layout used inside data shards (see docs/DATA-FORMAT.md)
export const FIELDS = ['id', 'name', 'toy', 'col', 'ser', 'y', 'ty', 'num', 'base', 'tp', 'wh', 'cy'];

export const cat = {
  ready: false, list: [], byId: new Map(), byKey: new Map(), byCode: new Map(),
  castings: new Map(), codeList: [], learned: new Map(), manifest: null, seed: false,
};

export function rowToVariant(r) {
  const v = {};
  FIELDS.forEach((f, i) => { v[f] = r[i] ?? ''; });
  v.y = Number(v.y) || 0;
  v.cy = Number(v.cy) || 0;
  v.k = castKey(v.name);
  v.cf = colorFamily(v.col);
  v.s = norm(`${v.name} ${v.toy} ${v.base} ${v.ser} ${v.col}`);
  return v;
}

export function indexCatalogue(list) {
  cat.list = list;
  cat.byId = new Map(); cat.byKey = new Map(); cat.byCode = new Map(); cat.castings = new Map();
  const codes = new Set();
  for (const v of list) {
    cat.byId.set(v.id, v);
    (cat.byKey.get(v.k) || cat.byKey.set(v.k, []).get(v.k)).push(v);
    for (const raw of [v.toy, v.base]) {
      const c = codeKey(raw);
      if (c.length >= 4) {
        codes.add(c);
        const a = cat.byCode.get(c) || cat.byCode.set(c, new Set()).get(c);
        a.add(v.k);
      }
    }
    let c = cat.castings.get(v.k);
    if (!c) { c = { key: v.k, name: v.name, n: norm(v.name), brand: brandOf(v.name), count: 0, y0: 9999, y1: 0, bases: new Set(), from: 'cat' }; cat.castings.set(v.k, c); }
    c.count++;
    if (v.y) { c.y0 = Math.min(c.y0, v.y); c.y1 = Math.max(c.y1, v.y); }
    if (v.base) c.bases.add(codeKey(v.base));
  }
  cat.codeList = [...codes];
}

export async function loadCatalogue() {
  const rows = await db.getAll('variants');
  indexCatalogue(rows);
  const codes = await db.getAll('codes');
  cat.learned = new Map(codes.map((c) => [c.code, c.key]));
  const man = await db.getMeta('manifest');
  cat.manifest = man || null;
  cat.seed = !!man?.seed;
  cat.ready = true;
  return cat.list.length;
}

export async function learnCode(base, key) {
  const code = codeKey(base);
  if (code.length < 3 || !key) return;
  if (cat.learned.get(code) === key) return;
  cat.learned.set(code, key);
  await db.put('codes', { code, key });
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/**
 * Compare the local dataset with the published one and download only changed shards.
 * onProgress({done, total, bytes, totalBytes, pct, etaSec, shard})
 */
export async function syncCatalogue({ onProgress } = {}) {
  let man;
  try { man = await fetchJSON('data/manifest.json', { cache: 'no-store' }); }
  catch { return { status: 'offline' }; }
  const installed = (await db.getMeta('installed')) || {};
  const todo = man.shards.filter((s) => installed[s.y] !== s.hash);
  const gone = Object.keys(installed).filter((y) => !man.shards.some((s) => String(s.y) === y));
  if (!todo.length && !gone.length) {
    await db.setMeta('manifest', man); await db.setMeta('checked', Date.now());
    return { status: 'current', manifest: man };
  }
  const before = cat.list.length;
  const totalBytes = todo.reduce((a, s) => a + (s.size || 0), 0) || 1;
  let bytes = 0; const t0 = Date.now(); let i = 0;
  for (const s of todo) {
    const data = await fetchJSON(`data/${s.file}?h=${s.hash}`);
    const rows = data.rows.map(rowToVariant);
    await db.replaceYear(s.y, rows);
    installed[s.y] = s.hash; await db.setMeta('installed', installed);
    bytes += s.size || 0; i++;
    const el = (Date.now() - t0) / 1000;
    onProgress?.({ done: i, total: todo.length, bytes, totalBytes, pct: Math.min(100, Math.round((bytes / totalBytes) * 100)), etaSec: bytes ? Math.max(0, (el / bytes) * (totalBytes - bytes)) : null, shard: s.y });
    await new Promise((r) => setTimeout(r, 0));
  }
  for (const y of gone) { await db.replaceYear(Number(y), []); delete installed[y]; }
  await db.setMeta('installed', installed);
  await db.setMeta('manifest', man);
  await db.setMeta('checked', Date.now());
  await loadCatalogue();
  return { status: 'updated', manifest: man, added: Math.max(0, cat.list.length - before), first: before === 0 };
}
