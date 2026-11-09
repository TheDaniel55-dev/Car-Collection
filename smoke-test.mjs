// Boots the real built bundle inside jsdom + fake-indexeddb and clicks through the main flows.
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

execSync('npx vite build --outDir dist-test --emptyOutDir', { env: { ...process.env, NO_OBFUSCATE: '1' }, stdio: 'pipe' });
const dir = 'dist-test';
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1]), 'utf8');
html = html.replace(/<script type="module"[^>]*><\/script>/, '').replace(/<link rel="modulepreload"[^>]*>/g, '');
const errors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message))); vc.on('error', (...a) => errors.push(a.join(' ')));
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
w.fetch = async (u) => { const p = String(u).replace(/^http:\/\/localhost\//, '').split('?')[0]; const f = path.join('data', p.replace(/^data\//, '')); if (!p.startsWith('data/') || !fs.existsSync(f)) return { ok: false, status: 404 }; const txt = fs.readFileSync(f, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(txt), text: async () => txt }; };
w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
w.addEventListener('error', (e) => errors.push('window error: ' + e.message));
w.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + e.reason));
w.eval(js.replace(/import\.meta\.url/g, '"http://localhost/"').replace(/export\s*\{[^}]*\};?\s*$/m, ''));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => w.document.querySelector(s);
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const fail = (m) => { console.error('SMOKE FAIL:', m, errors.slice(0, 5)); process.exit(1); };
await wait(1500);
if (!$('#view').innerHTML.trim()) fail('empty view after boot');
console.log('boot ok; onboarding sheet open:', !!$('.sheet-layer.on'));
// finish onboarding quickly by skipping steps
for (let i = 0; i < 8 && $('.sheet-layer.on'); i++) { const b = [...w.document.querySelectorAll('.sheet-layer.on button')].find((x) => /Next|Ready|Skip|Mai departe|Gata|Sari/i.test(x.textContent)); if (!b) break; click(b); await wait(100); }
for (const tab of ['chk', 'ser', 'sta', 'set', 'col']) {
  const b = $(`#nav [data-v="${tab}"]`); if (!b) fail('no nav ' + tab); click(b); await wait(150);
  if (!$('#view').innerHTML.trim()) fail('empty view on tab ' + tab);
}
// search the seed through the add sheet
click($('#fab')); await wait(150);
const q = $('#add-q'); if (!q) fail('add sheet has no search input');
q.value = 'GRX20'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(200);
if (!/Supra/i.test($('.sheet-layer.on')?.textContent || '')) fail('seed car GRX20 not found in add search');
console.log('add search finds seed car: ok');
if (errors.length) fail('runtime errors');
fs.rmSync(dir, { recursive: true, force: true });
console.log('SMOKE OK (jsdom; not a real browser)'); process.exit(0);
