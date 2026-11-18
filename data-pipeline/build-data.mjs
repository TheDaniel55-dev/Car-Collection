// Builds data/ from the Hot Wheels Fandom wiki (MediaWiki API). Polite: 1 request/second, descriptive User-Agent.
// Two phases:
//   1. the yearly "List of YYYY Hot Wheels" pages - names, card codes, series, numbers (no colours)
//   2. each casting's own page - its "Versions" table, which is the only place colours,
//      wheels and country exist, and the only place themed sets like Formula One appear
// Usage: node data-pipeline/build-data.mjs [--from 1968] [--to 2026] [--castings-from 2010] [--no-castings] [--out data] [--dry]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { parsePage } from './parse.mjs';
import { parseVersions, castingLinks, parsePremiumPage, mergeRows } from './castings.mjs';
import { progress, sleep, writeDataset, readRows } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', fileURLToPath(new URL('../data', import.meta.url))));
const FROM = Number(arg('from', 1968)); const TO = Number(arg('to', new Date().getFullYear() + 1));
const API = 'https://hotwheels.fandom.com/api.php';
const UA = 'car-collection-data-bot/1.0 (+https://github.com/; open-source hobby project, polite 1 req/s)';
const MIN_KEEP = 0.7; // refuse to publish if fewer than 70% of the previous rows come back
// Phase 2 is the slow part (one page per casting, 1 req/s), so it has its own year floor.
const CAST_FROM = Number(arg('castings-from', 2010));
const NO_CAST = process.argv.includes('--no-castings');
const EXTRA_CFG = JSON.parse(fs.readFileSync(new URL('./extra-pages.json', import.meta.url), 'utf8'));
const EXTRA = EXTRA_CFG.indexPages || [];

async function api(params, tries = 4) {
  const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
}

async function findPages() {
  const all = [];
  for (const p of ['List of 19', 'List of 20']) {
    let c = {};
    do { const j = await api({ action: 'query', list: 'allpages', apprefix: p, aplimit: '500', ...c }); all.push(...(j.query?.allpages || []).map((x) => x.title)); c = j.continue || null; await sleep(1000); } while (c);
  }
  const pages = new Map();
  for (const t of all) { const m = /^List of (\d{4}) Hot Wheels$/i.exec(t); if (m) { const y = +m[1]; if (y >= FROM && y <= TO) pages.set(y, t); } }
  // Coverage report: years with no matching page, plus any wiki page titles that mention that year (candidates to support later).
  const missing = [];
  for (let y = FROM; y <= TO; y++) if (!pages.has(y)) missing.push(y);
  if (missing.length) {
    console.log(`Years with no "List of YYYY Hot Wheels" page: ${missing.join(', ')}`);
    for (const y of missing) {
      const cand = all.filter((t) => t.includes(String(y))).slice(0, 8);
      if (cand.length) console.log(`  ${y}: candidate titles -> ${cand.join(' | ')}`);
    }
  }
  return [...pages.entries()].sort((a, b) => a[0] - b[0]);
}

/** Report only: other list-like pages on the wiki (Premium, Car Culture, ...) that the yearly mainline lists do not cover. Nothing is parsed or published from these. */
async function discoverOtherLists() {
  const prefixes = ['Car Culture', 'Hot Wheels Premium', 'Premium', 'Boulevard', 'Silver Series', 'Collectors', 'Hot Wheels Collectors', 'Team Transport', 'Pop Culture', 'Hammer Drop', 'Red Line Club', 'RLC', 'List of Hot Wheels', 'List of Car Culture', 'List of Premium'];
  console.log('== Other list pages on the wiki (for coverage planning) ==');
  for (const p of prefixes) {
    try {
      const j = await api({ action: 'query', list: 'allpages', apprefix: p, aplimit: '60' });
      const titles = (j.query?.allpages || []).map((x) => x.title).filter((x) => !/^List of (\d{4}) Hot Wheels$/i.test(x));
      if (titles.length) console.log(`  ${p}* (${titles.length}${j.continue ? '+' : ''}): ${titles.slice(0, 40).join(' | ')}`);
    } catch (e) { console.log(`  ${p}*: lookup failed (${e.message})`); }
    await sleep(1000);
  }
  try {
    const j = await api({ action: 'query', list: 'search', srsearch: 'Hammer Drop Bugatti Veyron HRW06', srlimit: '5' });
    console.log('  search "Hammer Drop Bugatti Veyron HRW06": ' + ((j.query?.search || []).map((x) => x.title).join(' | ') || 'no hits'));
  } catch { /* report only */ }
}

/** Every page in "Category:Hot Wheels by Series" - 2,200+ themed and premium lines. */
async function seriesCategory() {
  const out = [];
  let cont = null;
  do {
    const j = await api({ action: 'query', list: 'categorymembers', cmtitle: 'Category:Hot Wheels by Series', cmlimit: '500', cmtype: 'page', ...(cont ? { cmcontinue: cont } : {}) });
    out.push(...(j.query?.categorymembers || []).map((m) => m.title));
    cont = j.continue?.cmcontinue || null;
    await sleep(1000);
  } while (cont && out.length < 6000);
  return out;
}

/** The year in a series title: "Forza Horizon Series (2021)" or "2024 Car Culture". */
const titleYear = (t) => {
  const m = /\((\d{4})\)\s*$/.exec(t) || /^(\d{4})\b/.exec(t);
  return m ? Number(m[1]) : 0;
};

/**
 * Premium and themed lines (Car Culture, Boulevard, Forza, Fast & Furious, Pop Culture, RLC and
 * the rest) are absent from the yearly mainline lists. Their pages carry a Body Color column, so
 * they are read directly; pages with no year in the title are index pages, so only their links
 * are followed - that keeps a flood of undated rows out of the dataset.
 */
async function crawlSeriesPages(failed) {
  const rows = []; const castings = new Set();
  let titles = [];
  try { titles = await seriesCategory(); } catch (e) { failed.push(`series category: ${e.message}`); }
  for (const t of EXTRA) if (!titles.includes(t)) titles.push(t);
  const dated = titles.filter((t) => { const y = titleYear(t); return y >= CAST_FROM && y <= TO; });
  const undated = titles.filter((t) => !titleYear(t));
  console.log(`Series category: ${titles.length} pages - ${dated.length} dated from ${CAST_FROM}, ${undated.length} undated index pages`);
  const queue = new Map(dated.map((t) => [t, titleYear(t)]));
  const seenIdx = new Set();

  const readPage = async (page, year, harvestYearLinks) => {
    const j = await api({ action: 'parse', page, prop: 'text', disableeditsection: '1', redirects: '1' });
    const html = j.parse?.text || '';
    if (year) rows.push(...parsePremiumPage(html, year, j.parse?.title || page));
    for (const l of castingLinks(html)) {
      const ly = titleYear(l);
      if (!ly) { castings.add(l); continue; }
      if (harvestYearLinks && ly >= CAST_FROM && ly <= TO && !queue.has(l)) queue.set(l, ly);
    }
    await sleep(1000);
  };

  // index pages first: they add the dated pages the category may not list directly
  if (undated.length) {
    const bar = progress('Series index pages', undated.length);
    for (const page of undated) {
      if (seenIdx.has(page)) { bar.tick('dup'); continue; }
      seenIdx.add(page);
      try { await readPage(page, 0, true); bar.tick(page.slice(0, 26)); }
      catch (e) { failed.push(`index ${page}: ${e.message}`); bar.tick('FAILED'); }
    }
    bar.done();
  }

  const list = [...queue.entries()];
  if (list.length) {
    const bar = progress('Themed & premium series', list.length);
    for (const [page, y] of list) {
      const before = rows.length;
      try { await readPage(page, y, false); bar.tick(`${page.slice(0, 22)}: ${rows.length - before}`); }
      catch (e) { failed.push(`series ${page}: ${e.message}`); bar.tick('FAILED'); }
    }
    bar.done();
  }
  console.log(`Themed & premium: ${rows.length} rows from ${list.length} year pages, ${castings.size} casting pages found`);
  return { rows, castings };
}

/** Phase 2: read every casting page linked from the lists in range, plus the extra collection pages. */
async function crawlCastings(listHtml, failed, extraCastings = []) {
  const titles = new Set(extraCastings);
  for (const html of listHtml) for (const x of castingLinks(html)) titles.add(x);
  for (const page of EXTRA) {
    try {
      const j = await api({ action: 'parse', page, prop: 'text', disableeditsection: '1', redirects: '1' });
      const found = castingLinks(j.parse?.text || '');
      found.forEach((x) => titles.add(x));
      console.log(`Collection page "${page}": ${found.length} castings`);
    } catch (e) { failed.push(`index ${page}: ${e.message}`); }
    await sleep(1000);
  }
  const list = [...titles].sort();
  if (!list.length) { console.log('No casting pages found - skipping phase 2.'); return []; }
  console.log(`Phase 2: ${list.length} casting pages (from ${CAST_FROM} onwards), about ${Math.ceil(list.length / 60)} min at 1 req/s`);
  const bar = progress('Phase 2/2 - casting pages', list.length);
  const out = []; let empty = 0;
  for (const title of list) {
    try {
      const j = await api({ action: 'parse', page: title, prop: 'text', disableeditsection: '1', redirects: '1' });
      const got = parseVersions(j.parse?.text || '', j.parse?.title || title);
      if (!got.length) empty++;
      out.push(...got);
      bar.tick(`${title.slice(0, 26)}: ${got.length}`);
    } catch (e) { failed.push(`casting ${title}: ${e.message}`); bar.tick('FAILED'); }
    await sleep(1000);
  }
  bar.done();
  console.log(`Phase 2: ${out.length} variants, ${empty} pages without a versions table`);
  return out;
}

async function main() {
  console.log(`Output: ${OUT}`);
  const prev = readRows(OUT);
  const pages = await findPages();
  try { await discoverOtherLists(); } catch (e) { console.log('discovery skipped:', e.message); }
  if (!pages.length) throw new Error('No "List of YYYY Hot Wheels" pages found - wiki layout changed?');
  console.log(`Found ${pages.length} yearly pages`);
  const bar = progress('Phase 1/2 - yearly lists', pages.length);
  const rows = []; const failed = []; const listHtml = [];
  for (const [y, title] of pages) {
    try {
      const j = await api({ action: 'parse', page: title, prop: 'text', disableeditsection: '1', redirects: '1' });
      const html = j.parse?.text || '';
      const got = parsePage(html, y);
      rows.push(...got);
      if (y >= CAST_FROM) listHtml.push(html);
      bar.tick(`${y}: ${got.length} rows`);
    } catch (e) { failed.push(`${y}: ${e.message}`); bar.tick(`${y}: FAILED`); }
    await sleep(1000);
  }
  bar.done();

  const series = NO_CAST ? { rows: [], castings: new Set() } : await crawlSeriesPages(failed);
  rows.push(...series.rows);
  const castRows = NO_CAST ? [] : await crawlCastings(listHtml, failed, [...series.castings]);
  const merged = mergeRows(rows, castRows);
  console.log(`Rows: ${rows.length} from lists and themed lines + ${castRows.length} from casting pages -> ${merged.length} after merging`);
  // ---- health check: fail rather than publish broken data ----
  const realPrev = prev.manifest && !prev.manifest.seed ? prev.rows.length : 0;
  const problems = [];
  if (merged.length < 500) problems.push(`only ${merged.length} rows parsed (expected thousands)`);
  if (failed.length > pages.length * 0.1 + 40) problems.push(`${failed.length} pages failed: ${failed.slice(0, 5).join('; ')}`);
  if (realPrev && merged.length < realPrev * MIN_KEEP) problems.push(`rows dropped from ${realPrev} to ${merged.length} (<${MIN_KEEP * 100}%)`);
  const noName = merged.filter((r) => !r[1]).length;
  if (noName) problems.push(`${noName} rows without a name`);
  if (problems.length) { console.error('HEALTH CHECK FAILED - keeping existing data:\n - ' + problems.join('\n - ')); process.exit(2); }
  const withCol = merged.filter((r) => String(r[3] || '').trim()).length;
  console.log(`Colour filled in ${withCol}/${merged.length} rows (${Math.round((withCol / merged.length) * 100)}%)`);
  if (process.argv.includes('--dry')) { console.log(`dry run ok: ${merged.length} rows`); return; }
  const { manifest, changed } = writeDataset(OUT, merged, {
    name: 'Hot Wheels Wiki (Fandom)', url: 'https://hotwheels.fandom.com/', license: 'CC BY-SA 3.0 (verify on the wiki)', licenseUrl: 'https://www.fandom.com/licensing',
  });
  console.log(changed ? `Dataset v${manifest.version}: ${manifest.total} rows in ${manifest.shards.length} shards` : 'No changes.');
  if (failed.length) console.log('Warnings:', failed.join('; '));
}
main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
