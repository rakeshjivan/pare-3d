/**
 * Fork (build 22): where exports and backups go in the Pare 3D app. The app's own server (runtime 3)
 * keeps the folders and opens the system's folder picker and save dialog; in a plain browser, or in
 * an app installed before build 22, files download as a browser downloads them.
 */

export type FileSettings = { exports: string; backups: string; ask: boolean; downloads: string; home: string; platform: string; runtime: number };
export type SavedFile = { path: string; folder: string; name: string };

export const FILE_SAVED_EVENT = "pare3d:file-saved";
export const FILE_SETTINGS_EVENT = "pare3d:file-settings";
const HEADERS = { "x-pare3d-send": "1" };

let settingsRequest: Promise<FileSettings | null> | null = null;
let cached: FileSettings | null | undefined;

/** What is known without waiting (for a click that must open a dialog straight away). */
export function cachedFileSettings() {
  return cached;
}

/** The app's folder settings, or null where there are none to choose (a browser, an older app). */
export function getFileSettings(fresh = false): Promise<FileSettings | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!settingsRequest || fresh) {
    settingsRequest = fetch("/__files", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || response.headers.get("x-pare3d") !== "1") return null;
        const value = (await response.json()) as FileSettings;
        return Number(value.runtime) >= 3 ? value : null;
      })
      .catch(() => null)
      .then((value) => {
        cached = value;
        return value;
      });
  }
  return settingsRequest;
}

async function post(path: string, body?: BodyInit): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(path, { method: "POST", headers: HEADERS, body });
    return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function announceSettings() {
  void getFileSettings(true).then(() => window.dispatchEvent(new Event(FILE_SETTINGS_EVENT)));
}

/** Opens the system's folder picker; true when a new folder was chosen. */
export async function chooseFilesFolder(which: "exports" | "backups", prompt: string): Promise<boolean> {
  const answer = await post(`/__files/choose?which=${which}&prompt=${encodeURIComponent(prompt)}`);
  announceSettings();
  return answer?.chosen === true;
}

export async function resetFilesFolder(which: "exports" | "backups") {
  await post(`/__files/reset?which=${which}`);
  announceSettings();
}

export async function setAskWhereToSave(on: boolean) {
  await post(`/__files/ask?on=${on ? 1 : 0}`);
  announceSettings();
}

export function showFilesFolder(which: "exports" | "backups", file?: string) {
  void post(`/__files/show?which=${which}${file ? `&file=${encodeURIComponent(file)}` : ""}`);
}

function browserDownload(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Saves a file the person asked for: into their chosen folder (or where they pick, with "Ask each
 * time") in the app, as a download elsewhere. "saved" says where it went; "cancelled" when they
 * closed the save dialog; "downloaded" when the browser took it.
 */
export async function saveUserFile(name: string, blob: Blob, prompt = "Save"): Promise<"saved" | "cancelled" | "downloaded"> {
  const settings = await getFileSettings();
  if (settings) {
    const answer = await post(`/__files/save?name=${encodeURIComponent(name)}&prompt=${encodeURIComponent(prompt)}`, blob);
    if (answer?.cancelled) return "cancelled";
    if (answer && typeof answer.path === "string") {
      window.dispatchEvent(new CustomEvent<SavedFile>(FILE_SAVED_EVENT, { detail: answer as unknown as SavedFile }));
      return "saved";
    }
  }
  browserDownload(name, blob);
  return "downloaded";
}

/** A folder as people say it: "Downloads", "Documents › Pare 3D Backups", "Desktop › Prints". */
export function friendlyFolder(path: string, home = ""): string {
  let rest = path;
  if (home && path.toLowerCase().startsWith(home.toLowerCase())) rest = path.slice(home.length);
  const parts = rest.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return path;
  return parts.slice(-2).join(" › ");
}

/**
 * True inside a Pare 3D app installed before build 22: its new app files arrive by themselves,
 * but choosing folders needs the newer app, so it says to download it again.
 */
export async function isOlderApp(): Promise<boolean> {
  try {
    const response = await fetch("/__pare3d/update", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok || response.headers.get("x-pare3d") !== "1") return false;
    const state = (await response.json()) as { runtime?: number };
    return (Number(state.runtime) || 1) < 3;
  } catch {
    return false;
  }
}
