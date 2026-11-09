import assert from 'node:assert/strict';
import { parsePage } from '../parse.mjs';
const html = `<h2>Mainline</h2><h3>HW Exotics</h3>
<table><tr><th>Col. #</th><th>Toy #</th><th>Name</th><th>Color</th><th>Series</th><th>Base Code</th></tr>
<tr><td>2/250</td><td>HLH72</td><td>Lamborghini Centenario</td><td>Yellow</td><td rowspan="2">HW Exotics</td><td>GRX20</td></tr>
<tr><td>3/250</td><td>HLH73</td><td>Audi R8[1]</td><td>Black</td><td>GHB28</td></tr></table>
<h3>Other</h3><table><tr><th>Foo</th><th>Bar</th></tr><tr><td>1</td><td>2</td></tr></table>`;
const rows = parsePage(html, 2024);
assert.equal(rows.length, 2);
assert.equal(rows[0][1], 'Lamborghini Centenario'); assert.equal(rows[0][4], 'HW Exotics');
assert.equal(rows[1][4], 'HW Exotics', 'rowspan expanded'); assert.equal(rows[1][1], 'Audi R8', 'footnote removed');
assert.equal(rows[1][8], 'GHB28'); assert.equal(rows[0][5], 2024);
console.log('parser fixture OK (synthetic - NOT validated against the live wiki)');
