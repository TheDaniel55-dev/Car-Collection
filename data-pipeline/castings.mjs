// Phase 2 of the dataset: the "Versions" table on each casting's own page.
// The yearly "List of YYYY Hot Wheels" pages carry no colour column - colours, wheels,
// country and the per-variant details only exist on the casting pages.
import { parse } from 'node-html-parser';
import { tableGrid } from './parse.mjs';
import { classifyType } from '../shared/classify.js';

const clean = (s) => s.replace(/\[\d+\]|\[[a-z]\]/gi, '').replace(/\s+/g, ' ').trim();
/**
 * The wiki glues the position in the series onto the series name ("Track Aces1/5", "Formula 11/5").
 * Left alone, the five cars of one series would each become a series of their own and the
 * completion rings would never fill, so the position is split off.
 */
const splitSeries = (raw) => {
  // Greedy on purpose: "Formula 11/5" is "Formula 1" + "1/5", not "Formula" + "11/5".
  const m = /^(.*\S)\s*(\d{1,2}\s*\/\s*\d{1,3})$/.exec(clean(raw));
  return m && m[1] ? { ser: m[1].trim(), pos: m[2].replace(/\s+/g, '') } : { ser: clean(raw), pos: '' };
};
const codeKey = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Short stable hash (FNV-1a), so ids stay the same between runs. */
const h = (s) => {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(36).padStart(7, '0');
};
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
      const { ser, pos } = splitSeries(g('ser'));
      const toy = g('toy');
      // Team and driver are what tell two F1 cars of the same colour apart, so they ride
      // along in the decoration field, which the app already shows.
      const deco = [...new Set([g('team'), g('driver'), g('tp')].map(clean).filter(Boolean))].join(' · ');
      const notes = g('notes');
      // Several variants can share one toy number - a Formula One 5-pack carries a single code
      // for every team inside it - so the id must also hold what tells them apart, or all but
      // the first team of each pack would be dropped as a duplicate.
      const mark = h(`${y}|${ser}|${col}|${deco}|${g('wh')}`);
      const id = `c-${slug(name)}-${[codeKey(toy), mark].filter(Boolean).join('-')}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push([id, name, toy, col, ser, y, classifyType(`${ser} ${name} ${notes}`), g('num') || pos, '', deco, g('wh'), 0, g('made'), notes]);
    }
  }
  // The code stamped under the car is the toy number of the casting's FIRST release - the row
  // the wiki marks "New Model". Every later release keeps it, because the base tooling is the
  // same. That is the code people read off the car, so it goes on every row of this casting.
  const debut = out.find((r) => /new\s*model/i.test(r[13] || '')) ||
    out.filter((r) => r[5]).sort((a, b) => a[5] - b[5])[0];
  const base = debut ? codeKey(debut[2]) : '';
  for (const r of out) { r[8] = base; r.length = 13; }
  return out;
}

const NUM = /^(col|collector|series)\.?\s*#|^#$|^no\.?$/i;
const PREM = {
  num: NUM,
  toy: /toy\s*#|toy\s*no|^toy$|card\s*code/i,
  name: /casting\s*name|^name$|^model|vehicle/i,
  col: /colou?r/i,
  wh: /wheel/i,
  notes: /notes/i,
};

/**
 * Premium/themed per-year pages ("2024 Car Culture", "2024 Hot Wheels Boulevard", ...).
 * These do carry a Body Color column, and the series name comes from the nearest heading.
 */
export function parsePremiumPage(html, year, pageTitle = '') {
  const root = parse(html);
  const out = [];
  const seen = new Set();
  let heading = '';
  for (const n of root.querySelectorAll('h2,h3,h4,table')) {
    if (n.tagName.toLowerCase() !== 'table') { heading = clean(n.text).replace(/\[edit\]/i, '').trim(); continue; }
    const grid = tableGrid(n);
    // 'num' is tested before 'ser' on purpose: these tables head their number column "Series #".
    const hi = grid.findIndex((r) => r.some((c) => c.th) && (() => { const m = {}; r.forEach((c, i) => { for (const [k, re] of Object.entries(PREM)) if (!(k in m) && re.test(c.text)) { m[k] = i; break; } }); return m.name !== undefined && m.col !== undefined; })());
    if (hi < 0) continue;
    const map = {};
    grid[hi].forEach((c, i) => { for (const [k, re] of Object.entries(PREM)) if (!(k in map) && re.test(c.text)) { map[k] = i; break; } });
    for (const row of grid.slice(hi + 1)) {
      const g = (k) => (map[k] === undefined ? '' : clean(row[map[k]]?.text || ''));
      const name = g('name');
      if (!name || /casting\s*name/i.test(name)) continue;
      const { ser, pos } = splitSeries(heading.replace(/\s*\(\d{4}\)\s*$/, '') || clean(pageTitle));
      const toy = g('toy');
      const id = `p-${slug(pageTitle || ser)}-${[codeKey(toy), h(`${name}|${g('col')}|${ser}`)].filter(Boolean).join('-')}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push([id, name, toy, g('col'), ser, year, classifyType(`${ser} ${pageTitle} ${name} ${g('notes')}`), g('num') || pos, '', '', g('wh'), 0, '']);
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

