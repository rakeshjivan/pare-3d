/*
 * Build 94: the tooth finder's weights, kept in this browser's IndexedDB once the user has loaded
 * them (they are not part of Pare 3D). One record: the file's bytes and its name.
 */
const DB_NAME = "pare3d-tooth-finder";
const STORE = "weights";
const KEY = "finder";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser keeps no local database")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the tooth finder store"));
  });
}

export type StoredFinder = { name: string; bytes: ArrayBuffer; addedAt: number };

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      let result: T | undefined;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("The tooth finder store could not be used"));
    });
  } finally { db.close(); }
}

export async function loadStoredFinder(): Promise<StoredFinder | null> {
  try { return ((await run("readonly", (s) => s.get(KEY))) as StoredFinder | undefined) ?? null; } catch { return null; }
}
export async function storeFinder(name: string, bytes: ArrayBuffer) {
  await run("readwrite", (s) => s.put({ name, bytes, addedAt: Date.now() } satisfies StoredFinder, KEY));
}
export async function forgetFinder() {
  await run("readwrite", (s) => s.delete(KEY));
}
