/**
 * Build 85: the look of the 3D view - the workplane (plate and grid), no workplane, or Meshmixer's dark
 * background with a light that follows the camera. Remembered in this browser.
 */
/** Build 106: "studio" - the studio frame's soft light-grey ground, no plate. */
/** Build 106: "studioDark" - the same frame with a dark ground, for a pale scan that is hard to see. */
export type ViewLook = "plate" | "clear" | "dark" | "studio" | "studioDark";
const KEY = "pare3d.viewLook";
export function readViewLook(): ViewLook {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "clear" || stored === "dark" || stored === "studio" || stored === "studioDark" ? stored : "plate";
  } catch {
    return "plate";
  }
}
export function storeViewLook(look: ViewLook) {
  try { window.localStorage.setItem(KEY, look); } catch { /* holds for this visit */ }
}
/** Build 86: sets the look from the app (Dental Studio opening): remembered, drawn, and the switch follows. */
export const VIEW_LOOK_EVENT = "pare3d-view-look";
export function setViewLook(look: ViewLook) {
  storeViewLook(look);
  window.layerlingViewLook?.(look);
  window.dispatchEvent(new CustomEvent(VIEW_LOOK_EVENT, { detail: look }));
}

/** Build 106: the studio frame's dark-ground switch, remembered in this browser. */
const STUDIO_DARK_KEY = "pare3d.studioDark";
export function readStudioDark(): boolean {
  try { return window.localStorage.getItem(STUDIO_DARK_KEY) === "1"; } catch { return false; }
}
export function studioLook(): ViewLook {
  return readStudioDark() ? "studioDark" : "studio";
}
export function setStudioDark(on: boolean) {
  try { window.localStorage.setItem(STUDIO_DARK_KEY, on ? "1" : "0"); } catch { /* holds for this visit */ }
  setViewLook(on ? "studioDark" : "studio");
}
