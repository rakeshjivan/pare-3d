/**
 * Fork (build 16): names under the toolbar icons for anyone who wants them, not only in Simple
 * mode. Remembered in this browser; fork.css shows them through html[data-tool-names="on"].
 */
const STORAGE_KEY = "pare3d.toolNames";

export function readToolNames(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function applyToolNames(on: boolean) {
  if (on) document.documentElement.dataset.toolNames = "on";
  else delete document.documentElement.dataset.toolNames;
}

export function setToolNames(on: boolean) {
  applyToolNames(on);
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Still applies for this visit.
  }
}
