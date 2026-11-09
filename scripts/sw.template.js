/* Car collection service worker - generated at build time (version __VERSION__). */
const VERSION = '__VERSION__';
const SHELL = `cc-shell-${VERSION}`;
const DATA = 'cc-data';
const OTHER = 'cc-other';
const OCR = 'cc-ocr'; // kept across versions (large, rarely changes)
const SHELL_FILES = __SHELL__;
const DATA_FILES = __DATA__;
const OCR_FILES = __OCR__;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    const o = await caches.open(OCR);
    await Promise.all(OCR_FILES.map((u) => o.match(u).then((hit) => hit || o.add(u)).catch(() => {})));
    const d = await caches.open(DATA);
    await Promise.all(DATA_FILES.map((u) => d.match(u).then((hit) => hit || d.add(u)).catch(() => {})));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cc-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function networkFirst(req, name) {
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (r.ok) (await caches.open(name)).put(req, r.clone());
    return r;
  } catch { const hit = await caches.match(req, { ignoreSearch: false }); if (hit) return hit; throw new Error('offline'); }
}
async function cacheFirst(req, name, ignoreSearch = false) {
  const hit = await caches.match(req, { ignoreSearch });
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) (await caches.open(name)).put(req, r.clone());
  return r;
}
async function swr(req, name) {
  const c = await caches.open(name); const hit = await c.match(req);
  const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (req.mode === 'navigate') { e.respondWith(caches.match(new URL('index.html', self.registration.scope).href).then((r) => r || fetch(req))); return; }
  if (rel === 'data/manifest.json') { e.respondWith(networkFirst(req, DATA)); return; }
  if (rel.startsWith('data/')) { e.respondWith(cacheFirst(req, DATA)); return; }
  if (rel.startsWith('ocr/')) { e.respondWith(cacheFirst(req, OCR)); return; }
  if (rel.startsWith('assets/') || rel.startsWith('icons/')) { e.respondWith(cacheFirst(req, SHELL)); return; }
  e.respondWith(swr(req, OTHER));
});
