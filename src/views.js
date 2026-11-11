// Tab views: Collection, Check (+ shop mode), Series, Stats, Settings.
import { esc, castKey, codeKey, norm } from '../shared/text.js';
import { brandOf, CATEGORIES } from '../shared/brands.js';
import { FAMILIES } from '../shared/colors.js';
import { t, tl, fmtDate, getLang } from './i18n.js';
import { cat, syncCatalogue } from './catalogue.js';
import { own, searchCastings, matchOcr, castingByKey, variantsOf, ownedOf, verdict } from './search.js';
import { S, opt, saveProfile, wipeCollection } from './store.js';
import { progress, seriesGroups } from './series.js';
import { rarityBreakdown, TIER_COLORS } from './rarity.js';
import { readPhoto } from './photo.js';
import { recognize } from './ocr.js';
import { exportEncrypted, buildBackup, toCSV, saveFile, parseBackup, restore } from './backup.js';
import { hashPin, randomSalt } from './crypto.js';
import { openSheet, setSheet, closeSheet, closeAllSheets, toast, ring, $, $$, buzz } from './ui.js';
import { acts, ins, chs, hooks } from './registry.js';
import { dot, thumb, pill, palettePicker, field, cname, typeLabel } from './common.js';
import { openAdd, openCar } from './sheets.js';
import { cmpHTML } from './compare.js';

const hdr = (title, sub = '') => `<header class="hdr"><h1>${esc(title)}</h1>${sub ? `<div class="mu">${esc(sub)}</div>` : ''}</header>`;

/* =============================== COLLECTION =============================== */
let sugMemo = { sig: '', list: [] };
let sugNonce = 0; // bumped by the refresh button; the memo is empty on every app start, so each visit shows new picks
function suggestions() {
  const p = S.profile, pf = p.prefs;
  if (!p.onboarded || !cat.list.length) return [];
  const sig = `${pf.cats}|${pf.brands}|${pf.eras}|${own.list.length}|${cat.list.length}|${sugNonce}`;
  if (sugMemo.sig === sig) return sugMemo.list;
  const brands = new Set(pf.brands); const kws = [];
  for (const c of pf.cats) { CATEGORIES[c]?.brands.forEach((b) => brands.add(b)); kws.push(...(CATEGORIES[c]?.kw || [])); }
  const eras = { pre80: [0, 1979], '80s': [1980, 1989], '90s': [1990, 1999], '00s': [2000, 2009], new: [2010, 3000] };
  const list = [];
  if (brands.size || kws.length) {
    for (const c of cat.castings.values()) {
      if (own.byKey.has(c.key)) continue;
      let s = 0;
      if (brands.has(c.brand)) s += 2;
      if (kws.some((k) => c.n.includes(k))) s += 2;
      if (!s) continue;
      if (pf.eras.some((e) => eras[e] && c.y1 >= eras[e][0] && c.y1 <= eras[e][1])) s += 1;
      list.push({ c, s: s + (c.y1 || 0) / 10000 });
    }
  }
  // Random picks from the best-matching pool, so the suggestions change at every visit / refresh.
  const pool = list.sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.c);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = pool.slice(0, 3);
  sugMemo = { sig, list: out };
  return out;
}

/* ---- wishlist ---- */
const isWished = (key, cf) => (S.profile.wish || []).some((w) => w.key === key && (w.cf || '') === (cf || ''));
function wishHTML() {
  const w = S.profile.wish || [];
  if (!w.length) return '';
  return `<div class="card"><b>${esc(t('wish.title'))}</b>${w.map((x, i) => `<div class="row linkrow pad"><button type="button" class="linkbtn g" data-act="add-casting" data-key="${esc(x.key)}"><b>${x.cf ? dot(x.cf) + ' ' : ''}${esc(x.name)}</b></button><button type="button" class="pl" data-act="wish-del" data-i="${i}" aria-label="${esc(t('wish.remove'))}">✕</button></div>`).join('')}</div>`;
}
acts['sug-refresh'] = () => { sugNonce++; hooks.refresh(); };
acts['wish-add'] = async (el) => {
  const { key, name, cf } = el.dataset;
  if (isWished(key, cf)) { toast(t('wish.in')); return; }
  S.profile.wish = [{ key, name, cf: cf || '', ts: Date.now() }, ...(S.profile.wish || [])].slice(0, 100);
  await saveProfile(); toast(t('wish.added')); hooks.refresh();
};
acts['wish-del'] = async (el) => { const w = (S.profile.wish || []).slice(); w.splice(Number(el.dataset.i), 1); S.profile.wish = w; await saveProfile(); hooks.refresh(); };

const SORTS = ['new', 'name', 'base', 'year', 'colour', 'rarity'];
function filtered() {
  const f = S.f; const q = norm(f.q);
  let a = own.list.filter((o) => {
    if (f.brand && brandOf(o.snap.name) !== f.brand) return false;
    if (f.status && o.st !== f.status) return false;
    if (!q) return true;
    const h = norm(`${o.snap.name} ${o.snap.base} ${o.snap.toy} ${o.snap.col} ${o.snap.ser} ${o.note} ${o.loc} ${o.prod}`);
    return q.split(' ').every((w) => h.includes(w));
  });
  const by = {
    new: (x, y) => (y.added || 0) - (x.added || 0), name: (x, y) => x.snap.name.localeCompare(y.snap.name),
    base: (x, y) => (x.snap.base || '~').localeCompare(y.snap.base || '~'), year: (x, y) => (y.snap.cy || y.snap.y) - (x.snap.cy || x.snap.y),
    colour: (x, y) => x.snap.cf.localeCompare(y.snap.cf), rarity: (x, y) => rarityBreakdown(y.snap).score - rarityBreakdown(x.snap).score,
  }[f.sort] || (() => 0);
  a = a.slice().sort(by);
  return a;
}

function listHTML() {
  const a = filtered();
  if (!a.length) return `<p class="empty">${esc(own.list.length ? t('col.nomatch') : t('col.empty'))}</p>`;
  return a.slice(0, 400).map((o, i) => {
    const s = o.snap; const st = Math.min(i, 12);
    if (S.f.layout === 'grid') return `<button type="button" class="card gcard it" style="--i:${st}" data-act="open-car" data-id="${o.id}">${thumb(o)}<b class="nm">${esc(s.name)}</b><span class="mu">${esc(s.col || cname(s.cf))}</span>${s.base ? `<span class="chip mono">${esc(s.base)}</span>` : ''}${o.qty > 1 ? `<span class="chip warn">×${o.qty}</span>` : ''}</button>`;
    return `<button type="button" class="card row it" style="--i:${st}" data-act="open-car" data-id="${o.id}">${thumb(o)}<span class="g"><b class="nm">${esc(s.name)}</b><span class="mu">${esc([s.col || cname(s.cf), s.ser, s.y || s.cy || ''].filter((x) => x && x !== '—').join(' · '))}</span></span><span class="right">${s.base ? `<span class="chip mono">${esc(s.base)}</span>` : ''}${o.qty > 1 ? `<span class="chip warn">×${o.qty}</span>` : ''}${pill(s)}</span></button>`;
  }).join('');
}

const DAY = 86400000;
function backupBanner(total) {
  const p = S.profile; if (total < 3 || (p.bkSnooze || 0) > Date.now()) return '';
  const last = p.lastBackup || 0; const days = last ? Math.floor((Date.now() - last) / DAY) : 0;
  if (last && days < 30) return '';
  const msg = last ? t('bk.remindOld', { d: days }) : t('bk.remindNever', { n: total });
  return `<div class="card warnbox"><b>⚠ ${esc(msg)}</b><div class="row wrap"><button type="button" class="btn s" data-act="bk-now">${esc(t('bk.now'))}</button><button type="button" class="btn s" data-act="bk-later">${esc(t('bk.later'))}</button></div></div>`;
}
acts['bk-now'] = () => { S.tab = 'set'; S.shop = false; hooks.refresh(); window.scrollTo(0, 0); };
acts['bk-later'] = async () => { S.profile.bkSnooze = Date.now() + 7 * DAY; await saveProfile(); hooks.refresh(); };

export function collectionHTML() {
  const total = own.list.reduce((a, o) => a + o.qty, 0);
  const brands = new Map();
  for (const o of own.list) { const b = brandOf(o.snap.name); brands.set(b, (brands.get(b) || 0) + o.qty); }
  const sug = suggestions();
  const greet = S.profile.name ? t('col.hi', { n: S.profile.name }) : t('app.name');
  return `${backupBanner(total)}<header class="hdr"><div><h1>${esc(t('app.name'))}</h1><div class="mu">${esc(greet)} · ${esc(t('col.count', { n: total, m: own.byKey.size }))}</div></div></header>
  ${sug.length ? `<div class="card"><div class="row"><b class="g">${esc(t('col.suggest'))}</b><button type="button" class="pl" data-act="sug-refresh" aria-label="${esc(t('col.refresh'))}" title="${esc(t('col.refresh'))}">🔄</button></div>${sug.map((c) => `<div class="row linkrow pad"><button type="button" class="linkbtn g" data-act="add-casting" data-key="${esc(c.key)}"><b>${esc(c.name)}</b><span class="mu">${esc(c.brand)} · +</span></button><button type="button" class="pl ${isWished(c.key, '') ? 'on' : ''}" data-act="wish-add" data-key="${esc(c.key)}" data-name="${esc(c.name)}" data-cf="" aria-label="${esc(t('wish.add'))}" title="${esc(t('wish.add'))}">${isWished(c.key, '') ? '♥' : '♡'}</button></div>`).join('')}</div>` : ''}
  ${wishHTML()}
  <input class="search" data-in="col-q" placeholder="${esc(t('col.search'))}" value="${esc(S.f.q)}" aria-label="${esc(t('col.search'))}" autocomplete="off">
  <div class="chips" id="col-chips">${chipsHTML(brands)}</div>
  <div class="row"><select class="g" data-ch="col-sort" aria-label="${esc(t('sort'))}">${SORTS.map((k, i) => `<option value="${k}" ${S.f.sort === k ? 'selected' : ''}>${esc(tl('sort.opts')[i])}</option>`).join('')}</select>
  ${opt('carded') ? `<select data-ch="col-status" aria-label="${esc(t('f.status'))}"><option value="">${esc(t('all'))}</option><option value="carded" ${S.f.status === 'carded' ? 'selected' : ''}>${esc(t('carded'))}</option><option value="loose" ${S.f.status === 'loose' ? 'selected' : ''}>${esc(t('loose'))}</option></select>` : ''}
  <button type="button" class="pl" data-act="col-layout" aria-label="${esc(t('layout'))}">${S.f.layout === 'list' ? '▦' : '☰'}</button></div>
  <div id="list" class="${S.f.layout === 'grid' ? 'grid' : 'stack'}">${listHTML()}</div>`;
}
const chipsHTML = (brands) => `<button type="button" class="pl ${S.f.brand ? '' : 'on'}" data-act="col-brand" data-v="">${esc(t('all'))}</button>${[...brands].sort((a, b) => b[1] - a[1]).map(([b, n]) => `<button type="button" class="pl ${S.f.brand === b ? 'on' : ''}" data-act="col-brand" data-v="${esc(b)}">${esc(b)} ${n}</button>`).join('')}`;
ins['col-q'] = (el) => { S.f.q = el.value; $('#list').innerHTML = listHTML(); };
chs['col-sort'] = (el) => { S.f.sort = el.value; hooks.refresh(); };
chs['col-status'] = (el) => { S.f.status = el.value; hooks.refresh(); };
acts['col-brand'] = (el) => { S.f.brand = el.dataset.v; hooks.refresh(); };
acts['col-layout'] = () => { S.f.layout = S.f.layout === 'list' ? 'grid' : 'list'; hooks.refresh(); };
acts['open-car'] = (el) => openCar(el.dataset.id, el);
acts['add-casting'] = (el) => openAdd({ key: el.dataset.key });
acts['open-add'] = () => openAdd(S.tab === 'chk' && S.chk.q ? { q: S.chk.q, cf: S.chk.cf } : {});

/* =============================== CHECK =============================== */
export function checkHTML() {
  if (S.chkView === 'cmp') return cmpHTML();
  const c = S.chk;
  return `${S.shop ? '' : hdr(t('chk.title'), t('chk.sub'))}
  <div class="row wrap"><button type="button" class="btn s ${S.shop ? 'exit' : ''}" data-act="shop-toggle">${esc(S.shop ? t('shop.exit') : '🛒 ' + t('shop.title'))}</button>${S.shop ? '' : `<button type="button" class="btn s" data-act="cmp-open">⚖ ${esc(t('cmp.open'))}</button>`}</div>
  <input id="chk-q" class="search ${S.shop ? 'huge' : ''}" data-in="chk-q" data-ch="chk-q" placeholder="${esc(t('chk.ph'))}" value="${esc(c.q)}" autocomplete="off" autocapitalize="characters" enterkeyhint="search" aria-label="${esc(t('chk.ph'))}">
  <div class="row wrap ${S.shop ? 'hide-shop' : ''}">
    <label class="btn s file">🚗 ${esc(t('add.carPhoto'))}<input type="file" accept="image/*" class="vh" data-ch="chk-photo"></label>
    <label class="btn s file">📷 ${esc(t('add.scan'))}<input type="file" accept="image/*" class="vh" data-ch="chk-ocr"></label>
  </div>
  ${c.photo ? `<img class="preview sm ${S.shop ? 'hide-shop' : ''}" src="${c.photo}" alt="">` : ''}
  <div class="fieldlab">${esc(t('chk.colour'))}</div>${palettePicker(c.cf, 'chk-col', t('chk.colour'))}
  ${opt('prod') ? `<div class="${S.shop ? 'hide-shop' : ''}">${field('chk-prod', t('chk.prod'), c.prod, 'class="mono" data-in="chk-prod" autocapitalize="characters" placeholder="U48N"')}</div>` : ''}
  <div id="chk-res">${checkResult()}</div>`;
}

/** Rarity shown while checking a car in the shop (without adding it). Honest about how sure it is. */
function shopScore(pick, vars) {
  const c = S.chk;
  const base = (v) => ({ ty: v.ty, ser: v.ser, y: v.y, cy: v.cy, key: pick.key, cf: c.cf || '' });
  const chosen = c.vid && cat.byId.get(c.vid);
  let scores = [];
  let conf = 'none';
  if (chosen) { scores = [rarityBreakdown(base(chosen))]; conf = 'high'; }
  else if (vars.length) {
    const pool = c.ser ? vars.filter((v) => norm(v.ser) === norm(c.ser)) : vars;
    scores = (pool.length ? pool : vars).map((v) => rarityBreakdown(base(v)));
    const lo = Math.min(...scores.map((r) => r.score)); const hi = Math.max(...scores.map((r) => r.score));
    conf = scores.length === 1 || hi - lo <= 10 ? 'mid' : 'low';
  }
  if (!scores.length) return `<div class="scorebox"><b>${esc(t('chk.score'))}</b><p class="small">${esc(t('chk.conf.none'))}</p></div>`;
  const lo = Math.min(...scores.map((r) => r.score)); const hi = Math.max(...scores.map((r) => r.score));
  const top = scores.find((r) => r.score === hi);
  const val = lo === hi ? `${hi}` : `${lo}–${hi}`;
  const hasTH = vars.some((v) => v.ty === 'th' || v.ty === 'sth');
  const colourData = vars.some((v) => v.cf);
  return `<div class="scorebox"><div class="row"><b class="g">${esc(t('chk.score'))}</b><span class="chip pill" style="background:${TIER_COLORS[top.tier]}">${val} · ${esc(t('tier.' + top.tier))}</span></div>
  ${lo === hi ? '' : `<p class="small">${esc(t('chk.scoreRange', { a: lo, b: hi, n: scores.length }))}</p>`}
  <p class="small">${esc(t('chk.conf.' + conf))}</p>
  ${hasTH ? `<p class="warn">⚠ ${esc(t('chk.thWarn'))}</p><button type="button" class="btn s" data-act="th-guide">${esc(t('th.btn'))}</button>` : ''}
  ${colourData ? '' : `<p class="small">${esc(t('chk.dataWarn'))}</p>`}
  <button type="button" class="btn s" data-act="rarity-how">${esc(t('rarity.how'))}</button></div>`;
}

function checkResult() {
  const c = S.chk;
  if (!c.q.trim()) return `<p class="mu">${esc(t('chk.hint'))}</p>${recentHTML()}`;
  const found = searchCastings(c.q, 5);
  if (!found.length) {
    return `<div class="vd amber"><h2>${esc(t('chk.nf'))}</h2><p>${esc(t('chk.nfText'))}</p><button type="button" class="btn light" data-act="open-add">${esc(t('add.manual'))}</button></div>`;
  }
  const pick = found.find((x) => x.key === c.pick) || found[0];
  const v = verdict(pick.key, { cf: c.cf, ser: c.ser, prod: c.prod, vid: c.vid, mode: opt('dup') });
  const level = v.level === 'red' ? 'red' : v.level === 'amber' ? 'amber' : 'green';
  const vars = variantsOf(pick.key);
  const own1 = ownedOf(pick.key);
  const nOwnVars = new Set(own1.map((o) => o.vid || o.id)).size;
  const msg = t(`v.${v.level}.${v.reason}`, { c: cname(c.cf), cols: v.cols.map(cname).join(', ') });
  if (level === 'red') buzz([60, 40, 60]); else buzz(25);
  return `${found.length > 1 ? `<div class="chips wrapc">${found.map((x) => `<button type="button" class="pl ${x.key === pick.key ? 'on' : ''}" data-act="chk-pick" data-key="${esc(x.key)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
  <div class="vd ${level}" role="status" aria-live="polite"><h2>${esc(t('v.title.' + level))}</h2><p>${esc(msg)}${v.sameProd ? ' ' + esc(t('v.sameProd')) : ''}</p>
  <div class="row wrap"><b>${esc(pick.name)}</b>${[...pick.bases].slice(0, 1).map((b) => `<span class="chip mono">${esc(b)}</span>`).join('')}</div>
  ${vars.length ? `<p class="small">${esc(t('chk.variants', { n: vars.length, m: own1.length ? Math.min(vars.length, nOwnVars) : 0 }))}</p><div class="sw tight">${vars.slice(0, 48).map((x) => `<button type="button" class="dot lg ${own.byVid.has(x.id) ? 'own' : ''}" style="background:${x.cf ? `var(--c-${x.cf})` : 'transparent'}" data-act="chk-variant" data-id="${esc(x.id)}" title="${esc([x.col, x.ser, x.y].filter(Boolean).join(' · '))}" aria-label="${esc([x.col, x.ser, x.y].filter(Boolean).join(' · '))}"></button>`).join('')}</div>` : ''}
  ${shopScore(pick, vars)}
  ${own1.length ? `<p class="small">${esc(t('chk.youHave'))}: ${own1.map((o) => `${o.snap.col || cname(o.snap.cf)}${o.qty > 1 ? ' ×' + o.qty : ''}`).join(', ')}</p>` : ''}
  <div class="row wrap"><button type="button" class="btn light" data-act="chk-add">${esc(level === 'red' ? t('chk.addAnyway') : t('add.title'))}</button>
  <button type="button" class="btn light" data-act="wish-add" data-key="${esc(pick.key)}" data-name="${esc(pick.name)}" data-cf="${esc(c.cf || '')}">${isWished(pick.key, c.cf) ? '♥ ' + esc(t('wish.in')) : '♡ ' + esc(t('wish.add'))}</button></div></div>`;
}

acts['th-guide'] = () => {
  openSheet(`<h2>${esc(t('th.title'))}</h2><ul class="guide">${[1, 2, 3, 4, 5, 6].map((i) => `<li>${esc(t('th.g.' + i))}</li>`).join('')}</ul><p class="mu">${esc(t('th.src'))}</p><button type="button" class="btn s" data-act="sheet-close">${esc(t('close'))}</button>`);
};

function recentHTML() {
  const rec = S.profile.recent || [];
  if (!rec.length) return '';
  return `<div class="card"><div class="row"><b class="g">${esc(t('chk.recent'))}</b><button type="button" class="pl" data-act="chk-recent-clear">${esc(t('chk.recentClear'))}</button></div>
  <div class="chips wrapc">${rec.map((r) => `<button type="button" class="pl" data-act="chk-recent" data-key="${esc(r.key)}" data-cf="${esc(r.cf || '')}" data-name="${esc(r.name)}">${r.cf ? dot(r.cf) + ' ' : ''}${esc(r.name)}</button>`).join('')}</div></div>`;
}
chs['chk-q'] = async (el) => {
  const q = el.value.trim(); if (q.length < 3) return;
  const pick = searchCastings(q, 5).find((x) => x.key === S.chk.pick) || searchCastings(q, 1)[0];
  if (!pick) return;
  const rec = (S.profile.recent || []).filter((r) => !(r.key === pick.key && (r.cf || '') === (S.chk.cf || '')));
  rec.unshift({ key: pick.key, name: pick.name, cf: S.chk.cf || '', ts: Date.now() });
  S.profile.recent = rec.slice(0, 12);
  await saveProfile();
};
acts['chk-recent'] = (el) => { Object.assign(S.chk, { q: el.dataset.name, cf: el.dataset.cf || '', pick: el.dataset.key, vid: null, ser: '' }); hooks.refresh(); };
acts['chk-recent-clear'] = async () => { S.profile.recent = []; await saveProfile(); hooks.refresh(); };

const redoCheck = () => { const r = $('#chk-res'); if (r) r.innerHTML = checkResult(); };
ins['chk-q'] = (el) => { S.chk.q = el.value; S.chk.pick = null; S.chk.vid = null; S.chk.ser = ''; redoCheck(); };
ins['chk-prod'] = (el) => { S.chk.prod = el.value; redoCheck(); };
acts['chk-col'] = (el) => { S.chk.cf = S.chk.cf === el.dataset.v ? '' : el.dataset.v; S.chk.vid = null; S.chk.ser = ''; hooks.refresh(); };
acts['chk-pick'] = (el) => { S.chk.pick = el.dataset.key; S.chk.vid = null; redoCheck(); };
acts['chk-variant'] = (el) => {
  const v = cat.byId.get(el.dataset.id); if (!v) return;
  if (v.cf) S.chk.cf = v.cf; S.chk.ser = v.ser; S.chk.vid = v.id; hooks.refresh();
};
acts['chk-add'] = () => {
  const found = searchCastings(S.chk.q, 5); const pick = found.find((x) => x.key === S.chk.pick) || found[0];
  openAdd({ key: pick?.key, cf: S.chk.cf, q: S.chk.q });
};
acts['shop-toggle'] = () => { S.shop = !S.shop; hooks.refresh(); };

chs['chk-photo'] = async (el) => {
  const f = el.files[0]; if (!f) return;
  try { const r = await readPhoto(f, 'low'); S.chk.photo = r.url; if (opt('auto') && r.cf) { S.chk.cf = r.cf; toast(t('add.colourDetected', { c: cname(r.cf) })); } hooks.refresh(); } catch { toast(t('err.photo')); }
};
chs['chk-ocr'] = async (el) => {
  const f = el.files[0]; if (!f) return;
  toast(t('ocr.loading'), 60000);
  try {
    const r = await readPhoto(f, 'high');
    const text = await recognize(r.canvas, (m) => { if (m.status === 'recognizing text') toast(t('ocr.reading', { p: Math.round((m.progress || 0) * 100) }), 8000); });
    const hits = matchOcr(text);
    if (!hits.length) { toast(t('ocr.nomatch'), 4000); return; }
    S.chk.q = hits[0].name; S.chk.pick = hits[0].key; toast(t('ocr.done')); hooks.refresh();
  } catch { toast(t('ocr.unavailable'), 4000); }
};

/* =============================== SERIES =============================== */
let progMemo = { a: null, b: null, data: [] };
const prog = () => { if (progMemo.a !== own.list || progMemo.b !== cat.list) progMemo = { a: own.list, b: cat.list, data: progress() }; return progMemo.data; };

export function seriesHTML() {
  if (!cat.list.length || cat.seed) return `${hdr(t('series.title'))}<p class="empty">${esc(t('series.noData'))}</p>`;
  const tab = S.serTab || 'close'; const q = norm(S.serQ || '');
  let a = prog().filter((g) => !q || norm(g.name + ' ' + g.y).includes(q));
  if (tab === 'close') a = a.filter((g) => g.have > 0 && g.have < g.total).sort((x, y) => y.pct - x.pct || x.missing.length - y.missing.length);
  else if (tab === 'recent') a = a.filter((g) => g.have > 0).sort((x, y) => y.last - x.last);
  else if (tab === 'done') a = a.filter((g) => g.have === g.total).sort((x, y) => y.y - x.y);
  else a = a.sort((x, y) => y.y - x.y || x.name.localeCompare(y.name));
  const rows = a.slice(0, 80).map((g, i) => `<button type="button" class="card row it" style="--i:${Math.min(i, 12)}" data-act="series-open" data-id="${esc(g.id)}">${ring(g.pct, `${g.have}/${g.total}`)}<span class="g"><b>${esc(g.name)}</b><span class="mu">${esc(g.y)} · ${esc(t('series.missing', { n: g.total - g.have }))}</span></span><span class="mu">›</span></button>`).join('');
  return `${hdr(t('series.title'), t('series.sub'))}
  <div class="chips wrapc">${['close', 'recent', 'done', 'all'].map((k) => `<button type="button" class="pl ${tab === k ? 'on' : ''}" data-act="series-tab" data-v="${k}">${esc(t('series.tab.' + k))}</button>`).join('')}</div>
  <input class="search" data-in="series-q" placeholder="${esc(t('series.search'))}" value="${esc(S.serQ || '')}" autocomplete="off">
  <div id="series-list" class="stack">${rows || `<p class="empty">${esc(t('series.none'))}</p>`}</div>${a.length > 80 ? `<p class="mu">${esc(t('series.more', { n: a.length - 80 }))}</p>` : ''}`;
}
acts['series-tab'] = (el) => { S.serTab = el.dataset.v; hooks.refresh(); };
ins['series-q'] = (el) => { S.serQ = el.value; clearTimeout(ins._st); ins._st = setTimeout(() => { const keep = el.selectionStart; hooks.refresh(); const n = $('[data-in="series-q"]'); n?.focus(); try { n.setSelectionRange(keep, keep); } catch { /* */ } }, 220); };
acts['series-open'] = (el) => {
  const g = prog().find((x) => x.id === el.dataset.id); if (!g) return;
  const cell = (it, ok) => `<button type="button" class="card row cell ${ok ? 'ok' : 'miss'}" ${ok ? '' : `data-act="add-casting" data-key="${esc(it.key)}"`}><span class="g"><b>${esc(it.name)}</b><span class="mu">${ok ? '✓ ' + esc(t('series.own')) : esc(t('series.miss'))}</span></span></button>`;
  openSheet(`<h2>${esc(g.name)} <span class="mu">${esc(g.y)}</span></h2><div class="row">${ring(g.pct, `${g.have}/${g.total}`)}<p class="g mu">${esc(t('series.missing', { n: g.total - g.have }))}</p></div>
  ${g.missing.length ? `<h3>${esc(t('series.miss'))}</h3><div class="grid2">${g.missing.map((i) => cell(i, false)).join('')}</div>` : ''}
  ${g.owned.length ? `<h3>${esc(t('series.own'))}</h3><div class="grid2">${g.owned.map((i) => cell(i, true)).join('')}</div>` : ''}
  <button type="button" class="btn s" data-act="sheet-close">${esc(t('close'))}</button>`);
};

/* =============================== STATS =============================== */
const bars = (map, color) => {
  const e = [...map].sort((a, b) => b[1] - a[1]).slice(0, 12); const mx = Math.max(1, ...e.map((x) => x[1]));
  return e.length ? e.map(([k, n]) => `<div class="brow"><span class="lab">${color ? dot(color(k)) : ''} ${esc(k)}</span><span class="track"><i style="width:${(n / mx) * 100}%"></i></span><b>${n}</b></div>`).join('') : `<p class="mu">${esc(t('stats.nodata'))}</p>`;
};
const tally = (f) => { const m = new Map(); for (const o of own.list) { const k = f(o); if (k) m.set(k, (m.get(k) || 0) + o.qty); } return m; };

/** Cars added by hand: they are not (exactly) in the catalogue, so this is the "what is missing from the database" list. */
const manualCars = () => own.list.filter((o) => !o.vid);
function mineHTML() {
  const m = manualCars(); if (!m.length) return '';
  return `<div class="card"><h3>${esc(t('mine.title', { n: m.length }))}</h3><p class="mu">${esc(t('mine.help'))}</p>
  ${m.slice(0, 30).map((o) => `<button type="button" class="row linkrow pad" data-act="open-car" data-id="${o.id}">${dot(o.snap.cf)}<span class="g">${esc(o.snap.name)} <span class="mu">${esc([o.snap.toy || o.snap.base, o.snap.col || cname(o.snap.cf)].filter(Boolean).join(' · '))}</span></span></button>`).join('')}
  ${m.length > 30 ? `<p class="mu">${esc(t('add.more', { n: m.length - 30 }))}</p>` : ''}
  <button type="button" class="btn s" data-act="mine-export">${esc(t('mine.export'))}</button></div>`;
}
acts['mine-export'] = async () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = manualCars().map((o) => [o.snap.name, o.snap.toy, o.snap.base, o.snap.col || cname(o.snap.cf), o.snap.ser, o.snap.y || '', o.snap.ty || ''].map(q).join(','));
  const csv = '\ufeff' + [['name', 'card_code', 'base_code', 'colour', 'series', 'year', 'type'].join(','), ...rows].join('\n');
  const r = await saveFile('cars-missing-from-database.csv', csv, 'text/csv');
  if (r !== 'cancelled') toast(t('mine.saved'));
};

export function statsHTML() {
  const list = own.list; const cars = list.reduce((a, o) => a + o.qty, 0);
  const rs = list.map((o) => ({ o, r: rarityBreakdown(o.snap) }));
  const avg = rs.length ? Math.round(rs.reduce((a, x) => a + x.r.score, 0) / rs.length) : 0;
  const top = rs.slice().sort((a, b) => b.r.score - a.r.score).slice(0, 5);
  const tiers = new Map(Array.from({ length: 5 }, (_, i) => [t('tier.' + i), 0]));
  rs.forEach((x) => tiers.set(t('tier.' + x.r.tier), tiers.get(t('tier.' + x.r.tier)) + x.o.qty));
  const dec = tally((o) => { const y = o.snap.cy || o.snap.y; return y ? `${String(y).slice(0, 3)}0s` : ''; });
  const third = opt('carded') ? [t('carded'), list.filter((o) => o.st === 'carded').reduce((a, o) => a + o.qty, 0)] : [t('stats.brands'), new Set(list.map((o) => brandOf(o.snap.name))).size];
  const dupes = list.filter((o) => o.qty > 1).reduce((a, o) => a + o.qty - 1, 0);
  return `${hdr(t('stats.title'))}
  <div class="stats">${[[t('stats.cars'), cars], [t('stats.models'), own.byKey.size], third].map(([l, n]) => `<div class="stat"><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div>
  ${dupes ? `<p class="warn">⚠ ${esc(t('stats.dupes', { n: dupes }))}</p><div class="card"><h3>${esc(t('stats.dupList'))}</h3>${list.filter((o) => o.qty > 1).sort((a, b) => b.qty - a.qty).slice(0, 30).map((o) => `<button type="button" class="row linkrow pad" data-act="open-car" data-id="${o.id}">${dot(o.snap.cf)}<span class="g">${esc(o.snap.name)} <span class="mu">${esc(o.snap.col || cname(o.snap.cf))}</span></span><b>×${o.qty}</b></button>`).join('')}</div>` : ''}
  ${mineHTML()}
  <div class="card row"><div class="g"><div class="mu">${esc(t('stats.rarity'))} <span class="chip">${esc(t('rarity.estimate'))}</span></div><div class="bignum">${avg}</div></div><button type="button" class="pl" data-act="rarity-how" aria-label="${esc(t('rarity.how'))}">?</button></div>
  <div class="card"><h3>${esc(t('stats.rarest'))}</h3>${top.map(({ o, r }) => `<button type="button" class="row linkrow pad" data-act="open-car" data-id="${o.id}">${dot(o.snap.cf)}<span class="g">${esc(o.snap.name)}</span>${pill(o.snap)}</button>`).join('') || `<p class="mu">${esc(t('stats.nodata'))}</p>`}</div>
  <div class="card"><h3>${esc(t('stats.byTier'))}</h3>${bars(tiers)}</div>
  <div class="card"><h3>${esc(t('stats.byBrand'))}</h3>${bars(tally((o) => brandOf(o.snap.name)))}</div>
  <div class="card"><h3>${esc(t('stats.byColour'))}</h3>${bars(tally((o) => o.snap.cf), null).replace(/<span class="lab">/g, '<span class="lab">')}</div>
  <div class="card"><h3>${esc(t('stats.byCountry'))}</h3>${bars(tally((o) => o.snap.made))}</div>
  <div class="card"><h3>${esc(t('stats.byDecade'))}</h3>${bars(dec)}</div>`;
}

/* =============================== SETTINGS =============================== */
let storageText = '';
export async function refreshStorage() {
  try { const e = await navigator.storage.estimate(); storageText = `${(e.usage / 1048576).toFixed(1)} MB`; } catch { storageText = ''; }
}
const seg = (id, items, cur, act) => `<div class="chips wrapc" role="group" aria-label="${esc(id)}">${items.map(([v, label]) => `<button type="button" class="pl ${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${esc(label)}</button>`).join('')}</div>`;
const toggleRow = (id, label, help, on) => `<label class="toggle"><span><b>${esc(label)}</b><span class="mu">${esc(help)}</span></span><span class="swt"><input type="checkbox" data-ch="opt-toggle" data-k="${id}" ${on ? 'checked' : ''}><i></i></span></label>`;

const APP_VER = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
const APP_SHA = typeof __APP_SHA__ === 'undefined' ? 'local' : __APP_SHA__;
const APP_BUILT = typeof __APP_BUILT__ === 'undefined' ? '' : __APP_BUILT__;
const verMsg = (k) => { const e = $('#ver-msg'); if (e) e.textContent = k ? t(k) : ''; };
acts['app-update'] = async (el) => {
  el.disabled = true; verMsg('ver.checking');
  const r = await (hooks.checkUpdate?.() ?? 'unsupported');
  el.disabled = false; verMsg('ver.r.' + r);
};
acts['app-clean'] = async (el) => {
  if (!navigator.onLine) { verMsg('ver.r.offline'); return; }
  el.disabled = true; verMsg('ver.checking');
  const r = await (hooks.checkUpdate?.({ force: true }) ?? 'unsupported');
  el.disabled = false; verMsg('ver.r.' + r);
};

export function settingsHTML() {
  const p = S.profile; const man = cat.manifest;
  const age = man ? Math.max(0, Math.floor((Date.now() - Date.parse(man.built)) / 864e5)) : null;
  return `${hdr(t('set.title'))}
  <div class="card"><h3>${esc(t('set.profile'))}</h3>
    ${field('set-name', t('ob.name'), p.name, 'data-ch="set-name"')}
    <div class="row wrap"><button type="button" class="btn s" data-act="open-profiles">${esc(t('profile.title'))} (${S.profiles.length})</button><button type="button" class="btn s" data-act="open-onboarding">${esc(t('set.redo'))}</button></div>
    <div class="fieldlab">${esc(t('language'))}</div>${seg('lang', [['en', 'English'], ['ro', 'Română']], p.lang, 'set-lang')}
    <div class="fieldlab">${esc(t('theme'))}</div>${seg('theme', ['track', 'purple', 'show', 'neon'].map((x) => [x, t('theme.' + x)]), p.theme, 'set-theme')}
    <div class="fieldlab">${esc(t('mode'))}</div>${seg('mode', [['sys', t('mode.sys')], ['light', t('mode.light')], ['dark', t('mode.dark')]], p.mode, 'set-mode')}</div>
  <div class="card"><h3>${esc(t('set.options'))}</h3>
    ${toggleRow('prod', t('opt.prod'), t('opt.prodHelp'), p.opts.prod)}${toggleRow('carded', t('opt.carded'), t('opt.cardedHelp'), p.opts.carded)}${toggleRow('auto', t('opt.auto'), t('opt.autoHelp'), p.opts.auto)}
    <div class="fieldlab">${esc(t('ob.dup'))}</div>${seg('dup', [['exact', t('dup.exact')], ['model', t('dup.model')]], p.opts.dup, 'set-dup')}
    <div class="fieldlab">${esc(t('opt.photo'))}</div>${seg('photo', [['low', t('photo.low')], ['medium', t('photo.medium')], ['high', t('photo.high')]], p.opts.photo, 'set-photo')}</div>
  <div class="card"><h3>${esc(t('set.db'))}</h3>
    <p class="mu">${man ? esc(t('db.info', { v: man.version, d: fmtDate(man.built), a: age, n: cat.list.length, c: cat.castings.size })) : esc(t('db.none'))}</p>
    ${cat.seed ? `<p class="warn">${esc(t('db.seed'))}</p>` : ''}
    <div id="db-bar" class="progbar" hidden><i id="db-fill"></i></div><p id="db-msg" class="mu"></p>
    <button type="button" class="btn s" data-act="db-update">${esc(t('db.check'))}</button></div>
  <div class="card"><h3>${esc(t('set.backup'))}</h3><p class="mu">${esc(t('bk.help'))}${storageText ? ' ' + esc(t('bk.storage', { s: storageText })) : ''}</p>
    <div class="row wrap"><button type="button" class="btn s" data-act="bk-enc">🔒 ${esc(t('bk.export'))}</button><button type="button" class="btn s" data-act="bk-plain">${esc(t('bk.plain'))}</button><button type="button" class="btn s" data-act="bk-csv">CSV</button></div>
    <div class="row wrap"><label class="btn s file">${esc(t('bk.import'))}<input type="file" accept=".json,application/json,text/plain" class="vh" data-ch="bk-file"></label><button type="button" class="btn s" data-act="bk-paste">${esc(t('bk.paste'))}</button></div></div>
  <div class="card"><h3>${esc(t('set.pin'))}</h3><p class="mu">${esc(t('pin.help'))}</p><div class="row wrap"><button type="button" class="btn s" data-act="pin-set">${esc(p.pin ? t('pin.change') : t('pin.set'))}</button>${p.pin ? `<button type="button" class="btn s" data-act="pin-off">${esc(t('pin.off'))}</button>` : ''}</div></div>
  <button type="button" class="btn s" data-act="open-about">${esc(t('about.title'))}</button>
  <div class="card"><h3>${esc(t('set.danger'))}</h3><button type="button" class="btn danger" data-act="wipe">${esc(t('wipe'))}</button></div>
  <div class="card"><h3>${esc(t('set.version'))}</h3>
    <p class="verline"><b>v${esc(APP_VER)}</b> <span class="mu">· ${esc(APP_SHA)}${APP_BUILT ? ' · ' + esc(fmtDate(APP_BUILT)) : ''}</span></p>
    ${hooks.updateReady?.() ? `<p class="warn">${esc(t('ver.waiting'))}</p>` : ''}
    <div class="row wrap"><button type="button" class="btn primary" data-act="app-update">${esc(hooks.updateReady?.() ? t('ver.apply') : t('ver.check'))}</button><button type="button" class="btn s" data-act="app-clean">${esc(t('ver.clean'))}</button><button type="button" class="btn s" data-act="news-open">${esc(t('news.title'))}</button></div>
    <p id="ver-msg" class="mu" role="status"></p><p class="mu small">${esc(t('ver.help'))}</p></div>
  <p class="mu center">${esc(t('app.name'))} v${esc(APP_VER)}</p>`;
}

chs['set-name'] = async (el) => { S.profile.name = el.value.trim(); await saveProfile(); };
acts['set-lang'] = async (el) => { S.profile.lang = el.dataset.v; await saveProfile(); hooks.setLang(S.profile.lang); hooks.refresh(); };
acts['set-theme'] = async (el) => { S.profile.theme = el.dataset.v; await saveProfile(); hooks.applyTheme(); hooks.refresh(); };
acts['set-mode'] = async (el) => { S.profile.mode = el.dataset.v; await saveProfile(); hooks.applyTheme(); hooks.refresh(); };
acts['set-dup'] = async (el) => { S.profile.opts.dup = el.dataset.v; await saveProfile(); hooks.refresh(); };
acts['set-photo'] = async (el) => { S.profile.opts.photo = el.dataset.v; await saveProfile(); hooks.refresh(); };
chs['opt-toggle'] = async (el) => { S.profile.opts[el.dataset.k] = el.checked; await saveProfile(); hooks.refresh(); };

acts['db-update'] = async () => {
  const bar = $('#db-bar'), fill = $('#db-fill'), msg = $('#db-msg');
  bar.hidden = false; msg.textContent = t('db.checking');
  const r = await syncCatalogue({ onProgress: (p) => { fill.style.width = p.pct + '%'; msg.textContent = t('db.progress', { p: p.pct, mb: (p.bytes / 1048576).toFixed(1), tot: (p.totalBytes / 1048576).toFixed(1), eta: p.etaSec == null ? '…' : Math.ceil(p.etaSec) }); } });
  if (r.status === 'offline') msg.textContent = t('db.offline');
  else if (r.status === 'current') msg.textContent = t('db.current');
  else { toast(t('db.updated', { n: r.added })); hooks.refresh(); }
  if (r.status !== 'updated') bar.hidden = true;
};

/* ---- backup ---- */
let pending = null;
const markBackup = async () => { S.profile.lastBackup = Date.now(); S.profile.bkSnooze = 0; await saveProfile(); };
acts['bk-plain'] = async () => { const r = await saveFile(`car-collection-${S.profile.name || 'backup'}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(buildBackup())); if (r !== 'cancelled') { await markBackup(); toast(t('bk.saved')); } };
acts['bk-csv'] = async () => { await saveFile(`car-collection-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(), 'text/csv'); toast(t('bk.saved')); };
acts['bk-enc'] = () => openSheet(`<h2>${esc(t('bk.export'))}</h2><p class="mu">${esc(t('bk.encHelp'))}</p>${field('bk-pw', t('bk.password'), '', 'type="password" autocomplete="new-password"')}${field('bk-pw2', t('bk.password2'), '', 'type="password" autocomplete="new-password"')}<p id="bk-err" class="warn"></p><button type="button" class="btn primary" data-act="bk-enc-go">${esc(t('bk.export'))}</button>`);
acts['bk-enc-go'] = async () => {
  const a = $('#bk-pw').value, b = $('#bk-pw2').value;
  if (a.length < 8) { $('#bk-err').textContent = t('bk.short'); return; }
  if (a !== b) { $('#bk-err').textContent = t('bk.mismatch'); return; }
  const env = await exportEncrypted(a);
  const r = await saveFile(`car-collection-${S.profile.name || 'backup'}-${new Date().toISOString().slice(0, 10)}.ccbackup.json`, JSON.stringify(env));
  closeSheet(); if (r !== 'cancelled') { await markBackup(); toast(t('bk.saved')); }
};
chs['bk-file'] = async (el) => { const f = el.files[0]; if (!f) return; el.value = ''; startImport(await f.text()); };
acts['bk-paste'] = () => openSheet(`<h2>${esc(t('bk.paste'))}</h2><p class="mu">${esc(t('bk.pasteHelp'))}</p><textarea id="bk-text" rows="8" class="area"></textarea><button type="button" class="btn primary" data-act="bk-paste-go">${esc(t('bk.import'))}</button>`);
acts['bk-paste-go'] = () => { const txt = $('#bk-text').value; closeSheet(); startImport(txt); };

async function startImport(text, password) {
  try {
    const data = await parseBackup(text, password);
    pending = data;
    const n = Array.isArray(data) ? data.length : data.owned?.length || 0;
    openSheet(`<h2>${esc(t('bk.confirm'))}</h2><p>${esc(t('bk.confirmText', { n }))}</p><div class="row"><button type="button" class="btn s" data-act="sheet-close">${esc(t('cancel'))}</button><button type="button" class="btn primary" data-act="bk-restore">${esc(t('bk.restore'))}</button></div>`);
  } catch (e) {
    if (e.message === 'password' || e.message === 'wrong-password') {
      pending = text;
      openSheet(`<h2>${esc(t('bk.needPw'))}</h2>${e.message === 'wrong-password' ? `<p class="warn">${esc(t('bk.wrongPw'))}</p>` : ''}${field('bk-pw', t('bk.password'), '', 'type="password"')}<button type="button" class="btn primary" data-act="bk-pw-go">${esc(t('next'))}</button>`);
    } else toast(t('bk.bad'), 4000);
  }
}
acts['bk-pw-go'] = () => { const pw = $('#bk-pw').value; const txt = pending; closeSheet(); startImport(txt, pw); };
acts['bk-restore'] = async () => {
  try { const r = await restore(pending); pending = null; closeAllSheets(); hooks.refresh(); toast(t('bk.done', { n: r.n }) + (r.skipped ? ' ' + t('bk.skipped', { n: r.skipped }) : ''), 4500); } catch { toast(t('bk.bad'), 4000); }
};

/* ---- PIN ---- */
acts['pin-set'] = () => openSheet(`<h2>${esc(t('pin.set'))}</h2>${field('pin-in', t('pin.digits'), '', 'type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off"')}<p class="mu">${esc(t('pin.warn'))}</p><button type="button" class="btn primary" data-act="pin-save">${esc(t('save'))}</button>`);
acts['pin-save'] = async () => {
  const v = $('#pin-in').value;
  if (!/^\d{4,8}$/.test(v)) { toast(t('pin.digits')); return; }
  const salt = randomSalt(); S.profile.pin = { salt, hash: await hashPin(v, salt) };
  await saveProfile(); closeSheet(); hooks.refresh(); toast(t('saved'));
};
acts['pin-off'] = async () => { S.profile.pin = null; await saveProfile(); hooks.refresh(); toast(t('saved')); };

let wipeArm = 0;
acts['wipe'] = async (el) => {
  if (Date.now() - wipeArm > 4000) { wipeArm = Date.now(); el.textContent = t('wipe.confirm'); return; }
  await wipeCollection(); wipeArm = 0; hooks.refresh(); toast(t('wipe.done'));
};

export const VIEWS = { col: collectionHTML, chk: checkHTML, ser: seriesHTML, sta: statsHTML, set: settingsHTML };
