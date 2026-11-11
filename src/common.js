// Shared render helpers for views and sheets.
import { esc } from '../shared/text.js';
import { PALETTE, FAMILIES } from '../shared/colors.js';
import { t } from './i18n.js';
import { rarityBreakdown, TIER_COLORS } from './rarity.js';

export const cname = (cf) => (cf ? t(`col.${cf}`) : '—');

export function dot(cf, size = '') {
  const bg = cf && PALETTE[cf] ? PALETTE[cf] : 'transparent';
  return `<span class="dot ${size} ${cf ? '' : 'unk'}" style="background:${bg}" title="${esc(cname(cf))}"></span>`;
}

export function thumb(o) {
  if (o.photo) return `<span class="thumb"><img src="${o.photo}" alt="" loading="lazy"></span>`;
  return `<span class="thumb">${dot(o.snap.cf, 'lg')}</span>`;
}

export function pill(snap) {
  const r = rarityBreakdown(snap);
  return `<span class="chip pill" style="background:${TIER_COLORS[r.tier]}">${r.score} · ${esc(t('tier.' + r.tier))}</span>`;
}

export function palettePicker(sel, act, label, named = false) {
  // named: every colour is a chip with its name (no guessing what a bare circle means).
  if (named) return `<div class="chips wrapc cpick" role="group" aria-label="${esc(label)}">${FAMILIES.map((f) => `<button type="button" class="pl cp ${sel === f ? 'on' : ''}" data-act="${act}" data-v="${f}" aria-pressed="${sel === f}">${dot(f)}<span>${esc(cname(f))}</span></button>`).join('')}</div>`;
  return `<div class="sw" role="group" aria-label="${esc(label)}">${FAMILIES.map((f) => `<button type="button" class="dot lg ${sel === f ? 'on' : ''}" style="background:${PALETTE[f]}" data-act="${act}" data-v="${f}" aria-label="${esc(cname(f))}" aria-pressed="${sel === f}"></button>`).join('')}</div>`;
}

export const field = (id, label, val = '', extra = '') => `<label class="field"><span>${esc(label)}</span><input id="${id}" value="${esc(val)}" ${extra}></label>`;

export const typeLabel = (ty) => t('type.' + (ty || 'm'));
export const brandsOfOwned = (list, brandOf) => {
  const m = new Map();
  for (const o of list) { const b = brandOf(o.snap.name); m.set(b, (m.get(b) || 0) + o.qty); }
  return m;
};
