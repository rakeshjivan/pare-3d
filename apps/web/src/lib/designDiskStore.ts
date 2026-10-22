/**
 * Fork (build 32): inside the Pare 3D app the designs are kept on disk by its own server
 * (/__designs, runtime 5) instead of in the browser engine's IndexedDB. On a Mac that storage has a
 * quota of its own, and once it ran out every save failed ("Failed to OpenBackingStore ... not
 * enough space for domain"). Disk space is the only limit here.
 *
 * In a plain browser, or with an app server older than runtime 5, nothing answers and the page keeps
 * using IndexedDB as before.
 */

const ENDPOINT = "/__designs";
const ID = /^[A-Za-z0-9_-]{1,120}$/;

let availability: Promise<boolean> | null = null;

/** Whether the app's server keeps the designs. Asked once per page. */
export function designDiskAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || typeof fetch !== "function") return Promise.resolve(false);
  availability ??= (async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      if (!response.ok || response.headers.get("x-pare3d") !== "1") return false;
      const info = (await response.json()) as { runtime?: number; ids?: unknown };
      return Number(info.runtime) >= 5 && Array.isArray(info.ids);
    } catch {
      return false;
    }
  })();
  return availability;
}

/** Only for the tests: forget what was found. */
export function resetDesignDiskAvailability() {
  availability = null;
}

/** Whether a design id can be stored on disk (the server takes plain ids only). */
export function designDiskId(id: string) {
  return ID.test(id);
}

export async function designDiskList(): Promise<string[]> {
  const response = await fetch(ENDPOINT, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not list the designs on disk (${response.status})`);
  const info = (await response.json()) as { ids?: unknown };
  return Array.isArray(info.ids) ? info.ids.filter((id): id is string => typeof id === "string") : [];
}

export async function designDiskGet(id: string): Promise<{ revision: number; updatedAt: number; bytes: Uint8Array } | null> {
  if (!designDiskId(id)) return null;
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read the design from disk (${response.status})`);
  return {
    revision: Number(response.headers.get("x-revision")) || 0,
    updatedAt: Number(response.headers.get("x-updated-at")) || 0,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

/** Writes a design; false when the disk already holds a newer revision (nothing is written then). */
export async function designDiskPut(id: string, revision: number, bytes: Uint8Array): Promise<boolean> {
  if (!designDiskId(id)) throw new Error("This design's id cannot be stored on disk");
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}?revision=${encodeURIComponent(String(revision))}`, {
    method: "PUT",
    headers: { "x-pare3d-send": "1", "content-type": "application/octet-stream" },
    body: bytes as BodyInit,
  });
  const answer = (await response.json().catch(() => ({}))) as { saved?: boolean; error?: string };
  if (!response.ok) throw new Error(answer.error ? `Could not save the design to disk: ${answer.error}` : `Could not save the design to disk (${response.status})`);
  return answer.saved !== false;
}

export async function designDiskDelete(id: string): Promise<void> {
  if (!designDiskId(id)) return;
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-pare3d-send": "1" } });
  if (!response.ok) throw new Error(`Could not delete the design from disk (${response.status})`);
}
