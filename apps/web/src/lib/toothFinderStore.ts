/*
 * Build 94: the tooth finder's weights, kept in this browser's IndexedDB once the user has loaded
 * them. One record: the file's bytes and its name.
 * Build 101: CrossTooth (Xi et al., CVPR 2025, used with the authors' permission) comes with Pare 3D,
 * at /models/crosstooth.ptw: fetched the first time teeth are found, then kept here for offline use. A
 * file the user loads still takes its place.
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

/** Build 101: the tooth finder that comes with Pare 3D. */
export const BUILT_IN_FINDER = { name: "CrossTooth (built in)", url: "/models/crosstooth.ptw" };

/** The tooth finder's bytes: the one kept in this browser, or else the built-in one (fetched, then kept). */
export async function finderBytes(): Promise<ArrayBuffer | null> {
  const stored = await loadStoredFinder();
  if (stored) return stored.bytes;
  try {
    const response = await fetch(BUILT_IN_FINDER.url);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    try { await storeFinder(BUILT_IN_FINDER.name, bytes); } catch { /* used this time, fetched again next */ }
    return bytes;
  } catch {
    return null;
  }
}
