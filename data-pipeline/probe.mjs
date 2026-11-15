// Diagnostic: shows what the wiki pages actually look like, so the parser can be matched to them.
// Usage: node data-pipeline/probe.mjs --page "List of 2024 Hot Wheels" [--search "Formula 1"] [--tables 6]
import { parse } from 'node-html-parser';
import { tableGrid, parsePage } from './parse.mjs';
import { sleep } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const API = 'https://hotwheels.fandom.com/api.php';
const UA = 'car-collection-data-bot/1.0 (+https://github.com/; open-source hobby project, polite 1 req/s)';

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

const term = arg('search', '');
if (term) {
  console.log(`\n=== PAGES MATCHING "${term}" ===`);
  const j = await api({ action: 'query', list: 'search', srsearch: term, srlimit: '25', srnamespace: '0' });
  for (const h of j.query?.search || []) console.log(' -', h.title);
  await sleep(1000);
}

const page = arg('page', 'List of 2024 Hot Wheels');
console.log(`\n=== PAGE: ${page} ===`);
const j = await api({ action: 'parse', page, prop: 'text', disableeditsection: '1', redirects: '1' });
const html = j.parse?.text || '';
console.log('html length:', html.length);

const root = parse(html);
const maxT = Number(arg('tables', 6));
const tables = root.querySelectorAll('table');
console.log('tables on page:', tables.length);
tables.slice(0, maxT).forEach((tbl, i) => {
  const grid = tableGrid(tbl);
  console.log(`\n--- table ${i + 1} (${grid.length} grid rows, class="${tbl.getAttribute('class') || ''}") ---`);
  grid.slice(0, 4).forEach((row, r) => {
    console.log(`  row${r}${row.some((c) => c.th) ? ' [TH]' : ''}: ${row.map((c) => JSON.stringify(c.text.slice(0, 28))).join(' | ')}`);
  });
});

const rows = parsePage(html, Number((/\b(\d{4})\b/.exec(page) || [])[1]) || 0);
console.log(`\n=== PARSER RESULT: ${rows.length} rows ===`);
const F = ['id', 'name', 'toy', 'col', 'ser', 'y', 'ty', 'num', 'base', 'tp', 'wh', 'cy'];
for (const f of F) {
  const i = F.indexOf(f);
  console.log(`  ${f.padEnd(5)} filled in ${rows.filter((r) => String(r[i] ?? '').trim()).length}/${rows.length}`);
}
console.log('\nfirst 3 rows:');
for (const r of rows.slice(0, 3)) console.log(' ', JSON.stringify(Object.fromEntries(F.map((f, i) => [f, r[i]]))));
console.log('\nCopy this whole log and send it back, so the parser can be fixed against the real pages.');
