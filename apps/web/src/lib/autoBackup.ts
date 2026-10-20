/**
 * Fork: automatic backups into a folder the user picks (File System Access
 * API: Chrome and Edge). Every few minutes, when a design has changed, the
 * same ZIP that "Back up all" makes is written there: one file per day
 * (overwritten during the day) and the last 14 days kept.
 *
 * The folder handle lives in IndexedDB. After a reload the browser may ask
 * for permission again; that needs a click, so the status says "paused"
 * until the user resumes it.
 */

const DB_NAME = "pare3d-auto-backup";
const STORE = "handles";
const KEY = "folder";
export const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const KEEP_DAYS = 14;
const FILE_PREFIX = "Pare 3D backup ";

type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  values?: () => AsyncIterable<FileSystemHandle>;
};

export type AutoBackupStatus =
  | { state: "unsupported" }
  | { state: "off" }
  | { state: "paused"; folder: string }
  | { state: "on"; folder: string; lastBackup: number | null; error?: string };

let status: AutoBackupStatus = { state: "off" };
let handle: DirectoryHandle | null = null;
const listeners = new Set<() => void>();

function setStatus(next: AutoBackupStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

export function getAutoBackupStatus() {
  return status;
}

export function subscribeAutoBackup(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function autoBackupSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeHandle(value: DirectoryHandle | null) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    if (value) tx.objectStore(STORE).put(value, KEY);
    else tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadHandle(): Promise<DirectoryHandle | null> {
  const db = await openDb();
  const value = await new Promise<DirectoryHandle | null>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

/** Reads the remembered folder at start-up. */
export async function initAutoBackup() {
  if (!autoBackupSupported()) {
    setStatus({ state: "unsupported" });
    return;
  }
  try {
    handle = await loadHandle();
  } catch {
    handle = null;
  }
  if (!handle) {
    setStatus({ state: "off" });
    return;
  }
  const permission = await handle.queryPermission?.({ mode: "readwrite" }).catch(() => "prompt" as PermissionState);
  setStatus(permission === "granted" ? { state: "on", folder: handle.name, lastBackup: null } : { state: "paused", folder: handle.name });
}

/** Asks for a folder (needs a click). */
export async function chooseAutoBackupFolder() {
  const picker = (window as unknown as { showDirectoryPicker: (options: object) => Promise<DirectoryHandle> }).showDirectoryPicker;
  const picked = await picker({ id: "pare3d-backup", mode: "readwrite", startIn: "documents" });
  handle = picked;
  await storeHandle(picked).catch(() => undefined);
  setStatus({ state: "on", folder: picked.name, lastBackup: null });
}

/** Asks again for the permission a reload took away (needs a click). */
export async function resumeAutoBackup() {
  if (!handle) return;
  const permission = await handle.requestPermission?.({ mode: "readwrite" }).catch(() => "denied" as PermissionState);
  if (permission === "granted") setStatus({ state: "on", folder: handle.name, lastBackup: null });
}

export async function turnOffAutoBackup() {
  handle = null;
  await storeHandle(null).catch(() => undefined);
  setStatus({ state: "off" });
}

function dayStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Writes one backup when switched on and allowed; returns whether it did. */
export async function writeAutoBackup(blob: Blob): Promise<boolean> {
  if (!handle || status.state !== "on") return false;
  const now = new Date();
  try {
    const file = await handle.getFileHandle(`${FILE_PREFIX}${dayStamp(now)}.zip`, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    // Keep the newest KEEP_DAYS daily files.
    if (handle.values) {
      const names: string[] = [];
      for await (const entry of handle.values()) {
        if (entry.kind === "file" && entry.name.startsWith(FILE_PREFIX) && entry.name.endsWith(".zip")) names.push(entry.name);
      }
      names.sort().reverse().slice(KEEP_DAYS).forEach((name) => void handle?.removeEntry(name).catch(() => undefined));
    }
    setStatus({ state: "on", folder: handle.name, lastBackup: now.getTime() });
    return true;
  } catch (error) {
    setStatus({ state: "on", folder: handle.name, lastBackup: status.state === "on" ? status.lastBackup : null, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
