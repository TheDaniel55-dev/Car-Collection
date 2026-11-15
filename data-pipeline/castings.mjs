// Phase 2 of the dataset: the "Versions" table on each casting's own page.
// The yearly "List of YYYY Hot Wheels" pages carry no colour column - colours, wheels,
// country and the per-variant details only exist on the casting pages.
import { parse } from 'node-html-parser';
import { tableGrid } from './parse.mjs';
import { classifyType } from '../shared/classify.js';

const clean = (s) => s.replace(/\[\d+\]|\[[a-z]\]/gi, '').replace(/\s+/g, ' ').trim();
const codeKey = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);

// Header keywords. "Base Color/Type" is the colour of the metal base, NOT the casting code
// stamped under the car - that code is nowhere on the wiki, so `base` stays empty here.
const HDR = {
  num: /^(col|collector)\.?\s*#|^#$|^no\.?$/i,
  y: /^year/i,
  ser: /series|segment|collection/i,
  col: /^colou?r$|body\s*colou?r|^main\s*colou?r/i,
  tp: /tampo|deco/i,
  wh: /wheel/i,
  toy: /toy\s*#|toy\s*no|^toy$|card\s*code/i,
  made: /country|made\s*in/i,
  team: /team/i,
  driver: /driver/i,
  notes: /notes/i,
};

function mapHeader(cells) {
  const map = {};
  cells.forEach((c, i) => {
    for (const [k, re] of Object.entries(HDR)) if (!(k in map) && re.test(c.text)) { map[k] = i; break; }
  });
  return map;
}

/** Rows for one casting page. `title` is the casting name (the page title). */
export function parseVersions(html, title) {
  const root = parse(html);
  const name = clean(title).replace(/\s*\(.*?\)\s*$/, '').trim() || clean(title);
  const out = [];
  const seen = new Set();
  for (const tbl of root.querySelectorAll('table')) {
    const grid = tableGrid(tbl);
    const hi = grid.findIndex((r) => r.some((c) => c.th) && mapHeader(r).col !== undefined);
    if (hi < 0) continue;                       // a versions table always has a Color column
    const map = mapHeader(grid[hi]);
    for (const row of grid.slice(hi + 1)) {
      const g = (k) => (map[k] === undefined ? '' : clean(row[map[k]]?.text || ''));
      const col = g('col');
      const y = Number((/\b(19|20)\d{2}\b/.exec(g('y')) || [])[0]) || 0;
      if (!col && !y) continue;
      if (/^colou?r$/i.test(col)) continue;     // a repeated header row
      const ser = g('ser');
      const toy = g('toy');
      // Team and driver are what tell two F1 cars of the same colour apart, so they ride
      // along in the decoration field, which the app already shows.
      const deco = [...new Set([g('team'), g('driver'), g('tp')].map(clean).filter(Boolean))].join(' · ');
      const id = `c-${slug(name)}-${codeKey(toy) || codeKey(`${y}${col}${ser}${deco}`).slice(0, 12)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push([id, name, toy, col, ser, y, classifyType(`${ser} ${name} ${g('notes')}`), g('num'), '', deco, g('wh'), 0, g('made')]);
    }
  }
  return out;
}

const SKIP_LINK = /^(File|Category|Template|Help|User|Special|Talk|Module):|^List of |Collection$|^Hot Wheels$|^\d{4}$/i;

/** Casting pages linked from a list or collection page. */
export function castingLinks(html) {
  const root = parse(html);
  const titles = new Set();
  for (const tbl of root.querySelectorAll('table.wikitable')) {
    for (const a of tbl.querySelectorAll('a')) {
      if ((a.getAttribute('class') || '').includes('new')) continue;   // red link, page does not exist
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/wiki/')) continue;
      const title = decodeURIComponent(href.slice(6)).replace(/_/g, ' ').split('#')[0];
      if (!title || SKIP_LINK.test(title)) continue;
      titles.add(title);
    }
  }
  return [...titles];
}

/**
 * Casting-page rows carry the colour, list rows carry the collector number. Where a card code
 * matches, they are the same release: keep the richer casting row and take the number from the
 * list. Every list row without a match is kept as it was, so nothing is lost.
 */
export function mergeRows(listRows, castRows) {
  const byToy = new Map();
  for (const r of listRows) { const c = codeKey(r[2]); if (c.length >= 4) (byToy.get(c) || byToy.set(c, []).get(c)).push(r); }
  const used = new Set(); const out = []; const seen = new Set();
  for (const r of castRows) {
    if (seen.has(r[0])) continue; seen.add(r[0]);
    const m = byToy.get(codeKey(r[2]));
    if (m?.length) {
      const l = m[0]; used.add(l[0]);
      if (!r[7]) r[7] = l[7];                      // collector number
      if (!r[5]) r[5] = l[5];                      // year
      if (!r[4]) r[4] = l[4];                      // series
      if (!r[11]) r[11] = l[11];                   // casting (c) year
    }
    out.push(r);
  }
  for (const l of listRows) if (!used.has(l[0])) out.push(l);
  return out;
}

