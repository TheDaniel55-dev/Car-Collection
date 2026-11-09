// Shared helpers for the data pipeline: progress bar, hashing, shard writing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FIELDS = ['id', 'name', 'toy', 'col', 'ser', 'y', 'ty', 'num', 'base', 'tp', 'wh', 'cy'];

export function progress(label, total) {
  const t0 = Date.now(); let n = 0;
  const draw = (note = '') => {
    const pct = total ? Math.round((n / total) * 100) : 0;
    const el = (Date.now() - t0) / 1000;
    const eta = n ? Math.round((el / n) * (total - n)) : '?';
    const bar = '#'.repeat(Math.round(pct / 5)).padEnd(20, '.');
    process.stdout.write(`\r[${bar}] ${label} step ${n}/${total} (${pct}%) elapsed ${Math.round(el)}s ETA ${eta}s ${note}`.padEnd(110));
  };
  draw();
  return { tick(note) { n++; draw(note); }, done() { n = total; draw('done'); process.stdout.write('\n'); } };
}

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Group variant rows by release year and write data/y{YYYY}.json + manifest.json (only if content changed). */
export function writeDataset(dir, rows, source, { seed = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const byYear = new Map();
  for (const r of rows) { const y = Number(r[5]) || 0; (byYear.get(y) || byYear.set(y, []).get(y)).push(r); }
  const shards = [];
  for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
    const list = byYear.get(y).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const body = JSON.stringify({ y, rows: list });
    const file = `y${y}.json`;
    fs.writeFileSync(path.join(dir, file), body);
    shards.push({ y, file, hash: sha(body), size: Buffer.byteLength(body), n: list.length });
  }
  for (const f of fs.readdirSync(dir)) if (/^y\d+\.json$/.test(f) && !shards.some((s) => s.file === f)) fs.unlinkSync(path.join(dir, f));
  const mpath = path.join(dir, 'manifest.json');
  let prev = null; try { prev = JSON.parse(fs.readFileSync(mpath, 'utf8')); } catch {}
  const same = prev && JSON.stringify(prev.shards) === JSON.stringify(shards) && !!prev.seed === seed;
  const total = rows.length;
  const manifest = same ? prev : { version: (prev?.version || 0) + 1, built: new Date().toISOString(), total, shards, source, seed };
  fs.writeFileSync(mpath, JSON.stringify(manifest, null, 1));
  return { manifest, changed: !same };
}

export function readRows(dir) {
  const out = []; let m;
  try { m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { return { rows: out, manifest: null }; }
  for (const s of m.shards) out.push(...JSON.parse(fs.readFileSync(path.join(dir, s.file), 'utf8')).rows);
  return { rows: out, manifest: m };
}
