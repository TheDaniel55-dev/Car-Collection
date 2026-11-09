// Small UI toolkit: sheets, toast, confetti, FLIP animation, haptics.
import { esc } from '../shared/text.js';
import { t } from './i18n.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

let toastTimer;
export function toast(msg, ms = 2400) {
  const e = $('#toast');
  e.textContent = msg; e.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('on'), ms);
}

/** Toast with an action button (e.g. "Update available"). */
export function toastAction(msg, label, fn) {
  const e = $('#toast');
  e.innerHTML = `<span>${esc(msg)}</span> <button class="tbtn" type="button">${esc(label)}</button>`;
  e.classList.add('on');
  $('button', e).onclick = fn;
}

export function confetti() {
  if (reduceMotion()) return;
  const cols = ['#e5393b', '#2f6bff', '#ffc400', '#2fb457', '#ff8a1c', '#8a4dff'];
  for (let i = 0; i < 44; i++) {
    const e = document.createElement('i');
    e.className = 'cf';
    e.style.cssText = `left:${Math.random() * 100}vw;background:${cols[i % cols.length]};animation-delay:${Math.random() * 0.4}s`;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 2600);
  }
}

/* ---------- bottom sheets (stack-aware, drag to dismiss) ---------- */
const stack = [];
let lastFocus = null;

export function openSheet(html, { onClose, cls = '' } = {}) {
  const root = $('#sheets');
  lastFocus = document.activeElement;
  const el = document.createElement('div');
  el.className = 'sheet-layer';
  el.innerHTML = `<div class="bd" data-act="sheet-close"></div><div class="pn ${cls}" role="dialog" aria-modal="true"><div class="hd" aria-hidden="true"></div><div class="pn-body">${html}</div></div>`;
  root.appendChild(el);
  stack.push({ el, onClose });
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  const pn = $('.pn', el), hd = $('.hd', el);
  let y0 = 0, dy = 0, drag = false;
  hd.addEventListener('pointerdown', (e) => { drag = true; y0 = e.clientY; pn.style.transition = 'none'; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointermove', (e) => { if (!drag) return; dy = Math.max(0, e.clientY - y0); pn.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (!drag) return; drag = false; pn.style.transition = ''; pn.style.transform = ''; if (dy > 90) closeSheet(); dy = 0; };
  hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
  setTimeout(() => $('input:not([type=file]),button.primary', pn)?.focus({ preventScroll: true }), 350);
  return { el, body: $('.pn-body', el), pn };
}

export function sheetBody() { const top = stack[stack.length - 1]; return top ? $('.pn-body', top.el) : null; }
export function setSheet(html) { const b = sheetBody(); if (b) b.innerHTML = html; return b; }
export const sheetOpen = () => stack.length > 0;

export function closeSheet() {
  const top = stack.pop();
  if (!top) return;
  top.el.classList.remove('on');
  setTimeout(() => top.el.remove(), reduceMotion() ? 0 : 420);
  top.onClose?.();
  if (!stack.length) lastFocus?.focus?.({ preventScroll: true });
}
export function closeAllSheets() { while (stack.length) closeSheet(); }

/* ---------- FLIP: make a thumbnail "grow" into the detail hero ---------- */
export function flip(fromEl, toEl) {
  if (!fromEl || !toEl || reduceMotion() || !toEl.animate) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  if (!b.width || !a.width) return;
  const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
  toEl.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,1.1,.3,1)' });
}

/* ---------- small html builders ---------- */
export const chip = (txt, cls = '') => (txt ? `<span class="chip ${cls}">${esc(txt)}</span>` : '');
export const btn = (label, act, cls = '', extra = '') => `<button type="button" class="btn ${cls}" data-act="${act}" ${extra}>${esc(label)}</button>`;
export const closeBtn = () => btn(t('close'), 'sheet-close', 's');

export function ring(p, label) {
  const C = 163.4;
  return `<svg class="ring" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${esc(label)}"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" style="--to:${(C * (1 - p)).toFixed(1)}"/><text x="32" y="37" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">${esc(label)}</text></svg>`;
}
