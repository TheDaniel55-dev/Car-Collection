// Series completion: how many castings exist in each series (per year) and how many you own.
import { norm } from '../shared/text.js';
import { cat } from './catalogue.js';
import { own } from './search.js';

const SKIP = /^(mainline|other|unknown|various|n\/a|none|-+)?$/i;
let cache = null, cacheFor = null;

export function seriesGroups() {
  if (cache && cacheFor === cat.list) return cache;
  const map = new Map();
  for (const v of cat.list) {
    const name = String(v.ser || '').trim();
    if (!name || SKIP.test(name) || !v.y) continue;
    const id = `${v.y}|${norm(name)}`;
    let g = map.get(id);
    if (!g) { g = { id, name, y: v.y, items: new Map() }; map.set(id, g); }
    let it = g.items.get(v.k);
    if (!it) { it = { key: v.k, name: v.name, vids: [], num: v.num || '' }; g.items.set(v.k, it); }
    it.vids.push(v.id);
  }
  cache = [...map.values()].filter((g) => g.items.size >= 3);
  cacheFor = cat.list;
  return cache;
}

export function progress(groups = seriesGroups()) {
  const sers = new Set(); // key|y|ser
  for (const o of own.list) sers.add(`${o.snap.key}|${o.snap.y || ''}|${norm(o.snap.ser)}`);
  const vids = new Set(own.list.map((o) => o.vid).filter(Boolean));
  const lastAdded = new Map();
  return groups.map((g) => {
    let have = 0; let last = 0; const missing = []; const owned = [];
    for (const it of g.items.values()) {
      const ok = it.vids.some((v) => vids.has(v)) || sers.has(`${it.key}|${g.y}|${norm(g.name)}`) || sers.has(`${it.key}||${norm(g.name)}`);
      if (ok) {
        have++; owned.push(it);
        for (const o of own.byKey.get(it.key) || []) last = Math.max(last, o.added || 0);
      } else missing.push(it);
    }
    lastAdded.set(g.id, last);
    return { ...g, total: g.items.size, have, pct: have / g.items.size, missing, owned, last };
  });
}
