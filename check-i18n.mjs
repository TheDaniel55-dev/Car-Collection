import fs from 'fs'; import path from 'path';
const en = JSON.parse(fs.readFileSync('src/locales/en.json')), ro = JSON.parse(fs.readFileSync('src/locales/ro.json'));
const files = []; (function w(d){ for (const f of fs.readdirSync(d,{withFileTypes:true})) f.isDirectory()?w(path.join(d,f.name)):/\.js$/.test(f.name)&&files.push(path.join(d,f.name)); })('src');
const used = new Set(), prefixes = new Set();
for (const f of files) { const s = fs.readFileSync(f,'utf8');
  for (const m of s.matchAll(/\bt[l]?\(\s*'([^']+)'/g)) (m[1].endsWith('.')?prefixes:used).add(m[1]); }
let bad = 0;
for (const k of used) for (const [n,d] of [['en',en],['ro',ro]]) if (!(k in d)) { console.log('MISSING', n, k); bad++; }
for (const k of Object.keys(en)) if (!(k in ro)) { console.log('RO missing', k); bad++; }
for (const k of Object.keys(ro)) if (!(k in en)) { console.log('EN missing', k); bad++; }
for (const p of prefixes) if (!Object.keys(en).some((k)=>k.startsWith(p))) { console.log('NO KEYS for prefix', p); bad++; }
// placeholders must match between languages
for (const k of Object.keys(en)) { const ph = (s)=>[...s.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort().join(); if (ro[k] && ph(en[k])!==ph(ro[k])) { console.log('PLACEHOLDER mismatch', k); bad++; } }
console.log(bad ? `FAIL (${bad})` : `i18n OK: ${used.size} static keys, ${prefixes.size} dynamic prefixes, ${Object.keys(en).length} entries`);
process.exit(bad?1:0);
