// Tiny promise-based IndexedDB key/value store.
//
// Why this exists: the whole app database (transactions, jobs, invoices AND
// photos) used to live in localStorage, which is capped at ~5 MB per origin.
// Large imports and photos silently overflowed that cap and were lost. IndexedDB
// gives us hundreds of MB to GBs in the same browser, no login, works offline.
// We keep it deliberately minimal — one object store used as a key/value bag —
// so the rest of the app can treat it like localStorage, just bigger and async.

const DB_NAME = 'jobboks';
const STORE = 'kv';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Read a value. Returns null if missing or if IndexedDB is unavailable. */
export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Write a value. Objects are structured-cloned by IndexedDB (no JSON needed). */
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** True if the browser supports IndexedDB at all. */
export function idbSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}
