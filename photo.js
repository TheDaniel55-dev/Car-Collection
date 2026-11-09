// Photo resize (client side) + dominant colour of the car.
import { PALETTE } from '../shared/colors.js';

export const QUALITY = { low: [320, 0.6], medium: [480, 0.72], high: [800, 0.82] };

const pal = Object.entries(PALETTE).map(([n, h]) => [n, parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

export function dominantColor(data) {
  const score = {};
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    let best = null, bd = 1e9;
    for (const p of pal) { const dd = (r - p[1]) ** 2 + (g - p[2]) ** 2 + (b - p[3]) ** 2; if (dd < bd) { bd = dd; best = p[0]; } }
    score[best] = (score[best] || 0) + 0.2 + sat * 2;
  }
  const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '';
}

export function readPhoto(file, level = 'medium') {
  const [max, q] = QUALITY[level] || QUALITY.medium;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const w = Math.max(1, Math.floor(cv.width * 0.6)), h = Math.max(1, Math.floor(cv.height * 0.6));
      const px = ctx.getImageData(Math.floor(cv.width * 0.2), Math.floor(cv.height * 0.2), w, h).data;
      const out = { url: cv.toDataURL('image/jpeg', q), cf: dominantColor(px), canvas: cv };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
