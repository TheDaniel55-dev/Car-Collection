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
// a car that is not in the database (e.g. Premium HNT17): explanation + manual route with the code filled in
q.value = 'HNT17'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(200);
if (!$('#add-res .nf')) fail('unknown code shows no "not in the database" card');
click($('#add-res .nf [data-act="add-manual"]')); await wait(150);
if (($('#f-toy')?.value || '') !== 'HNT17') fail('typed code was not carried into the card-code field');
const fname = $('#f-name'); fname.value = 'supra'; fname.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(150);
if (!$('#f-sugg [data-act="f-usename"]')) fail('no known-model suggestion while typing the name');
console.log('not-in-database flow (code kept, model suggestions): ok');
if (!$('#f-ty')) fail('manual add form has no car type selector');
console.log('manual add has type selector: ok');
if (!$('.cpick .cp')) fail('colour picker has no named chips');
if (!/Black|Negru/.test($('.cpick')?.textContent || '')) fail('colour chips have no names');
if (!$('details.more')) fail('add form has no collapsible extra details');
console.log('add form: named colours + folded details: ok');
// shop check shows a rarity score without adding the car
click($('#nav [data-v="chk"]')); await wait(150);
const cq = $('#chk-q'); if (!cq) fail('check tab has no search input');
cq.value = 'GRX20'; cq.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(200);
if (!/Rarity score|Scor de raritate/i.test($('#chk-res')?.textContent || '')) fail('check result has no rarity score');
console.log('shop check shows rarity score: ok');
// wishlist from the check screen
click($('[data-act="wish-add"]')); await wait(200);
click($('#nav [data-v="col"]')); await wait(150);
if (!/Wishlist|Dorințe/i.test($('#view')?.textContent || '')) fail('wishlist card missing on the home page');
console.log('wishlist: ok');
click($('#nav [data-v="chk"]')); await wait(150);
// compare two cars
click($('[data-act="cmp-open"]')); await wait(150);
for (const k of ['a', 'b']) { const i = $('#cmp-q-' + k); if (!i) fail('compare has no input ' + k); i.value = 'supra'; i.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(150); }
if ($('#cmp-table .cmprow') === null) fail('compare table has no rows');
click($('[data-act="cmp-col-a"][data-v="red"]')); click($('[data-act="cmp-col-b"][data-v="blue"]')); await wait(100);
if (!/different colour|culoare diferită/i.test($('#cmp-table')?.textContent || '')) fail('compare does not report different colours');
if (!$('#cmp-res-a .vopt')) fail('compare has no readable version rows');
if (!/\d{4}/.test($('#cmp-res-a .vopt')?.textContent || '')) fail('compare version rows show no year/series text');
console.log('compare version list has text rows: ok');
console.log('compare two cars: ok');
click($('[data-act="cmp-close"]')); await wait(100);
click($('#nav [data-v="set"]')); await wait(150);
if (!$('[data-act="app-update"]') || !$('[data-act="app-clean"]')) fail('settings has no version / update buttons');
if (!/Versiunea aplicației|App version/.test($('#view')?.textContent || '')) fail('settings has no version card');
click($('[data-act="app-update"]')); await wait(150);
if (!($('#ver-msg')?.textContent || '').trim()) fail('update button gives no feedback');
console.log('settings: version card + update buttons: ok');
// hand-added car (code HNT17) shows up in Stats under "added by hand" and is found again by its code
click($('#nav [data-v="col"]')); await wait(150);
click($('#fab')); await wait(200);
{ const aq = $('#add-q'); aq.value = 'HNT17'; aq.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(200); }
click($('#add-res .nf [data-act="add-manual"]')); await wait(150);
{ const fn = $('#f-name'); fn.value = 'Bugatti Veyron'; fn.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(100); }
click($('[data-act="f-col"][data-v="black"]')); click($('[data-act="f-save"]')); await wait(400);
click($('#nav [data-v="sta"]')); await wait(200);
if (!/Added by hand|Adăugate de mine/i.test($('#view')?.textContent || '')) fail('Stats has no "added by hand" list');
if (!$('[data-act="mine-export"]')) fail('no export button for hand-added cars');
click($('#nav [data-v="chk"]')); await wait(150);
{ const c2 = $('#chk-q'); c2.value = 'HNT17'; c2.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(250); }
if (!/Veyron/i.test($('#chk-res')?.textContent || '')) fail('check tab does not find the hand-added car by its card code');
console.log('hand-added car: listed in Stats + found by code in the shop check: ok');
if (errors.length) fail('runtime errors');
fs.rmSync(dir, { recursive: true, force: true });
console.log('SMOKE OK (jsdom; not a real browser)'); process.exit(0);
