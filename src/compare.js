// Side-by-side comparison of two cars (Check tab). Details come from the catalogue, from your own collection, or from both.
import { esc, norm } from '../shared/text.js';
import { t } from './i18n.js';
import { cat } from './catalogue.js';
import { own, searchCastings, variantsOf, ownedOf } from './search.js';
import { S, opt } from './store.js';
import { rarityBreakdown, TIER_COLORS } from './rarity.js';
import { palettePicker, cname, typeLabel, dot } from './common.js';
import { acts, ins, chs, hooks } from './registry.js';
import { $, toast } from './ui.js';
import { readPhoto } from './photo.js';

const SIDES = ['a', 'b'];
const blank = () => ({ q: '', cf: '', pick: null, vid: null, own: null, photo: '' });
export const newCmp = () => ({ a: blank(), b: blank() });
S.cmp = S.cmp || newCmp();
S.chkView = S.chkView || 'check';

/** Everything we know about one side of the comparison. */
function sideData(x) {
  if (!x.q.trim()) return null;
  const found = searchCastings(x.q, 5);
  if (!found.length) return { none: true, found };
  const pick = found.find((f) => f.key === x.pick) || found[0];
  const vars = variantsOf(pick.key);
  const mine = ownedOf(pick.key);
  const sel = x.own && mine.find((o) => o.id === x.own);
  const v = !sel && x.vid && cat.byId.get(x.vid);
  let d;
  if (sel) {
    const s = sel.snap;
    d = { name: s.name, base: s.base, toy: s.toy, cf: s.cf, col: s.col, ser: s.ser, y: s.y, cy: s.cy, num: s.num, ty: s.ty, made: s.made, tp: s.tp, wh: s.wh, prod: sel.prod };
  } else if (v) {
    d = { name: v.name, base: v.base || [...pick.bases][0] || '', toy: v.toy, cf: x.cf, col: '', ser: v.ser, y: v.y, cy: v.cy, num: v.num, ty: v.ty, made: '', tp: v.tp, wh: v.wh, prod: '' };
  } else {
    d = { name: pick.name, base: [...pick.bases][0] || '', toy: '', cf: x.cf, col: '', ser: '', y: 0, cy: 0, num: '', ty: '', made: '', tp: '', wh: '', prod: '' };
  }
  const exact = !!(sel || v);
  const r = exact ? rarityBreakdown({ ...d, key: pick.key }) : null;
  return { found, pick, vars, mine, d, exact, r, photo: (sel && sel.photo) || x.photo || '' };
}

const val = (v) => (v === undefined || v === null || v === 0 || v === '' ? '' : String(v));

function rows(A, B) {
  const g = (side, f) => val(side.d[f]);
  const colour = (side) => [side.d.cf ? cname(side.d.cf) : '', side.d.col].filter(Boolean).join(' · ');
  const list = [
    ['f.name', g(A, 'name'), g(B, 'name')],
    ['f.base', g(A, 'base'), g(B, 'base')],
    ['f.toy', g(A, 'toy'), g(B, 'toy')],
    ['f.colour', colour(A), colour(B)],
    ['f.series', g(A, 'ser'), g(B, 'ser')],
    ['f.year', g(A, 'y'), g(B, 'y')],
    ['f.castYear', g(A, 'cy') && `© ${g(A, 'cy')}`, g(B, 'cy') && `© ${g(B, 'cy')}`],
    ['f.num', g(A, 'num'), g(B, 'num')],
    ['type', A.d.ty ? typeLabel(A.d.ty) : '', B.d.ty ? typeLabel(B.d.ty) : ''],
    ['f.made', g(A, 'made'), g(B, 'made')],
    ['cmp.deco', g(A, 'tp'), g(B, 'tp')],
    ['cmp.wheels', g(A, 'wh'), g(B, 'wh')],
  ];
  if (opt('prod')) list.push(['f.prod', g(A, 'prod'), g(B, 'prod')]);
  const score = (s) => (s.r ? `${s.r.score} · ${t('tier.' + s.r.tier)}` : '');
  list.push(['chk.score', score(A), score(B)]);
  list.push(['cmp.versions', String(A.vars.length || ''), String(B.vars.length || '')]);
  const have = (s) => (s.mine.length ? s.mine.map((o) => `${o.snap.col || cname(o.snap.cf)}${o.qty > 1 ? ' ×' + o.qty : ''}`).join(', ') : t('cmp.notOwned'));
  list.push(['cmp.owned', have(A), have(B)]);
  return list.filter(([, a, b]) => a || b);
}

function summary(A, B) {
  if (A.pick.key === B.pick.key) {
    const ca = A.d.cf; const cb = B.d.cf;
    if (ca && cb) return ca === cb ? ['same', 'red'] : ['otherColour', 'amber'];
    return ['sameModel', 'amber'];
  }
  return ['different', 'green'];
}

function sideControls(k) {
  const x = S.cmp[k]; const sd = sideData(x);
  if (!x.q.trim()) return `<p class="mu">${esc(t('cmp.hint'))}</p>`;
  if (!sd || sd.none) return `<p class="mu">${esc(t('cmp.none'))}</p>`;
  const chips = sd.found.length > 1 ? `<div class="chips wrapc">${sd.found.map((f) => `<button type="button" class="pl ${f.key === sd.pick.key ? 'on' : ''}" data-act="cmp-pick" data-side="${k}" data-key="${esc(f.key)}">${esc(f.name)}</button>`).join('')}</div>` : '';
  const mine = sd.mine.length ? `<div class="fieldlab">${esc(t('cmp.mine'))}</div><div class="chips wrapc">${sd.mine.map((o) => `<button type="button" class="pl ${x.own === o.id ? 'on' : ''}" data-act="cmp-own" data-side="${k}" data-id="${esc(o.id)}">${dot(o.snap.cf)} ${esc(o.snap.col || cname(o.snap.cf))}${o.qty > 1 ? ' ×' + o.qty : ''}</button>`).join('')}</div>` : '';
  const vars = sd.vars.length ? `<div class="fieldlab">${esc(t('cmp.pickVariant'))}</div><div class="sw tight">${sd.vars.slice(0, 48).map((v) => `<button type="button" class="dot lg ${x.vid === v.id && !x.own ? 'on' : ''}" style="background:${v.cf ? `var(--c-${v.cf})` : 'transparent'}" data-act="cmp-variant" data-side="${k}" data-id="${esc(v.id)}" title="${esc([v.ser, v.y].filter(Boolean).join(' · '))}" aria-label="${esc([v.ser, v.y].filter(Boolean).join(' · '))}"></button>`).join('')}</div>` : '';
  const photo = `<div class="row wrap"><label class="btn s file">📷 ${esc(t('f.photo'))}<input type="file" accept="image/*" class="vh" data-ch="cmp-photo-${k}"></label>${sd.photo ? `<img class="preview sm" src="${sd.photo}" alt="">` : ''}</div>`;
  return `${chips}${mine}${vars}${photo}<div class="fieldlab">${esc(t('chk.colour'))}</div>${palettePicker(x.cf, 'cmp-col-' + k, t('chk.colour'))}`;
}

function tableHTML() {
  const A = sideData(S.cmp.a); const B = sideData(S.cmp.b);
  if (!A || !B || A.none || B.none) return `<p class="mu">${esc(t('cmp.hint'))}</p>`;
  const [kind, level] = summary(A, B);
  let rar = '';
  if (A.r && B.r) {
    const diff = A.r.score - B.r.score;
    rar = Math.abs(diff) >= 5
      ? `<p class="small">${esc(t('cmp.rarer', { n: diff > 0 ? 'A' : 'B', a: A.r.score, b: B.r.score }))}</p>`
      : `<p class="small">${esc(t('cmp.similarRarity', { a: A.r.score, b: B.r.score }))}</p>`;
  } else rar = `<p class="small">${esc(t('cmp.notExact'))}</p>`;
  const body = rows(A, B).map(([lab, a, b]) => {
    const diff = a && b && norm(a) !== norm(b);
    return `<div class="cmprow ${diff ? 'diff' : ''}"><span class="cl">${esc(t(lab))}</span><span class="cv">${esc(a || '—')}</span><span class="cv">${esc(b || '—')}</span></div>`;
  }).join('');
  return `<div class="vd ${level} cmpsum" role="status"><h2>${esc(t('cmp.' + kind))}</h2>${rar}</div>
  <div class="cmphead"><span></span>${[['A', A], ['B', B]].map(([l, sd]) => `<span><b>${l}</b>${sd.photo ? `<img class="cmpimg" src="${sd.photo}" alt="">` : ''}</span>`).join('')}</div>${body}
  <p class="mu">${esc(t('cmp.diffNote'))}</p>`;
}

export function cmpHTML() {
  const side = (k) => `<div class="card cmpside"><b>${esc(t('cmp.' + k))}</b>
    <input id="cmp-q-${k}" class="search" data-in="cmp-q-${k}" placeholder="${esc(t('cmp.ph'))}" value="${esc(S.cmp[k].q)}" autocomplete="off" autocapitalize="characters" enterkeyhint="search" aria-label="${esc(t('cmp.' + k))}">
    <div id="cmp-res-${k}">${sideControls(k)}</div></div>`;
  return `<header class="hdr"><h1>${esc(t('cmp.title'))}</h1></header>
  <div class="row"><button type="button" class="btn s" data-act="cmp-close">‹ ${esc(t('cmp.back'))}</button></div>
  ${side('a')}${side('b')}
  <div id="cmp-table">${tableHTML()}</div>`;
}

// Re-render only the parts that change, so the search boxes keep focus while typing.
const redo = (k) => { const r = $('#cmp-res-' + k); if (r) r.innerHTML = sideControls(k); const tb = $('#cmp-table'); if (tb) tb.innerHTML = tableHTML(); };

for (const k of SIDES) {
  ins['cmp-q-' + k] = (el) => { Object.assign(S.cmp[k], { q: el.value, pick: null, vid: null, own: null, photo: '' }); redo(k); };
  chs['cmp-photo-' + k] = async (el) => { const f = el.files[0]; if (!f) return; try { S.cmp[k].photo = (await readPhoto(f, 'low')).url; redo(k); } catch { toast(t('err.photo')); } };
  acts['cmp-col-' + k] = (el) => { S.cmp[k].cf = S.cmp[k].cf === el.dataset.v ? '' : el.dataset.v; redo(k); };
}
acts['cmp-pick'] = (el) => { const x = S.cmp[el.dataset.side]; Object.assign(x, { pick: el.dataset.key, vid: null, own: null }); redo(el.dataset.side); };
acts['cmp-own'] = (el) => {
  const x = S.cmp[el.dataset.side];
  if (x.own === el.dataset.id) x.own = null;
  else { x.own = el.dataset.id; x.vid = null; const o = own.list.find((q) => q.id === el.dataset.id); if (o) x.cf = o.snap.cf || ''; }
  redo(el.dataset.side);
};
acts['cmp-variant'] = (el) => { const x = S.cmp[el.dataset.side]; x.vid = x.vid === el.dataset.id ? null : el.dataset.id; x.own = null; redo(el.dataset.side); };
acts['cmp-open'] = () => { S.chkView = 'cmp'; hooks.refresh(); window.scrollTo(0, 0); };
acts['cmp-close'] = () => { S.chkView = 'check'; hooks.refresh(); window.scrollTo(0, 0); };
