/**
 * Build 85: the look of the 3D view - the workplane (plate and grid), no workplane, or Meshmixer's dark
 * background with a light that follows the camera. Remembered in this browser.
 */
export type ViewLook = "plate" | "clear" | "dark";
const KEY = "pare3d.viewLook";
export function readViewLook(): ViewLook {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "clear" || stored === "dark" ? stored : "plate";
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
