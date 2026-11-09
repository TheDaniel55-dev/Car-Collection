// After vite build: copy data + OCR assets into dist, generate the service worker with precache lists.
import fs from 'node:fs'; import path from 'node:path';
const DIST = 'dist';
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name)).split(path.sep).join('/')]);

// data
const man = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
cp('data/manifest.json', `${DIST}/data/manifest.json`);
for (const s of man.shards) cp(`data/${s.file}`, `${DIST}/data/${s.file}`);
// OCR (self-hosted, works offline)
const need = [
  ['node_modules/tesseract.js/dist/tesseract.min.js', 'ocr/tesseract.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'ocr/core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'ocr/core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'ocr/lang/eng.traineddata.gz'],
];
for (const [f, t] of need) { if (!fs.existsSync(f)) throw new Error('missing OCR asset ' + f); cp(f, `${DIST}/${t}`); }
fs.writeFileSync(`${DIST}/.nojekyll`, '');

const version = fs.readFileSync(`${DIST}/index.html`, 'utf8').length + '-' + man.version + '-' + Date.now().toString(36);
const all = walk(DIST);
const shell = ['./', ...all.filter((f) => !f.endsWith('.woff') && !f.startsWith('data/') && !f.startsWith('ocr/') && f !== 'sw.js' && f !== '.nojekyll')];
const data = ['data/manifest.json', ...man.shards.map((s) => `data/${s.file}?h=${s.hash}`)];
const tpl = fs.readFileSync('scripts/sw.template.js', 'utf8')
  .replace(/__VERSION__/g, version).replace('__SHELL__', JSON.stringify(shell)).replace('__DATA__', JSON.stringify(data)).replace('__OCR__', JSON.stringify(all.filter((f) => f.startsWith('ocr/'))));
fs.writeFileSync(`${DIST}/sw.js`, tpl);
const size = all.reduce((a, f) => a + fs.statSync(`${DIST}/${f}`).size, 0);
console.log(`postbuild ok: ${all.length} files, ${(size / 1048576).toFixed(1)} MB, sw ${version}`);
