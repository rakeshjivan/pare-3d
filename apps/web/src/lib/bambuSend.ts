/**
 * Fork: "Send to Bambu Studio". Running from the Pare 3D Mac app (or its local
 * server), the file is handed to the server, saved in Documents/Pare 3D Exports
 * and opened in Bambu Studio. Anywhere else a web page cannot open another app,
 * so the file is downloaded instead and the message says so.
 */
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

/** Returns the message to show; throws only when nothing could be done. */
export async function sendToBambuStudio(fileName: string, blob: Blob, download: (name: string, blob: Blob) => Promise<void>): Promise<string> {
  let response: Response | null = null;
  try {
    response = await fetch(`/__send-to-bambu?name=${encodeURIComponent(fileName)}`, {
      method: "POST",
      headers: { "x-pare3d-send": "1", "content-type": "application/octet-stream" },
      body: blob,
    });
  } catch {
    response = null;
  }
  if (response && response.ok) {
    const result = (await response.json().catch(() => null)) as { opened?: boolean; path?: string; error?: string } | null;
    if (result?.opened) return `Sent to Bambu Studio: ${fileName}`;
    if (result?.path) {
      return `Saved ${fileName} in Documents › Pare 3D Exports, but Bambu Studio could not be opened${result.error ? ` (${result.error})` : ""}. Is it installed in Applications?`;
    }
  }
  await download(fileName, blob);
  return `Downloaded ${fileName}. A browser cannot open Bambu Studio by itself, so open the file there; the Pare 3D Mac app sends it straight in.`;
}
