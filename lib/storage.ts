/** Tiny IndexedDB key-value store (same database name as the single-file HTML version). */
const DB_NAME = "readmoo-highlights";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbPromise = null; reject(r.error); };
    });
  }
  return dbPromise;
}

export async function kvGet<T = unknown>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const q = d.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => resolve(q.result as T | undefined);
    q.onerror = () => reject(q.error);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function kvDel(key: string): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
