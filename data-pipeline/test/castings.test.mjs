// Fixtures copied from the real wiki tables (checked 15 Nov 2026):
// a normal casting page, and an F1 page whose columns differ.
import assert from 'node:assert/strict';
import { parseVersions, castingLinks } from '../castings.mjs';

const normal = `<h2>Versions</h2><table class="wikitable sortable"><tr>
<th>Col #</th><th>Year</th><th>Series</th><th>Color</th><th>Tampo</th><th>Base Color/Type</th><th>Window Color</th><th>Interior Color</th><th>Wheel Type</th><th>Toy #</th><th>Country</th><th>Notes</th><th>Photo</th></tr>
<tr><td>001</td><td>2024</td><td>HW Dream Garage</td><td>Yellow</td><td>Black stripes</td><td>Black/Plastic</td><td>Clear</td><td>Grey</td><td>MC5</td><td>HRY51</td><td>Malaysia</td><td></td><td></td></tr>
<tr><td>001</td><td>2024</td><td>HW Dream Garage</td><td>Blue</td><td></td><td>Black/Plastic</td><td>Clear</td><td>Grey</td><td>MC5</td><td>HTC86</td><td>Thailand</td><td>2nd Color</td><td></td></tr></table>`;

const f1 = `<table class="wikitable sortable"><tr>
<th>Col #</th><th>Year</th><th>Series</th><th>Team/Car #</th><th>Driver Represented</th><th>Color</th><th>Tampo</th><th>Base Color/Type</th><th>Halo Color</th><th>Helmet Color</th><th>Wheel Type</th><th>Toy #</th><th>Country</th><th>Notes</th><th>Photo</th></tr>
<tr><td></td><td>2025</td><td>Formula One Collection</td><td>Oracle Red Bull Racing #1</td><td>Max Verstappen</td><td>Blue</td><td>Red Bull livery</td><td>Black/Metal</td><td>White</td><td>White</td><td>RRPPZ</td><td>JBM12</td><td>Thailand</td><td>Stand code(s): U13A</td><td></td></tr>
<tr><td></td><td>2025</td><td>Formula One Collection</td><td>Oracle Red Bull Racing #11</td><td>Sergio Pérez</td><td>Blue</td><td>Red Bull livery</td><td>Black/Metal</td><td>White</td><td>White</td><td>RRPPZ</td><td>JBM19</td><td>Thailand</td><td>Stand code(s): U15A</td><td></td></tr></table>`;

const F = ['id', 'name', 'toy', 'col', 'ser', 'y', 'ty', 'num', 'base', 'tp', 'wh', 'cy', 'made'];
const o = (r) => Object.fromEntries(F.map((f, i) => [f, r[i]]));

const a = parseVersions(normal, 'Mazda Autozam').map(o);
assert.equal(a.length, 2, 'both colours');
assert.equal(a[0].col, 'Yellow'); assert.equal(a[1].col, 'Blue');
assert.equal(a[0].name, 'Mazda Autozam');
assert.equal(a[0].toy, 'HRY51'); assert.equal(a[0].made, 'Malaysia');
assert.equal(a[0].wh, 'MC5'); assert.equal(a[0].num, '001'); assert.equal(a[0].y, 2024);
assert.equal(a[0].base, '', 'the wiki never carries the casting code stamped under the car');
assert.notEqual(a[0].id, a[1].id, 'ids must differ per variant');

const b = parseVersions(f1, 'Red Bull RB20').map(o);
assert.equal(b.length, 2, 'two drivers, same colour - both must survive');
assert.equal(b[0].col, 'Blue'); assert.equal(b[1].col, 'Blue');
assert.ok(b[0].tp.includes('Max Verstappen'), b[0].tp);
assert.ok(b[1].tp.includes('Sergio Pérez'), b[1].tp);
assert.equal(b[0].toy, 'JBM12'); assert.equal(b[1].toy, 'JBM19');
assert.equal(b[0].ser, 'Formula One Collection');

const links = castingLinks(`<table class="wikitable"><tr><th>Toy #</th><th>Casting Name</th></tr>
<tr><td>JBM09</td><td><a href="/wiki/Alpine_A524">BWT Alpine F1 Team - A524</a></td></tr>
<tr><td>JBM10</td><td><a href="/wiki/Haas_VF-24">Haas</a></td></tr>
<tr><td></td><td><a href="/wiki/File:Pic.jpg">pic</a> <a class="new" href="/wiki/Nope">missing</a> <a href="/wiki/List_of_2024_Hot_Wheels">list</a></td></tr></table>`);
assert.deepEqual(links.sort(), ['Alpine A524', 'Haas VF-24']);

console.log('casting-page fixtures OK (headers copied from the live wiki, 15 Nov 2026)');

// merging: the casting row wins, but keeps the collector number from the list row
{
  const { mergeRows } = await import('../castings.mjs');
  const list = [
    ['2024-hry51-0', 'Mazda Autozam', 'HRY51', '', 'HW Dream Garage', 2024, 'm', '001', '', '', '', ''],
    ['2024-zzz99-1', 'Only In The List', 'ZZZ99', '', 'HW Metro', 2024, 'm', '042', '', '', '', ''],
  ];
  const cast = [['c-mazda-autozam-HRY51', 'Mazda Autozam', 'HRY51', 'Yellow', 'HW Dream Garage', 2024, 'm', '', '', '', 'MC5', 0, 'Malaysia']];
  const out = mergeRows(list, cast);
  assert.equal(out.length, 2, 'one merged + one list-only row');
  assert.equal(out[0][3], 'Yellow', 'colour kept from the casting page');
  assert.equal(out[0][7], '001', 'collector number taken from the list');
  assert.equal(out[1][1], 'Only In The List', 'rows with no casting page are never dropped');
}
console.log('merge OK');
