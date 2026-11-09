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
await ok('red for the exact variant', () => assert.equal(S.verdict(rows[0].k, { vid: rows[0].id }).reason, 'variant'));
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
await ok('OCR text parsing finds a base code', () => { const r = S.parseOcrText('MATTEL 2019 GRX2O MALAYSIA U48N'); assert.ok(JSON.stringify(r).toUpperCase().includes('GRX20'), JSON.stringify(r)); });

await server.close();
console.log(process.exitCode ? 'FAILED' : `all ${n} logic tests passed`);
