// Logic tests: loaded through Vite's SSR loader so the same ES modules/JSON imports as the app work.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const L = (p) => server.ssrLoadModule(p);
let n = 0; const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; });

const { castKey, codeKey, levenshtein } = await L('/shared/text.js');
const { colorFamily } = await L('/shared/colors.js');
const { classifyType } = await L('/shared/classify.js');
const { rarityBreakdown, tierOf } = await L('/src/rarity.js');
const { encryptJSON, decryptJSON } = await L('/src/crypto.js');
const cat = (await L('/src/catalogue.js'));
const S = await L('/src/search.js');
const T = await L('/shared/text.js');
const St = await L('/src/store.js');

console.log('text / colours / types');
await ok('castKey ignores spaces/case/accents', () => assert.equal(castKey("'20 Toyota GR Supra"), castKey("'20  toyota gr SUPRA")));
await ok('codeKey normalises', () => assert.equal(codeKey('grx-20 '), 'GRX20'));
await ok('levenshtein', () => assert.equal(levenshtein('GRX20', 'GRX2O', 2), 1));
await ok('colour families', () => { assert.equal(colorFamily('Spectraflame Blue'), 'blue'); assert.equal(colorFamily('Matte Black'), 'black'); });
await ok('classifyType', () => { assert.equal(classifyType('Super Treasure Hunt'), 'sth'); assert.equal(classifyType('HW Exotics'), 'm'); assert.equal(classifyType('Treasure Hunts'), 'th'); });

console.log('rarity');
await ok('tiers monotonic', () => { const s = ['m', 'p', 'th', 'sth'].map((ty) => rarityBreakdown({ ty, y: 2024, key: 'x', cf: 'red' }).score); for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1], s.join()); });
await ok('score within 1..100', () => { for (const ty of ['m', 'ex', 'p', 'th', 'cv', 'rlc', 'sth', 'er']) { const r = rarityBreakdown({ ty, y: 1969, key: 'z', cf: 'red', ser: 'x' }); assert.ok(r.score >= 1 && r.score <= 100, ty + r.score); assert.ok(tierOf(r.score) >= 0 && tierOf(r.score) <= 4); } });

console.log('crypto');
await ok('AES-GCM roundtrip + wrong password fails', async () => {
  const env = await encryptJSON({ a: 1, s: 'ăâîșț' }, 'secret-pass', 1000);
  assert.deepEqual(await decryptJSON(env, 'secret-pass'), { a: 1, s: 'ăâîșț' });
  await assert.rejects(() => decryptJSON(env, 'wrong'));
  assert.ok(!JSON.stringify(env).includes('ăâîșț'));
});

console.log('catalogue + duplicate verdicts');
const rows = [
  ['1', "'20 Toyota GR Supra", 'HLA01', 'Red', 'HW Turbo', 2020, 'm', '1/250', 'GRX20', '', '', 2020],
  ['2', "'20 Toyota GR Supra", 'HLA02', 'Blue', 'HW Dream Garage', 2021, 'm', '2/250', 'GRX20', '', '', 2020],
  ['3', 'Porsche 934 Turbo RSR', 'HLH72', 'Black', 'Neon Speeders', 2022, 'm', '6/8', '', '', '', 1976],
].map(cat.rowToVariant);
cat.indexCatalogue(rows);
const mk = (v, over = {}) => ({ id: 'o' + Math.random(), vid: v?.id || null, qty: 1, prod: '', snap: { key: v.k, name: v.name, cf: v.cf, ser: v.ser, ...over } });
await ok('green when not owned', () => { S.indexOwned([]); assert.equal(S.verdict(rows[0].k).level, 'green'); });
S.indexOwned([mk(rows[0])]);
await ok('red for the exact variant in the same colour', () => assert.equal(S.verdict(rows[0].k, { vid: rows[0].id, cf: 'red' }).reason, 'variant'));
await ok('same catalogue variant in another colour is NOT a duplicate', () => { const v = S.verdict(rows[0].k, { vid: rows[0].id, cf: 'black' }); assert.equal(v.level, 'amber'); assert.equal(v.reason, 'otherColour'); });
await ok('catalogue variant without a chosen colour cannot be called identical', () => assert.equal(S.verdict(rows[0].k, { vid: rows[0].id }).level, 'amber'));
await ok('one catalogue row owned in 3 colours (black, maroon, blue)', () => {
  const ferrari = cat.rowToVariant(['9', 'Ferrari SF90 Stradale', 'HYW34', '', 'Factory Fresh', 2025, 'm', '191', '', '', '', 2025]);
  cat.indexCatalogue([...rows, ferrari]);
  S.indexOwned(['black', 'maroon', 'blue'].map((cf) => ({ id: 'f' + cf, vid: ferrari.id, qty: 1, prod: '', snap: { key: ferrari.k, name: ferrari.name, cf, ser: ferrari.ser } })));
  for (const cf of ['black', 'maroon', 'blue']) assert.equal(S.verdict(ferrari.k, { vid: ferrari.id, cf }).reason, 'variant', cf);
  const red = S.verdict(ferrari.k, { vid: ferrari.id, cf: 'red' });
  assert.equal(red.level, 'amber'); assert.equal(red.reason, 'otherColour');
  cat.indexCatalogue(rows); S.indexOwned([mk(rows[0])]);
});
await ok('amber for same model, other colour', () => { const v = S.verdict(rows[0].k, { cf: 'blue', ser: 'HW Dream Garage' }); assert.equal(v.level, 'amber'); assert.equal(v.reason, 'otherColour'); });
await ok('red for identical colour+series', () => assert.equal(S.verdict(rows[0].k, { cf: 'red', ser: 'HW Turbo' }).reason, 'identical'));
await ok('model mode makes other colours a duplicate', () => assert.equal(S.verdict(rows[0].k, { cf: 'blue', mode: 'model' }).level, 'red'));
await ok('code lookup (base code)', () => assert.ok(S.castingsForCode('grx20').length >= 1));
await ok('search by name', () => assert.ok(S.searchCastings('supra').some((c) => /Supra/.test(c.name))));
await ok('manual (offline) car is searchable and verdicts work', () => {
  const manual = { id: 'm1', vid: null, qty: 1, prod: '', snap: { key: castKey('Custom Casting X'), name: 'Custom Casting X', cf: 'green', ser: '', base: 'ZZZ99' } };
  S.indexOwned([manual]);
  assert.ok(S.searchCastings('custom casting').length === 1);
  assert.equal(S.castingsForCode('ZZZ99').length, 1);
  assert.equal(S.verdict(manual.snap.key, { cf: 'green' }).level, 'red');
});
await ok('hand-added car is found again by its card (toy) code, e.g. a Premium HNT17', () => {
  const manual = { id: 'm2', vid: null, qty: 1, prod: '', snap: { key: castKey('Bugatti Veyron'), name: 'Bugatti Veyron', cf: 'black', ser: '', base: '', toy: 'HNT17' } };
  S.indexOwned([manual]);
  assert.ok(S.castingsForCode('hnt-17').includes(manual.snap.key), 'toy code lookup');
  assert.ok(S.searchCastings('HNT17').some((c) => c.key === manual.snap.key), 'search by toy code');
  assert.equal(S.verdict(manual.snap.key, { cf: 'black' }).level, 'red');
  assert.equal(S.verdict(manual.snap.key, { cf: 'blue' }).level, 'amber');
});
await ok('OCR text parsing finds a base code', () => { const r = S.parseOcrText('MATTEL 2019 GRX2O MALAYSIA U48N'); assert.ok(JSON.stringify(r).toUpperCase().includes('GRX20'), JSON.stringify(r)); });

console.log('"(2nd Color)" is the same model');
await ok('splitAlt / castKey fold second paints into the base model', () => {
  const { splitAlt } = T;
  assert.deepEqual(splitAlt('Bugatti Veyron (2nd Color)'), { name: 'Bugatti Veyron', alt: '2nd Color' });
  assert.equal(splitAlt("'17 Pagani Huayra Roadster (2nd Color - Zamac)").name, "'17 Pagani Huayra Roadster");
  assert.equal(castKey('Bugatti Veyron (3rd color)'), castKey('Bugatti Veyron'));
  assert.equal(splitAlt('Nissan Skyline GT-R (R34)').alt, '', 'real model names in brackets stay');
  assert.notEqual(castKey('Nissan Skyline GT-R (R34)'), castKey('Nissan Skyline GT-R (R32)'));
});
await ok('catalogue rows with (2nd Color) become variants of one casting', () => {
  const a = cat.rowToVariant(['a1', 'Bugatti Veyron', 'K7685', '', 'Mystery Car', 2007, 'm', '170', '', '', '', '']);
  const b = cat.rowToVariant(['a2', 'Bugatti Veyron (2nd Color)', 'K7685', '', 'Mystery Car', 2007, 'm', '170', '', '', '', '']);
  assert.equal(a.k, b.k); assert.equal(b.name, 'Bugatti Veyron'); assert.equal(b.cn, '2nd Color');
  cat.indexCatalogue([a, b]);
  assert.equal(S.variantsOf(a.k).length, 2); assert.equal(cat.cat?.castings?.size ?? cat.cat.castings.size, 1);
  // a row stored by an older version (name still has the suffix, old key) is folded on load too
  cat.indexCatalogue([{ ...a }, { ...b, name: 'Bugatti Veyron (2nd Color)', k: 'bugattiveyron2ndcolor', cn: undefined }]);
  assert.equal(cat.cat.castings.size, 1);
  cat.indexCatalogue(rows);
});
await ok('migration folds saved cars and wishlist entries, and is a no-op the second time', async () => {
  const old = { id: 'o1', pid: 'p', vid: null, qty: 1, prod: '', snap: { name: 'Bugatti Veyron (2nd Color)', key: 'bugattiveyron2ndcolor', cf: 'blue', base: 'ZZV01' } };
  const keep = { id: 'o2', pid: 'p', vid: null, qty: 1, prod: '', snap: { name: 'Bugatti Veyron', key: castKey('Bugatti Veyron'), cf: 'black' } };
  const prof = { id: 'p', wish: [{ key: 'bugattiveyron2ndcolor', name: 'Bugatti Veyron (2nd Color)', cf: 'red' }] };
  const n1 = await St.migrateAlt([old, keep], prof);
  assert.ok(n1 >= 2, 'migrated ' + n1);
  assert.equal(old.snap.name, 'Bugatti Veyron'); assert.equal(old.snap.key, keep.snap.key); assert.equal(old.snap.alt, '2nd Color');
  assert.equal(prof.wish[0].key, keep.snap.key); assert.equal(prof.wish[0].name, 'Bugatti Veyron');
  assert.equal(await St.migrateAlt([old, keep], prof), 0);
  S.indexOwned([old, keep]);
  assert.equal(S.verdict(keep.snap.key, { cf: 'blue' }).level, 'red', 'blue Veyron is now recognised as owned');
  assert.equal(S.verdict(keep.snap.key, { cf: 'red' }).level, 'amber');
});

await server.close();
console.log(process.exitCode ? 'FAILED' : `all ${n} logic tests passed`);
