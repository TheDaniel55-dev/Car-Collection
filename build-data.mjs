// Builds data/ from the Hot Wheels Fandom wiki (MediaWiki API). Polite: 1 request/second, descriptive User-Agent.
// Usage: node data-pipeline/build-data.mjs [--from 1968] [--to 2026] [--out data] [--dry]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePage } from './parse.mjs';
import { progress, sleep, writeDataset, readRows } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', fileURLToPath(new URL('../data', import.meta.url))));
const FROM = Number(arg('from', 1968)); const TO = Number(arg('to', new Date().getFullYear() + 1));
const API = 'https://hotwheels.fandom.com/api.php';
const UA = 'car-collection-data-bot/1.0 (+https://github.com/; open-source hobby project, polite 1 req/s)';
const MIN_KEEP = 0.7; // refuse to publish if fewer than 70% of the previous rows come back

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
  return [...pages.entries()].sort((a, b) => a[0] - b[0]);
}

async function main() {
  console.log(`Output: ${OUT}`);
  const prev = readRows(OUT);
  const pages = await findPages();
  if (!pages.length) throw new Error('No "List of YYYY Hot Wheels" pages found - wiki layout changed?');
  console.log(`Found ${pages.length} yearly pages`);
  const bar = progress('Downloading years', pages.length);
  const rows = []; const failed = [];
  for (const [y, title] of pages) {
    try {
      const j = await api({ action: 'parse', page: title, prop: 'text', disableeditsection: '1', redirects: '1' });
      const got = parsePage(j.parse?.text || '', y);
      rows.push(...got);
      bar.tick(`${y}: ${got.length} rows`);
    } catch (e) { failed.push(`${y}: ${e.message}`); bar.tick(`${y}: FAILED`); }
    await sleep(1000);
  }
  bar.done();
  // ---- health check: fail rather than publish broken data ----
  const realPrev = prev.manifest && !prev.manifest.seed ? prev.rows.length : 0;
  const problems = [];
  if (rows.length < 500) problems.push(`only ${rows.length} rows parsed (expected thousands)`);
  if (failed.length > pages.length * 0.1) problems.push(`${failed.length} pages failed: ${failed.slice(0, 5).join('; ')}`);
  if (realPrev && rows.length < realPrev * MIN_KEEP) problems.push(`rows dropped from ${realPrev} to ${rows.length} (<${MIN_KEEP * 100}%)`);
  const noName = rows.filter((r) => !r[1]).length;
  if (noName) problems.push(`${noName} rows without a name`);
  if (problems.length) { console.error('HEALTH CHECK FAILED - keeping existing data:\n - ' + problems.join('\n - ')); process.exit(2); }
  if (process.argv.includes('--dry')) { console.log(`dry run ok: ${rows.length} rows`); return; }
  const { manifest, changed } = writeDataset(OUT, rows, {
    name: 'Hot Wheels Wiki (Fandom)', url: 'https://hotwheels.fandom.com/', license: 'CC BY-SA 3.0 (verify on the wiki)', licenseUrl: 'https://www.fandom.com/licensing',
  });
  console.log(changed ? `Dataset v${manifest.version}: ${manifest.total} rows in ${manifest.shards.length} shards` : 'No changes.');
  if (failed.length) console.log('Warnings:', failed.join('; '));
}
main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
