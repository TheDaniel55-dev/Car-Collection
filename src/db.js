// Minimal IndexedDB wrapper. Everything lives on the device.
const NAME = 'car-collection';
const VER = 1;
let dbp;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('meta', { keyPath: 'k' });
      d.createObjectStore('variants', { keyPath: 'id' }).createIndex('y', 'y');
      d.createObjectStore('profiles', { keyPath: 'id' });
      d.createObjectStore('owned', { keyPath: 'id' }).createIndex('pid', 'pid');
      d.createObjectStore('codes', { keyPath: 'code' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbp;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export async function get(store, key) { const d = await openDB(); return wrap(d.transaction(store).objectStore(store).get(key)); }
export async function getAll(store) { const d = await openDB(); return wrap(d.transaction(store).objectStore(store).getAll()); }
export async function getAllBy(store, index, value) { const d = await openDB(); return wrap(d.transaction(store).objectStore(store).index(index).getAll(value)); }
export async function count(store) { const d = await openDB(); return wrap(d.transaction(store).objectStore(store).count()); }
export async function put(store, value) { const d = await openDB(); const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(value); return done(t); }
export async function putMany(store, values) {
  const d = await openDB(); const t = d.transaction(store, 'readwrite'); const s = t.objectStore(store);
  for (const v of values) s.put(v);
  return done(t);
}
export async function del(store, key) { const d = await openDB(); const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(key); return done(t); }
export async function clear(store) { const d = await openDB(); const t = d.transaction(store, 'readwrite'); t.objectStore(store).clear(); return done(t); }

/** Replace every catalogue row of one year with `rows` (atomic). */
export async function replaceYear(y, rows) {
  const d = await openDB(); const t = d.transaction('variants', 'readwrite'); const s = t.objectStore('variants');
  const cur = s.index('y').openKeyCursor(IDBKeyRange.only(y));
  cur.onsuccess = () => {
    const c = cur.result;
    if (c) { s.delete(c.primaryKey); c.continue(); } else { for (const r of rows) s.put(r); }
  };
  return done(t);
}

export async function deleteOwnedFor(pid) {
  const d = await openDB(); const t = d.transaction('owned', 'readwrite'); const s = t.objectStore('owned');
  const cur = s.index('pid').openKeyCursor(IDBKeyRange.only(pid));
  cur.onsuccess = () => { const c = cur.result; if (c) { s.delete(c.primaryKey); c.continue(); } };
  return done(t);
}

export const getMeta = async (k) => (await get('meta', k))?.v;
export const setMeta = (k, v) => put('meta', { k, v });
