// Rarity ESTIMATE. There are no official production numbers; this is a transparent heuristic.
import { norm } from '../shared/text.js';
import { classifyType } from '../shared/classify.js';
import { cat } from './catalogue.js';

export const BASE_POINTS = { m: 10, ex: 22, p: 28, th: 55, cv: 60, rlc: 68, sth: 80, er: 85 };
export const TIERS = [20, 35, 55, 80]; // <20 common, <35 uncommon, <55 rare, <80 very rare, else grail
export const TIER_COLORS = ['#8a8a8a', '#2fb457', '#2f6bff', '#8a4dff', '#ff4a1c'];

/** @param s snapshot or catalogue variant: { ty, ser, y, key|k, cf } */
export function rarityBreakdown(s, now = new Date().getFullYear()) {
  const ty = s.ty || classifyType(s.ser);
  const key = s.key || s.k;
  const parts = [{ id: 'type', pts: BASE_POINTS[ty] ?? 10, ty }];
  const y = s.y || s.cy || 0;
  parts.push({ id: 'age', pts: y ? Math.min(15, Math.max(0, Math.round((now - y) * 0.4))) : 0, y });
  const same = (cat.byKey.get(key) || []).filter((v) => v.cf && v.cf === s.cf).length;
  parts.push({ id: 'oneColour', pts: s.cf && same === 1 ? 4 : 0 });
  const serName = norm(s.ser);
  let serSize = 0;
  if (serName && s.y) {
    const seen = new Set();
    for (const v of cat.list) if (v.y === s.y && norm(v.ser) === serName) seen.add(v.k);
    serSize = seen.size;
  }
  parts.push({ id: 'shortSeries', pts: serSize > 0 && serSize <= 6 && ty === 'm' ? 3 : 0, size: serSize });
  const total = Math.max(1, Math.min(100, parts.reduce((a, p) => a + p.pts, 0)));
  return { score: total, tier: tierOf(total), parts, ty };
}

export const tierOf = (n) => (n < TIERS[0] ? 0 : n < TIERS[1] ? 1 : n < TIERS[2] ? 2 : n < TIERS[3] ? 3 : 4);
export const rarity = (s) => rarityBreakdown(s).score;
