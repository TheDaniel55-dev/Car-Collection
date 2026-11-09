// Tolerant, header-driven parser for "List of YYYY Hot Wheels" wiki pages.
// Header names are matched by keywords, so a changed column order does not break it.
import { parse } from 'node-html-parser';
import { classifyType } from '../shared/classify.js';

const HDR = {
  toy: /toy\s*#|toy\s*no|toy\s*code|^toy$|card\s*code/i,
  col: /colou?r/i,
  name: /^(name|model|casting|vehicle|car)\b|casting name/i,
  ser: /series|segment/i,
  num: /^(col|collector)\.?\s*#|^#$|number|^no\.?$/i,
  base: /base\s*code|casting\s*code|^code$/i,
  tp: /tampo|deco/i,
  wh: /wheel/i,
  cy: /^©|casting\s*year|copyright/i,
};
const clean = (s) => s.replace(/\[\d+\]|\[[a-z]\]/gi, '').replace(/\s+/g, ' ').trim();

/** Expand a <table> into a 2D grid honouring rowspan/colspan. */
export function tableGrid(table) {
  const grid = [];
  table.querySelectorAll('tr').forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const cell of tr.querySelectorAll('th,td')) {
      while (grid[r][c] !== undefined) c++;
      const rs = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1);
      const cs = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      const text = clean(cell.text);
      const isTh = cell.tagName.toLowerCase() === 'th';
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
        (grid[r + i] = grid[r + i] || [])[c + j] = { text, th: isTh };
      }
      c += cs;
    }
  });
  return grid.map((row) => Array.from(row, (x) => x || { text: '', th: false }));
}

function mapHeader(cells) {
  const map = {};
  cells.forEach((c, i) => {
    for (const [k, re] of Object.entries(HDR)) if (!(k in map) && re.test(c.text)) { map[k] = i; break; }
  });
  return map;
}

/** Return rows in dataset tuple order for one page. */
export function parsePage(html, year) {
  const root = parse(html);
  const out = [];
  const seen = new Set();
  // Walk headings and tables in document order to know the current series heading.
  let heading = '';
  const nodes = root.querySelectorAll('h2,h3,h4,table');
  for (const n of nodes) {
    const tag = n.tagName.toLowerCase();
    if (tag !== 'table') { heading = clean(n.text).replace(/\[edit\]/i, '').trim(); continue; }
    const grid = tableGrid(n);
    const hi = grid.findIndex((r) => r.some((c) => c.th) && Object.keys(mapHeader(r)).length >= 2);
    if (hi < 0) continue;
    const map = mapHeader(grid[hi]);
    if (map.name === undefined) continue;
    for (const row of grid.slice(hi + 1)) {
      const g = (k) => (map[k] === undefined ? '' : row[map[k]]?.text || '');
      const name = g('name');
      if (!name || /^(name|model)$/i.test(name)) continue;
      const ser = g('ser') || heading;
      const col = g('col');
      const toy = g('toy');
      const key = [name, toy, col, ser, g('num')].join('|');
      if (seen.has(key)) continue; seen.add(key);
      const id = `${year}-${(toy || name).toLowerCase().replace(/[^a-z0-9]+/g, '')}-${out.length}`;
      out.push([id, name, toy, col, ser, year, classifyType(`${ser} ${name}`), g('num'), g('base'), g('tp'), g('wh'), g('cy')]);
    }
  }
  return out;
}
