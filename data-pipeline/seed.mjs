// Starter dataset: ONLY real examples from the owner's collection. Unknown fields are left empty on purpose.
import { writeDataset } from './lib.mjs';
const R = (id, name, toy, col, ser, y, ty, num, base, tp, wh, cy) => [id, name, toy, col, ser, y, ty, num, base, tp, wh, cy];
const rows = [
  R('seed-grx20', "'20 Toyota GR Supra", '', '', '', '', 'm', '', 'GRX20', '', '', 2020),
  R('seed-ghb28', '2019 Audi R8 Spyder', '', '', '', '', 'm', '', 'GHB28', '', '', 2019),
  R('seed-dhp00', 'Porsche 911 GT3 RS', '', '', '', '', 'm', '', 'DHP00', '', '', 2016),
  R('seed-cent', 'Lamborghini Centenario Roadster', '', '', 'HW Exotics', '', 'm', '2/250', '', '', '', ''),
  R('seed-m1', 'BMW M1', 'GRT01', '', 'Silver Series BMW', '', 'p', '1/5', '', '', '', ''),
  R('seed-934', 'Porsche 934 Turbo RSR', 'HLH72', '', 'Neon Speeders', '', 'm', '6/8', '', '', '', ''),
];
const { manifest } = writeDataset(new URL('../data', import.meta.url).pathname,
  rows, { name: 'Starter examples', url: '', license: '', licenseUrl: '' }, { seed: true });
console.log('seed written, version', manifest.version, 'rows', rows.length);
