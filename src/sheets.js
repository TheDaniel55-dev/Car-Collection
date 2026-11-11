// Bottom sheets: add flow, car detail, edit, rarity, onboarding, about, profiles.
import { esc, castKey, codeKey, norm } from '../shared/text.js';
import { brandOf, CATEGORIES } from '../shared/brands.js';
import { PALETTE, FAMILIES, colorFamily } from '../shared/colors.js';
import { classifyType } from '../shared/classify.js';
import { t, tl, setLang, fmtDate } from './i18n.js';
import { cat, syncCatalogue } from './catalogue.js';
import { own, searchCastings, matchOcr, castingByKey, variantsOf, ownedOf, verdict } from './search.js';
import { S, opt, addOwned, saveOwned, removeOwned, makeSnap, saveProfile, switchProfile, createProfile, deleteProfile } from './store.js';
import { progress } from './series.js';
import { rarityBreakdown, BASE_POINTS, TIER_COLORS, TIERS } from './rarity.js';
import { readPhoto } from './photo.js';
import { recognize } from './ocr.js';
import { openSheet, setSheet, closeSheet, closeAllSheets, toast, confetti, flip, $, $$, buzz } from './ui.js';
import { acts, ins, chs, hooks } from './registry.js';
import { dot, thumb, pill, palettePicker, field, cname, typeLabel } from './common.js';

let A = null; // add/edit flow state

const tierName = (n) => t('tier.' + n);
const years = (c) => (c.y1 ? (c.y0 === c.y1 ? `${c.y0}` : `${c.y0}–${c.y1}`) : '');

/* =============================== ADD FLOW =============================== */
export function openAdd(pre = {}) {
  A = { sep: false, step: 'search', q: pre.q || '', key: pre.key || null, cf: pre.cf || '', ser: pre.ser || '', photo: '', draft: null, edit: null, ocr: '' };
  openSheet(searchHTML(), { onClose: () => { A = null; } });
  if (pre.key) pickCasting(pre.key);
}

const codeLike = (q) => (/\d/.test(q) && !/\s/.test(q.trim()) && q.trim().length >= 4 ? q.trim().toUpperCase() : '');

/** Nothing found: say why, and offer the manual route with the typed code already filled in. */
function notFoundHTML() {
  const code = codeLike(A.q);
  return `<div class="card nf"><b>${esc(t('add.nf.title', { q: A.q.trim() }))}</b><p class="mu">${esc(t('add.nf.why'))}</p>
  <button type="button" class="btn primary" data-act="add-manual">${esc(code ? t('add.nf.btnCode', { c: code }) : t('add.nf.btn'))}</button></div>`;
}

function resultRows() {
  const list = A.q ? searchCastings(A.q, 7) : [];
  if (!list.length) return A.q ? notFoundHTML() : `<p class="mu">${esc(t('add.hint'))}</p>`;
  return list.map((c) => {
    const n = ownedOf(c.key).reduce((a, o) => a + o.qty, 0);
    return `<button type="button" class="card row it" data-act="add-pick" data-key="${esc(c.key)}"><span class="g"><b>${esc(c.name)}</b><span class="mu">${esc([c.brand, years(c), c.count ? t('add.nvar', { n: c.count }) : t('add.yours')].filter(Boolean).join(' · '))}</span></span>${n ? `<span class="chip ok">✓ ×${n}</span>` : ''}</button>`;
  }).join('');
}

function searchHTML() {
  return `<p class="stepl">${esc(t('add.s1'))}</p><h2>${esc(t('add.title'))}</h2>
  <input id="add-q" class="search" data-in="add-q" placeholder="${esc(t('add.ph'))}" value="${esc(A.q)}" autocomplete="off" autocapitalize="characters" enterkeyhint="search">
  <div class="row wrap">
    <label class="btn s file">📷 ${esc(t('add.scan'))}<input type="file" accept="image/*" class="vh" data-ch="add-ocr"></label>
    <label class="btn s file">🚗 ${esc(t('add.carPhoto'))}<input type="file" accept="image/*" class="vh" data-ch="add-carphoto"></label>
  </div>
  ${A.cf ? `<p class="mu">${dot(A.cf)} ${esc(t('add.colourDetected', { c: cname(A.cf) }))}</p>` : ''}
  <div id="add-res" class="stack">${resultRows()}</div>
  <div class="card manualcta"><b>${esc(t('add.cantFind'))}</b><p class="mu">${esc(t('add.cantFindText'))}</p><button type="button" class="btn s" data-act="add-manual">${esc(t('add.manual'))}</button></div>`;
}

ins['add-q'] = (el) => { if (!A) return; A.q = el.value; $('#add-res').innerHTML = resultRows(); };

chs['add-carphoto'] = async (el) => {
  const f = el.files[0]; if (!f || !A) return;
  try {
    const r = await readPhoto(f, opt('photo'));
    A.photo = r.url;
    if (opt('auto') && r.cf) { A.cf = r.cf; toast(t('add.colourDetected', { c: cname(r.cf) })); }
    setSheet(searchHTML());
  } catch { toast(t('err.photo')); }
};

chs['add-ocr'] = async (el) => {
  const f = el.files[0]; if (!f || !A) return;
  toast(t('ocr.loading'), 60000);
  try {
    const r = await readPhoto(f, 'high');
    const text = await recognize(r.canvas, (m) => { if (m.status === 'recognizing text') toast(t('ocr.reading', { p: Math.round((m.progress || 0) * 100) }), 8000); });
    toast(t('ocr.done'));
    A.ocr = text;
    const hits = matchOcr(text);
    const box = $('#add-res');
    if (!hits.length) { box.innerHTML = `<p class="mu">${esc(t('ocr.nomatch'))}</p><pre class="ocr">${esc(text.trim().slice(0, 300))}</pre>`; return; }
    box.innerHTML = `<p class="mu">${esc(t('ocr.found'))}</p>` + hits.map((c) => `<button type="button" class="card row it" data-act="add-pick" data-key="${esc(c.key)}"><span class="g"><b>${esc(c.name)}</b><span class="mu">${esc([c.brand, years(c)].filter(Boolean).join(' · '))}</span></span><span class="chip">${c.score >= 100 ? '✓' : '~'}</span></button>`).join('');
  } catch { toast(t('ocr.unavailable'), 4000); }
};

acts['add-pick'] = (el) => pickCasting(el.dataset.key);

function pickCasting(key) {
  const c = castingByKey(key);
  if (!c) return;
  A.key = key; A.casting = c;
  const vs = variantsOf(key);
  if (!vs.length) { // owned-only casting: start from what the user entered before
    const o = ownedOf(key)[0];
    return startForm({ name: c.name, base: o?.snap.base || '', toy: o?.snap.toy || '', made: o?.snap.made || '', cy: o?.snap.cy || 0, cf: A.cf }, { manual: true });
  }
  A.step = 'variants';
  setSheet(variantsHTML());
}

function variantsHTML() {
  const c = A.casting;
  const vs = variantsOf(A.key).slice().sort((a, b) => (b.cf === A.cf && A.cf ? 1 : 0) - (a.cf === A.cf && A.cf ? 1 : 0) || b.y - a.y);
  const shown = vs.slice(0, 80);
  const rows = shown.map((v) => {
    const n = (own.byVid.get(v.id) || []).reduce((a, o) => a + o.qty, 0);
    const title = [v.y || '', v.ser].filter(Boolean).join(' · ') || v.name;
    return `<button type="button" class="card row it ${A.cf && v.cf === A.cf ? 'hl' : ''}" data-act="add-variant" data-id="${esc(v.id)}">${dot(v.cf, 'lg')}<span class="g"><b>${esc(title)}</b><span class="mu">${esc([v.col || t('add.colourUnknown'), v.cn, typeLabel(v.ty)].filter(Boolean).join(' · '))}</span></span>${v.toy ? `<span class="chip mono">${esc(v.toy)}</span>` : ''}${n ? `<span class="chip ok">✓ ×${n}</span>` : ''}</button>`;
  }).join('');
  return `<button type="button" class="link" data-act="add-back">‹ ${esc(t('back'))}</button>
  <p class="stepl">${esc(t('add.s2'))}</p><h2>${esc(c.name)}</h2><p class="mu">${esc(t('add.pickVariant', { n: vs.length }))}</p>
  <div class="fieldlab">${esc(t('add.filterColour'))}${A.cf ? ` · ${esc(cname(A.cf))}` : ''}</div>${palettePicker(A.cf, 'add-vcf', t('add.filterColour'))}
  <div class="stack">${rows}</div>${vs.length > 80 ? `<p class="mu">${esc(t('add.more', { n: vs.length - 80 }))}</p>` : ''}
  <button type="button" class="btn s" data-act="add-notlisted">${esc(t('add.notListed'))}</button>`;
}
acts['add-back'] = () => { A.step = 'search'; setSheet(searchHTML()); };
acts['add-vcf'] = (el) => { A.cf = A.cf === el.dataset.v ? '' : el.dataset.v; setSheet(variantsHTML()); };
acts['add-notlisted'] = () => startForm({ name: A.casting.name, base: [...A.casting.bases][0] || '', cf: A.cf }, { manual: true });
acts['add-manual'] = () => startForm({ name: A.q && !/\d/.test(A.q) ? A.q.trim() : '', toy: codeLike(A.q), cf: A.cf }, { manual: true });
acts['add-variant'] = (el) => {
  const v = cat.byId.get(el.dataset.id); if (!v) return;
  // The colour is picked by the user (the catalogue colour is only shown as a hint).
  startForm({ name: v.name, col: '', cf: A.cf || '', wikiCol: v.col || '', ser: v.ser, y: v.y, cy: v.cy, toy: v.toy, base: v.base, num: v.num, ty: v.ty, tp: v.tp, wh: v.wh, alt: v.cn }, { vid: v.id });
};

/* ---------- details / manual form ---------- */
function startForm(d, o = {}) {
  A.step = 'form';
  A.draft = { ...d }; A.vid = o.vid || null; A.manual = !!o.manual; A.edit = o.edit || null;
  setSheet(formHTML());
  refreshDup();
}

function formHTML() {
  const d = A.draft, rec = A.edit;
  const locked = !!A.vid && !rec;
  const picked = (d.ser || d.y) ? [d.ser, d.y || ''].filter(Boolean).join(' · ') : '';
  // 1) which car
  const car = locked
    ? `<div class="card row"><div class="g"><b>${esc(d.name)}</b><div class="mu">${esc(picked)}</div></div>${d.toy ? `<span class="chip mono">${esc(d.toy)}</span>` : ''}</div>`
    : `${field('f-name', t('f.name'), d.name, 'data-in="f-dup" autocomplete="off" placeholder="Bugatti Veyron"')}<div id="f-sugg"></div>
       <div class="grid2">${field('f-toy', t('f.toy'), d.toy, 'class="mono" autocapitalize="characters" data-in="f-basefill" placeholder="HNT17"')}${field('f-base', t('f.base'), d.base, 'class="mono" autocapitalize="characters" data-in="f-basefill"')}</div>
       <p class="mu small">${esc(t('add.codesHelp'))}</p>`;
  // 2) colour: named chips, never bare circles
  const colour = `<div class="fieldlab">${esc(t('f.colour'))}</div><p class="mu">${esc(t('add.pickColour'))}</p>${palettePicker(d.cf, 'f-col', t('f.colour'), true)}
       ${locked && d.wikiCol ? `<p class="mu">${esc(t('add.wikiColour', { c: d.wikiCol }))}</p>` : ''}${field('f-colname', t('f.colourName'), d.col, '')}`;
  // 3) how many / where
  const basics = `<div class="grid2">${field('f-qty', t('f.qty'), rec?.qty || 1, 'type="number" min="1" inputmode="numeric"')}${opt('carded') ? `<label class="field"><span>${esc(t('f.status'))}</span><select id="f-st"><option value="loose" ${rec?.st !== 'carded' ? 'selected' : ''}>${esc(t('loose'))}</option><option value="carded" ${rec?.st === 'carded' ? 'selected' : ''}>${esc(t('carded'))}</option></select></label>` : '<span></span>'}</div>`;
  const photo = `<div class="row wrap"><label class="btn s file">📷 ${esc(t('f.photo'))}<input type="file" accept="image/*" class="vh" data-ch="f-photo"></label>${(rec?.photo || A.photo) ? `<img id="f-prev" class="preview sm" src="${rec?.photo && !A.photo ? rec.photo : A.photo}" alt="">` : '<img id="f-prev" class="preview sm" alt="" hidden>'}</div>`;
  // 4) the rest, folded away
  const moreCar = locked ? (!d.base ? field('f-base', t('f.baseLearn'), '', 'class="mono" autocapitalize="characters"') : '')
    : `<div class="grid2">${field('f-ser', t('f.series'), d.ser, 'data-in="f-dup"')}${field('f-y', t('f.year'), d.y || '', 'inputmode="numeric"')}</div>
       <div class="grid2">${field('f-cy', t('f.castYear'), d.cy || '', 'inputmode="numeric"')}${field('f-made', t('f.made'), d.made, 'list="countries"')}</div>
       <label class="field"><span>${esc(t('type'))}</span><select id="f-ty"><option value="">${esc(t('f.typeAuto'))}</option>${['m', 'ex', 'p', 'th', 'sth', 'cv', 'rlc', 'er'].map((k) => `<option value="${k}" ${d.ty === k ? 'selected' : ''}>${esc(t('type.' + k))}</option>`).join('')}</select></label>
       <datalist id="countries"><option>Malaysia</option><option>Thailand</option><option>China</option><option>Indonesia</option><option>Vietnam</option></datalist>`;
  const more = `<details class="more" ${rec ? 'open' : ''}><summary>${esc(t('add.moreSum'))}</summary><div class="stack">${moreCar}
    ${opt('prod') ? field('f-prod', t('f.prod'), rec?.prod || '', 'class="mono" autocapitalize="characters" placeholder="U48N"') : ''}
    ${field('f-loc', t('f.loc'), rec?.loc || '', '')}${field('f-note', t('f.note'), rec?.note || '', '')}</div></details>`;
  return `${A.edit ? '' : `<button type="button" class="link" data-act="add-back2">‹ ${esc(t('back'))}</button>`}
  <p class="stepl">${esc(A.edit ? t('edit.title') : t('add.s3'))}</p>
  <h2>${esc(A.edit ? t('edit.title') : (locked ? d.name : t('add.details')))}</h2>
  <div id="f-dup"></div><div class="stack formstack">${car}${colour}${basics}${photo}${more}</div>
  <div class="savebar"><button type="button" class="btn primary" data-act="f-save">${esc(A.edit ? t('save') : t('f.add'))}</button></div>`;
}
acts['add-back2'] = () => { if (A.key && variantsOf(A.key).length && !A.manual) { A.step = 'variants'; setSheet(variantsHTML()); } else { A.step = 'search'; setSheet(searchHTML()); } };

function readForm() {
  const d = A.draft; const g = (id) => ($('#' + id)?.value ?? '').trim();
  if (!A.vid || A.edit) {
    d.name = g('f-name') || d.name; d.base = g('f-base'); d.toy = g('f-toy'); d.col = g('f-colname'); d.ser = g('f-ser');
    d.y = Number(g('f-y')) || 0; d.cy = Number(g('f-cy')) || 0; d.made = g('f-made'); d.ty = $('#f-ty')?.value || '';
    if (!d.cf && d.col) d.cf = colorFamily(d.col);
  } else {
    if (!d.base) d.base = g('f-base');
    d.col = g('f-colname'); if (!d.cf && d.col) d.cf = colorFamily(d.col);
  }
  return { prod: g('f-prod'), qty: Math.max(1, Number(g('f-qty')) || 1), st: $('#f-st')?.value || 'loose', loc: g('f-loc'), note: g('f-note') };
}

/** While typing a hand-made car's name, offer matching models from the catalogue so it joins the same model (duplicates, rarity). */
function refreshSugg() {
  const sg = $('#f-sugg'); if (!sg || !A || A.vid || A.edit) return;
  const q = ($('#f-name')?.value || '').trim();
  const list = q.length >= 3 ? searchCastings(q, 4).filter((c) => norm(c.name) !== norm(q)) : [];
  sg.innerHTML = list.length ? `<p class="mu small">${esc(t('add.sugg'))}</p><div class="chips wrapc">${list.map((c) => `<button type="button" class="pl" data-act="f-usename" data-key="${esc(c.key)}">${esc(c.name)} · ${esc(c.count ? t('add.nvar', { n: c.count }) : t('add.yours'))}</button>`).join('')}</div>` : '';
}
acts['f-usename'] = (el) => {
  const c = castingByKey(el.dataset.key); if (!c) return;
  $('#f-name').value = c.name;
  const b = $('#f-base'); if (b && !b.value && c.bases?.size === 1) b.value = [...c.bases][0];
  refreshSugg(); refreshDup();
};

function refreshDup() {
  refreshSugg();
  const box = $('#f-dup'); if (!box || !A?.draft || A.edit) return;
  const d = A.draft; const name = $('#f-name')?.value ?? d.name;
  if (!name) { box.innerHTML = ''; return; }
  const ser = $('#f-ser')?.value ?? d.ser;
  const v = verdict(castKey(name), { cf: d.cf, ser, vid: A.vid, mode: opt('dup'), prod: $('#f-prod')?.value });
  if (v.level === 'green') { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="verdict ${v.level === 'red' ? 'has' : 'other'}"><strong>${esc(t('v.' + v.level + '.' + v.reason))}</strong>${v.cols.length ? `<div class="mini">${v.cols.map((c) => `${dot(c)} ${esc(cname(c))}`).join(' ')}</div>` : ''}
  ${v.level === 'red' ? `<label class="field chk"><input type="checkbox" data-ch="f-sep" ${A.sep ? 'checked' : ''}> <span>${esc(t('add.separate'))}</span></label>` : ''}</div>`;
}
ins['f-dup'] = refreshDup;
chs['f-sep'] = (el) => { if (A) A.sep = el.checked; };
ins['f-basefill'] = (el) => {
  const code = codeKey(el.value); if (code.length < 5) return;
  const key = [...(searchCastings(code, 1))].find((c) => c.score >= 100)?.key;
  const c = key && castingByKey(key);
  if (c && !$('#f-name').value) { $('#f-name').value = c.name; refreshDup(); }
};
acts['f-col'] = (el) => {
  A.draft.cf = A.draft.cf === el.dataset.v ? '' : el.dataset.v;
  $$('[data-act="f-col"]').forEach((b) => { const on = b.dataset.v === A.draft.cf; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  refreshDup();
};
chs['f-photo'] = async (el) => {
  const f = el.files[0]; if (!f) return;
  try {
    const r = await readPhoto(f, opt('photo')); A.photo = r.url;
    const im = $('#f-prev'); im.src = r.url; im.hidden = false;
    if (opt('auto') && r.cf && !A.draft.cf && (A.manual || A.edit)) { A.draft.cf = r.cf; $$('[data-act="f-col"]').forEach((b) => b.classList.toggle('on', b.dataset.v === r.cf)); toast(t('add.colourDetected', { c: cname(r.cf) })); refreshDup(); }
  } catch { toast(t('err.photo')); }
};

acts['f-save'] = async () => {
  const x = readForm(); const d = A.draft;
  if (!d.name) { $('#f-name')?.focus(); toast(t('f.needName')); return; }
  const before = completedSet();
  const snap = makeSnap({ ...d, ty: d.ty || classifyType(d.ser) });
  if (A.edit) {
    const rec = A.edit; rec.snap = { ...rec.snap, ...snap }; rec.qty = x.qty; rec.prod = codeKey(x.prod); rec.st = x.st; rec.loc = x.loc; rec.note = x.note;
    if (A.photo) rec.photo = A.photo;
    await saveOwned(rec); closeSheet(); hooks.refresh(); toast(t('saved')); return;
  }
  const { merged } = await addOwned({ vid: A.vid, snap, qty: x.qty, prod: x.prod, loc: x.loc, st: x.st, note: x.note, photo: A.photo, separate: !!A.sep });
  const wl = S.profile.wish || [];
  const wl2 = wl.filter((x) => !(x.key === snap.key && (!x.cf || x.cf === snap.cf)));
  if (wl2.length !== wl.length) { S.profile.wish = wl2; await saveProfile(); }
  closeAllSheets(); hooks.refresh();
  const after = completedSet(); const done = [...after].some((id) => !before.has(id));
  if (done) { confetti(); buzz([40, 30, 40]); toast('🎉 ' + t('series.completed')); } else toast(merged ? t('add.merged') : t('add.added', { n: snap.name }));
};

function completedSet() {
  try { return new Set(progress().filter((g) => g.have === g.total).map((g) => g.id)); } catch { return new Set(); }
}

/* =============================== CAR DETAIL =============================== */
function carHTML(o) {
  const s = o.snap; const sibs = variantsOf(s.key);
  const r = rarityBreakdown(s);
  const rows = [[t('f.base'), s.base], [t('f.toy'), s.toy], [t('f.alt'), s.alt], [t('f.series'), s.ser], [t('f.year'), s.y || ''], [t('f.castYear'), s.cy ? `© ${s.cy}` : ''], [t('f.made'), s.made], [t('f.prod'), opt('prod') ? o.prod : ''], [t('f.num'), s.num], [t('type'), typeLabel(s.ty)]].filter((x) => x[1]);
  const mine = ownedOf(s.key).filter((x) => x.id !== o.id);
  return `<div class="hero" id="hero">${o.photo ? `<img src="${o.photo}" alt="" class="heroimg">` : dot(s.cf, 'xl')}</div>
  <h2>${esc(s.name)}</h2>
  <div class="row wrap">${s.base ? `<span class="chip mono">${esc(s.base)}</span>` : ''}${dot(s.cf)}<span class="mu">${esc(s.col || cname(s.cf))}</span>${pill(s)}</div>
  <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  <div class="card row"><b class="g">${esc(t('f.qty'))}</b><button type="button" class="pl" data-act="car-qty" data-id="${o.id}" data-d="-1" aria-label="−">−</button><b class="big">${o.qty}</b><button type="button" class="pl" data-act="car-qty" data-id="${o.id}" data-d="1" aria-label="+">+</button></div>
  ${o.qty > 1 ? `<p class="warn">⚠ ${esc(t('car.dupWarn'))}</p>` : ''}
  <label class="field"><span>${esc(t('f.loc'))}</span><input value="${esc(o.loc)}" data-ch="car-loc" data-id="${o.id}"></label>
  ${opt('carded') ? `<label class="field"><span>${esc(t('f.status'))}</span><select data-ch="car-st" data-id="${o.id}"><option value="loose" ${o.st !== 'carded' ? 'selected' : ''}>${esc(t('loose'))}</option><option value="carded" ${o.st === 'carded' ? 'selected' : ''}>${esc(t('carded'))}</option></select></label>` : ''}
  ${o.note ? `<p class="mu">${esc(o.note)}</p>` : ''}
  ${sibs.length ? `<p class="mu">${esc(t('car.variants', { n: sibs.length, m: new Set(own.byKey.get(s.key)?.map((x) => x.vid).filter(Boolean)).size }))}</p><div class="sw">${sibs.slice(0, 60).map((v) => `<span class="dot lg" title="${esc(v.col)}" style="background:${PALETTE[v.cf] || 'transparent'};opacity:${own.byVid.has(v.id) ? 1 : 0.25}"></span>`).join('')}</div>` : ''}
  ${mine.length ? `<p class="mu">${esc(t('car.otherOwned'))}: ${mine.map((x) => esc(x.snap.col || cname(x.snap.cf))).join(', ')}</p>` : ''}
  <div class="row wrap"><button type="button" class="btn s" data-act="rarity-how" data-id="${o.id}">${esc(t('rarity.how'))}</button><button type="button" class="btn s" data-act="car-edit" data-id="${o.id}">${esc(t('edit'))}</button></div>
  <button type="button" class="btn danger" data-act="car-del" data-id="${o.id}">${esc(t('car.remove'))}</button>`;
}

export function openCar(id, fromEl) {
  const o = own.list.find((x) => x.id === id); if (!o) return;
  const { body } = openSheet(carHTML(o));
  flip(fromEl?.querySelector('.thumb, .dot') || fromEl, $('#hero', body));
}
const rerenderCar = (o) => { setSheet(carHTML(o)); hooks.refresh(); };
acts['car-qty'] = async (el) => { const o = own.list.find((x) => x.id === el.dataset.id); o.qty = Math.max(1, o.qty + Number(el.dataset.d)); await saveOwned(o); rerenderCar(o); };
chs['car-loc'] = async (el) => { const o = own.list.find((x) => x.id === el.dataset.id); o.loc = el.value.trim(); await saveOwned(o); hooks.refresh(); };
chs['car-st'] = async (el) => { const o = own.list.find((x) => x.id === el.dataset.id); o.st = el.value; await saveOwned(o); hooks.refresh(); };
acts['car-edit'] = (el) => {
  const o = own.list.find((x) => x.id === el.dataset.id); closeSheet();
  A = { step: 'form', q: '', key: o.snap.key, cf: '', ser: '', photo: '', draft: { ...o.snap }, edit: o, vid: o.vid, manual: true, ocr: '' };
  openSheet(formHTML(), { onClose: () => { A = null; } });
};
let delArm = 0;
acts['car-del'] = async (el) => {
  if (Date.now() - delArm > 4000) { delArm = Date.now(); el.textContent = t('confirmTap'); return; }
  await removeOwned(el.dataset.id); delArm = 0; closeSheet(); hooks.refresh(); toast(t('removed'));
};

/* =============================== RARITY SHEET =============================== */
acts['rarity-how'] = (el) => {
  const o = el?.dataset?.id && own.list.find((x) => x.id === el.dataset.id);
  const r = o ? rarityBreakdown(o.snap) : null;
  openSheet(`<h2>${esc(t('rarity.how'))}</h2><p>${esc(t('rarity.est'))}</p>
  ${r ? `<div class="card"><div class="row"><b class="g">${esc(o.snap.name)}</b><span class="chip pill" style="background:${TIER_COLORS[r.tier]}">${r.score} · ${esc(tierName(r.tier))}</span></div>
  <dl class="kv">${r.parts.filter((p) => p.pts).map((p) => `<dt>${esc(t('rarity.p.' + p.id))}</dt><dd>+${p.pts}</dd>`).join('')}</dl></div>` : ''}
  <p class="mu">${esc(t('rarity.formula', { m: BASE_POINTS.m, p: BASE_POINTS.p, th: BASE_POINTS.th, sth: BASE_POINTS.sth }))}</p>
  <p class="mu">${esc(t('rarity.tiers', { a: TIERS[0], b: TIERS[1], c: TIERS[2], d: TIERS[3] }))}</p>
  <button type="button" class="btn s" data-act="sheet-close">${esc(t('close'))}</button>`);
};

/* =============================== ONBOARDING =============================== */
const CAT_IDS = ['jdm', 'european', 'muscle', 'exotics', 'trucks', 'racing', 'fantasy', 'classics', 'movie'];
const ERA_IDS = ['pre80', '80s', '90s', '00s', 'new'];
const BRAND_PICK = ['Toyota', 'Nissan', 'Honda', 'Mazda', 'Subaru', 'Ford', 'Chevrolet', 'Dodge', 'Porsche', 'BMW', 'Audi', 'Mercedes-Benz', 'Volkswagen', 'Lamborghini', 'Ferrari', 'McLaren', 'Jeep', 'Volvo'];
const THEME_IDS = ['track', 'purple', 'show', 'neon'];
let ob = 0;

export function openOnboarding() {
  ob = 0;
  openSheet(obHTML(), { onClose: async () => { if (!S.profile.onboarded) { S.profile.onboarded = true; await saveProfile(); hooks.refresh(); } } });
}

const chipRow = (ids, label, sel, act) => `<div class="chips wrapc">${ids.map((id) => `<button type="button" class="pl ${sel.includes(id) ? 'on' : ''}" data-act="${act}" data-v="${esc(id)}" aria-pressed="${sel.includes(id)}">${esc(label(id))}</button>`).join('')}</div>`;

function obHTML() {
  const p = S.profile, pf = p.prefs; const N = 4;
  const dots = `<div class="dots">${Array.from({ length: N }, (_, i) => `<i class="${i === ob ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (ob === 0) {
    body = `<h2>${esc(t('ob.welcome'))}</h2><p class="mu">${esc(t('ob.local'))}</p>
    ${field('ob-name', t('ob.name'), p.name, 'data-in="ob-name" autocomplete="nickname"')}
    <div class="fieldlab">${esc(t('language'))}</div><div class="chips wrapc">${['en', 'ro'].map((l) => `<button type="button" class="pl ${p.lang === l ? 'on' : ''}" data-act="ob-lang" data-v="${l}">${l === 'en' ? 'English' : 'Română'}</button>`).join('')}</div>
    <div class="fieldlab">${esc(t('theme'))}</div>${chipRow(THEME_IDS, (x) => t('theme.' + x), [p.theme], 'ob-theme')}`;
  } else if (ob === 1) {
    body = `<h2>${esc(t('ob.like'))}</h2><div class="fieldlab">${esc(t('ob.cats'))}</div>${chipRow(CAT_IDS, (x) => t('cat.' + x), pf.cats, 'ob-cat')}
    <div class="fieldlab">${esc(t('ob.brands'))}</div>${chipRow(BRAND_PICK, (x) => x, pf.brands, 'ob-brand')}
    <div class="fieldlab">${esc(t('ob.eras'))}</div>${chipRow(ERA_IDS, (x) => t('era.' + x), pf.eras, 'ob-era')}`;
  } else if (ob === 2) {
    body = `<h2>${esc(t('ob.how'))}</h2>
    ${chipRow(['carded', 'loose', 'both'], (x) => t('how.' + x), [pf.how], 'ob-how')}
    <div class="fieldlab">${esc(t('ob.goal'))}</div>${chipRow(['series', 'models', 'th', 'fun'], (x) => t('goal.' + x), [pf.goal], 'ob-goal')}
    <div class="fieldlab">${esc(t('ob.count'))}</div>${chipRow(['0-25', '26-100', '101-300', '300+'], (x) => x, [pf.count], 'ob-count')}`;
  } else {
    body = `<h2>${esc(t('ob.more'))}</h2>
    <div class="fieldlab">${esc(t('ob.buy'))}</div>${chipRow(['super', 'toy', 'online', 'fairs'], (x) => t('buy.' + x), pf.buy, 'ob-buy')}
    <div class="fieldlab">${esc(t('ob.lines'))}</div>${chipRow(['m', 'p', 'th', 'rlc'], (x) => t('line.' + x), pf.lines, 'ob-line')}
    <div class="fieldlab">${esc(t('ob.dup'))}</div>${chipRow(['exact', 'model'], (x) => t('dup.' + x), [p.opts.dup], 'ob-dup')}<p class="mu">${esc(t('ob.dupHelp'))}</p>`;
  }
  return `${dots}${body}<div class="row"><button type="button" class="btn s" data-act="ob-skip">${esc(ob === 0 ? t('skip') : t('back'))}</button><button type="button" class="btn primary" data-act="ob-next">${esc(ob === N - 1 ? t('ob.done') : t('next'))}</button></div>`;
}
const obRedraw = () => { const b = $('.pn-body:last-child'); setSheet(obHTML()); return b; };
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
ins['ob-name'] = (el) => { S.profile.name = el.value; };
acts['ob-lang'] = (el) => { S.profile.lang = el.dataset.v; setLang(S.profile.lang); hooks.refresh(); setSheet(obHTML()); };
acts['ob-theme'] = (el) => { S.profile.theme = el.dataset.v; hooks.applyTheme(); setSheet(obHTML()); };
acts['ob-cat'] = (el) => { S.profile.prefs.cats = toggle(S.profile.prefs.cats, el.dataset.v); el.classList.toggle('on'); };
acts['ob-brand'] = (el) => { S.profile.prefs.brands = toggle(S.profile.prefs.brands, el.dataset.v); el.classList.toggle('on'); };
acts['ob-era'] = (el) => { S.profile.prefs.eras = toggle(S.profile.prefs.eras, el.dataset.v); el.classList.toggle('on'); };
acts['ob-buy'] = (el) => { S.profile.prefs.buy = toggle(S.profile.prefs.buy, el.dataset.v); el.classList.toggle('on'); };
acts['ob-line'] = (el) => { S.profile.prefs.lines = toggle(S.profile.prefs.lines, el.dataset.v); el.classList.toggle('on'); };
acts['ob-how'] = (el) => { S.profile.prefs.how = el.dataset.v; S.profile.opts.carded = el.dataset.v !== 'loose'; setSheet(obHTML()); };
acts['ob-goal'] = (el) => { S.profile.prefs.goal = el.dataset.v; setSheet(obHTML()); };
acts['ob-count'] = (el) => { S.profile.prefs.count = el.dataset.v; setSheet(obHTML()); };
acts['ob-dup'] = (el) => { S.profile.opts.dup = el.dataset.v; setSheet(obHTML()); };
acts['ob-skip'] = async () => { if (ob === 0) { closeSheet(); } else { ob--; setSheet(obHTML()); } };
acts['ob-next'] = async () => { if (ob < 3) { ob++; setSheet(obHTML()); return; } S.profile.onboarded = true; await saveProfile(); closeSheet(); hooks.refresh(); };

/* =============================== PROFILES =============================== */
export function openProfiles() {
  const rows = S.profiles.map((p) => `<div class="card row"><button type="button" class="g linkrow" data-act="prof-switch" data-id="${p.id}"><b>${esc(p.name || t('profile.unnamed'))}</b>${p.id === S.profile.id ? ` <span class="chip ok">${esc(t('profile.active'))}</span>` : ''}${p.pin ? ' 🔒' : ''}</button>${S.profiles.length > 1 ? `<button type="button" class="pl" data-act="prof-del" data-id="${p.id}" aria-label="${esc(t('delete'))}">✕</button>` : ''}</div>`).join('');
  openSheet(`<h2>${esc(t('profile.title'))}</h2><p class="mu">${esc(t('profile.help'))}</p>${rows}${field('prof-new', t('profile.newName'), '', 'autocomplete="off"')}<button type="button" class="btn primary" data-act="prof-add">${esc(t('profile.add'))}</button><button type="button" class="btn s" data-act="sheet-close">${esc(t('close'))}</button>`);
}
acts['prof-switch'] = async (el) => { await switchProfile(el.dataset.id); setLang(S.profile.lang); closeAllSheets(); hooks.applyTheme(); hooks.refresh(); hooks.maybeLock(); };
acts['prof-add'] = async () => { const n = $('#prof-new').value.trim() || t('profile.unnamed'); const p = await createProfile(n); await switchProfile(p.id); setLang(p.lang); closeAllSheets(); hooks.refresh(); openOnboarding(); };
let pdel = '';
acts['prof-del'] = async (el) => {
  if (pdel !== el.dataset.id) { pdel = el.dataset.id; el.textContent = t('confirmTap'); return; }
  await deleteProfile(el.dataset.id); pdel = ''; closeAllSheets(); hooks.refresh(); openProfiles();
};

/* =============================== ABOUT =============================== */
export function openAbout() {
  const m = cat.manifest;
  const src = m?.source;
  openSheet(`<h2>${esc(t('about.title'))}</h2>
  <p>${esc(t('about.mattel'))}</p>
  <h3>${esc(t('about.privacy'))}</h3><p>${esc(t('about.privacyText'))}</p>
  <h3>${esc(t('about.sources'))}</h3>
  <p>${esc(t('about.dataText'))}</p>
  ${src ? `<p class="mu">${esc(src.name)} — <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.url)}</a><br>${esc(src.license)} — <a href="${esc(src.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(src.licenseUrl)}</a></p>` : ''}
  ${m ? `<p class="mu">${esc(t('about.dataset', { v: m.version, d: fmtDate(m.built), n: cat.list.length }))}${m.seed ? ' ' + esc(t('about.seed')) : ''}</p>` : ''}
  <h3>${esc(t('about.libs'))}</h3>
  <ul class="mu"><li>Tesseract.js, tesseract.js-core — Apache-2.0</li><li>Barlow Condensed, IBM Plex Sans, IBM Plex Mono — SIL Open Font License 1.1</li></ul>
  <p class="mu">${esc(t('about.license'))}</p>
  <button type="button" class="btn s" data-act="sheet-close">${esc(t('close'))}</button>`);
}
acts['open-about'] = openAbout;
acts['open-profiles'] = openProfiles;
acts['open-onboarding'] = openOnboarding;
acts['sheet-close'] = () => closeSheet();
