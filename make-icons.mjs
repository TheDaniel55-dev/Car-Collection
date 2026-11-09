import sharp from 'sharp'; import fs from 'node:fs';
const svg = fs.readFileSync('public/icons/icon.svg');
const mk = (size, out, pad = 0) => sharp(svg, { density: 300 }).resize(size - pad * 2, size - pad * 2).extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#e8400f' }).png().toFile(out);
await Promise.all([mk(180, 'public/icons/apple-touch-icon.png'), mk(192, 'public/icons/icon-192.png'), mk(512, 'public/icons/icon-512.png'), mk(512, 'public/icons/icon-maskable-512.png', 64)]);
console.log('icons ok');
