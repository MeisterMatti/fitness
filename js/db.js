// Speicher auf dem Gerät (IndexedDB). Alles bleibt lokal, nichts wird verschickt.
const DB_NAME = 'fitness-tracker';
const DB_VERSION = 1;
export const STORES = ['locations', 'exercises', 'sets', 'meta'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('no-indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('locations')) db.createObjectStore('locations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sets')) {
        const s = db.createObjectStore('sets', { keyPath: 'id' });
        s.createIndex('ts', 'ts');
        s.createIndex('exerciseId', 'exerciseId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('db-open'));
    req.onblocked = () => reject(new Error('db-blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('tx-error'));
    tx.onabort = () => reject(tx.error || new Error('tx-abort'));
  });
}

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAll() {
  const [locations, exercises, sets, meta] = await Promise.all(STORES.map(getAll));
  const metaObj = {};
  for (const m of meta) metaObj[m.key] = m.value;
  return { locations, exercises, sets, meta: metaObj };
}

/** Schreibt mehrere Änderungen in einem Rutsch: [{store, put: obj} | {store, del: id}] */
export async function write(ops) {
  if (!ops.length) return;
  const db = await openDB();
  const names = [...new Set(ops.map(o => o.store))];
  const tx = db.transaction(names, 'readwrite');
  for (const o of ops) {
    const st = tx.objectStore(o.store);
    if ('del' in o) st.delete(o.del); else st.put(o.put);
  }
  return done(tx);
}

export const put = (store, obj) => write([{ store, put: obj }]);
export const del = (store, id) => write([{ store, del: id }]);
export const setMeta = (key, value) => put('meta', { key, value });

export async function replaceAll(data) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  for (const l of data.locations) tx.objectStore('locations').put(l);
  for (const e of data.exercises) tx.objectStore('exercises').put(e);
  for (const s of data.sets) tx.objectStore('sets').put(s);
  for (const [key, value] of Object.entries(data.meta || {})) tx.objectStore('meta').put({ key, value });
  return done(tx);
}
