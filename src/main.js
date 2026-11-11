import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-ext-600.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-ext-800.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-ext-600.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import './styles.css';

import { t, setLang } from './i18n.js';
import { initStore, S, isDark } from './store.js';
import { loadCatalogue, syncCatalogue, cat } from './catalogue.js';
import { acts, ins, chs, hooks } from './registry.js';
import { maybeShowNews, markNewsSeen } from './news.js';
import { toastAction, toast, $, $$, closeSheet, sheetOpen } from './ui.js';
import { VIEWS, refreshStorage } from './views.js';
import { openOnboarding } from './sheets.js';
import { hashPin } from './crypto.js';

const TABS = [['col', '▦'], ['chk', '✓'], ['ser', '◎'], ['sta', '▮'], ['set', '⚙']];

function applyTheme() {
  const p = S.profile;
  document.documentElement.className = `t-${p.theme}${isDark() ? ' d' : ''}`;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#faf6f0';
}

export function render() {
  if (S.locked) return renderLock();
  applyTheme();
  document.body.classList.toggle('shop', S.shop && S.tab === 'chk');
  const scroll = window.scrollY;
  $('#view').innerHTML = VIEWS[S.tab]();
  $('#nav').innerHTML = TABS.map(([k, ic]) => `<button type="button" class="${S.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}" ${S.tab === k ? 'aria-current="page"' : ''}><b aria-hidden="true">${ic}</b>${t('tab.' + k)}</button>`).join('');
  $('#fab').textContent = t('add.fab');
  $('#fab').hidden = S.tab === 'set' || (S.shop && S.tab === 'chk');
  $('#lock').hidden = true;
  window.scrollTo(0, scroll);
}

/* ---------- lock screen ---------- */
function renderLock() {
  applyTheme();
  const l = $('#lock'); l.hidden = false;
  l.innerHTML = `<div class="lockbox"><h1>${t('app.name')}</h1><p class="mu">${t('pin.enter', { n: S.profile.name || '' })}</p><input id="lock-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" aria-label="PIN"><p id="lock-err" class="warn"></p><button type="button" class="btn primary" data-act="unlock">${t('unlock')}</button>${S.profiles.length > 1 ? `<button type="button" class="btn s" data-act="open-profiles-lock">${t('profile.title')}</button>` : ''}</div>`;
  $('#lock-pin').focus();
}
acts.unlock = async () => {
  const v = $('#lock-pin').value, p = S.profile.pin;
  if (p && (await hashPin(v, p.salt)) === p.hash) { S.locked = false; render(); } else { $('#lock-err').textContent = t('pin.wrong'); $('#lock-pin').value = ''; }
};
acts['open-profiles-lock'] = async () => {
  const { switchProfile } = await import('./store.js');
  const i = (S.profiles.findIndex((p) => p.id === S.profile.id) + 1) % S.profiles.length;
  await switchProfile(S.profiles[i].id); setLang(S.profile.lang); render();
};

hooks.refresh = render;
hooks.applyTheme = applyTheme;
hooks.setLang = setLang;
hooks.maybeLock = () => { if (S.profile.pin) { S.locked = true; } render(); };

acts.tab = (el) => { S.tab = el.dataset.v; if (S.tab !== 'chk') S.shop = false; render(); window.scrollTo(0, 0); };

/* ---------- delegated events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = acts[el.dataset.act];
  if (fn) { if (el.tagName === 'A') return; fn(el, e); }
});
document.addEventListener('input', (e) => { const el = e.target.closest('[data-in]'); if (el) ins[el.dataset.in]?.(el, e); });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-ch]'); if (el) chs[el.dataset.ch]?.(el, e); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen()) closeSheet();
  if (e.key === 'Enter' && e.target.id === 'lock-pin') acts.unlock();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (S.profile?.mode === 'sys') applyTheme(); });

/* ---------- database install / update (never blocks the UI) ---------- */
function skeleton(msg, pct = 0) {
  const b = $('#boot'); b.hidden = false;
  b.innerHTML = `<div class="bootbox"><h1>${t('app.name')}</h1><p>${msg}</p><div class="progbar"><i style="width:${pct}%"></i></div><div class="skel"><i></i><i></i><i></i></div></div>`;
}

async function installDatabase(first) {
  if (first) skeleton(t('boot.installing'));
  const r = await syncCatalogue({ onProgress: (p) => { if (first) skeleton(t('db.progress', { p: p.pct, mb: (p.bytes / 1048576).toFixed(1), tot: (p.totalBytes / 1048576).toFixed(1), eta: p.etaSec == null ? '…' : Math.ceil(p.etaSec) }), p.pct); } });
  $('#boot').hidden = true;
  if (r.status === 'updated') { render(); if (!r.first) toast(t('db.updated', { n: r.added }), 4000); }
  else if (r.status === 'offline' && first) toast(t('boot.offline'), 5000);
  return r;
}

let swReg = null; let lastCheck = 0;
const BUILD = typeof __APP_BUILD__ === 'undefined' ? 'dev' : __APP_BUILD__;

function registerSW() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    swReg = reg;
    const ask = (w) => { toastAction(t('update.available'), t('update.reload'), () => w.postMessage('SKIP_WAITING')); if (S.tab === 'set') render(); };
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 6 * 3600 * 1000);
    // An installed iPhone app is resumed, not reloaded: look for a new version every time it comes back to the front.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 5 * 60 * 1000) return;
      lastCheck = Date.now(); reg.update().catch(() => {});
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

/** Is a newer app version waiting on this device? */
hooks.updateReady = () => !!(swReg && swReg.waiting && navigator.serviceWorker.controller);

/** Throw away the cached app files (not your cars, not the database) and load everything fresh. */
async function cleanReload() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  for (const k of await caches.keys()) if (k.startsWith('cc-shell-') || k === 'cc-other') await caches.delete(k);
  location.reload();
}

/** Settings button. Returns: 'current' | 'applying' | 'offline' | 'unsupported'. */
hooks.checkUpdate = async ({ force = false } = {}) => {
  if (!('serviceWorker' in navigator) || !swReg) return 'unsupported';
  if (swReg.waiting) { swReg.waiting.postMessage('SKIP_WAITING'); return 'applying'; }
  let live;
  try { live = await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { return 'offline'; }
  if (live.build === BUILD && !force) { swReg.update().catch(() => {}); return 'current'; }
  await cleanReload();
  return 'applying';
};

async function boot() {
  try {
    await initStore();
    setLang(S.profile.lang);
    S.f.sort = 'new';
    render();
    await loadCatalogue();
    render();
    navigator.storage?.persist?.().catch(() => {});
    refreshStorage();
    const first = cat.list.length === 0;
    registerSW();
    installDatabase(first).catch(() => { $('#boot').hidden = true; });
    if (!S.profile.onboarded && !S.locked) { markNewsSeen(); setTimeout(openOnboarding, 500); } else if (!S.locked) setTimeout(maybeShowNews, 900);
  } catch (e) {
    $('#view').innerHTML = `<div class="card"><h2>${t('err.storage')}</h2><p class="mu">${String(e?.message || e)}</p></div>`;
  }
}
boot();
