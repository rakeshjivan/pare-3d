/**
 * Fork: "Send to Bambu Studio". Running from the Pare 3D Mac app (or its local
 * server), the file is handed to the server, saved in Documents/Pare 3D Exports
 * and opened in Bambu Studio. Anywhere else a web page cannot open another app,
 * so the file is downloaded instead and the message says so.
 */
import { t } from "@/lib/i18n";

export type BambuSendFormat = "stl" | "3mf";

export const BAMBU_FORMAT_STORAGE_KEY = "pare3d.bambuFormat";
export const SEND_TO_BAMBU_EVENT = "pare3d:send-to-bambu";

export function readBambuFormat(): BambuSendFormat {
  try {
    return window.localStorage.getItem(BAMBU_FORMAT_STORAGE_KEY) === "3mf" ? "3mf" : "stl";
  } catch {
    return "stl";
  }
}

export function storeBambuFormat(format: BambuSendFormat) {
  try {
    window.localStorage.setItem(BAMBU_FORMAT_STORAGE_KEY, format);
  } catch {
    // The choice still holds for this visit.
  }
}

/**
 * Build 70: the slicers a design can be sent to. Resin slicers get an STL unless 3MF is chosen;
 * PreForm, CHITUBOX and Lychee read both.
 */
export const SLICERS = [
  { id: "bambu", name: "Bambu Studio", kind: "fdm" },
  { id: "orca", name: "OrcaSlicer", kind: "fdm" },
  { id: "prusa", name: "PrusaSlicer", kind: "fdm" },
  { id: "preform", name: "PreForm", kind: "resin" },
  { id: "chitubox", name: "CHITUBOX", kind: "resin" },
  { id: "lychee", name: "Lychee Slicer", kind: "resin" },
] as const;
export type SlicerId = (typeof SLICERS)[number]["id"];
export const SLICER_STORAGE_KEY = "pare3d.slicer";

export function slicerName(id: SlicerId) {
  return SLICERS.find((slicer) => slicer.id === id)?.name ?? "Bambu Studio";
}

export function readSlicer(): SlicerId {
  try {
    const stored = window.localStorage.getItem(SLICER_STORAGE_KEY);
    return SLICERS.some((slicer) => slicer.id === stored) ? (stored as SlicerId) : "bambu";
  } catch {
    return "bambu";
  }
}

export function storeSlicer(id: SlicerId) {
  try {
    window.localStorage.setItem(SLICER_STORAGE_KEY, id);
  } catch {
    // The choice still holds for this visit.
  }
}

/** Which slicers the app's server found installed; null in a browser or on an older app. */
export async function installedSlicers(): Promise<SlicerId[] | null> {
  try {
    const response = await fetch("/__slicers");
    if (!response.ok) return null;
    const answer = (await response.json()) as { installed?: string[] };
    return Array.isArray(answer.installed) ? (answer.installed.filter((id) => SLICERS.some((slicer) => slicer.id === id)) as SlicerId[]) : null;
  } catch {
    return null;
  }
}

async function post(path: string, blob: Blob) {
  try {
    return await fetch(path, { method: "POST", headers: { "x-pare3d-send": "1", "content-type": "application/octet-stream" }, body: blob });
  } catch {
    return null;
  }
}

/** Returns the message to show; throws only when nothing could be done. Sends to the slicer chosen in the menu. */
export async function sendToBambuStudio(fileName: string, blob: Blob, download: (name: string, blob: Blob) => Promise<void>): Promise<string> {
  return sendToSlicer(readSlicer(), fileName, blob, download);
}

export async function sendToSlicer(slicer: SlicerId, fileName: string, blob: Blob, download: (name: string, blob: Blob) => Promise<void>): Promise<string> {
  const app = slicerName(slicer);
  let response = await post(`/__send-to-slicer?app=${slicer}&name=${encodeURIComponent(fileName)}`, blob);
  // An app installed before build 70 has only the Bambu route.
  let olderApp = false;
  if (response && response.status === 404) {
    olderApp = true;
    response = slicer === "bambu" ? await post(`/__send-to-bambu?name=${encodeURIComponent(fileName)}`, blob) : null;
  }
  if (response && response.ok) {
    const result = (await response.json().catch(() => null)) as { opened?: boolean; path?: string; error?: string } | null;
    if (result?.opened) return t("slicer.sent", { app, name: fileName });
    if (result?.path) return t("slicer.savedNotOpened", { app, name: fileName });
  }
  await download(fileName, blob);
  if (olderApp) return t("slicer.olderApp", { app, name: fileName });
  return t("slicer.downloaded", { app, name: fileName });
}
