"use client";

/**
 * Build 99: how a selection is moved and turned in the view - Tinkercad's box (resize corners, size
 * marks, the lift arrow and the three turning arrows) or a gimbal like Meshmixer's, Medit's and Bambu
 * Studio's (three arrows to move along, three rings to turn on, no sizes on the part). Chosen with the
 * switch beside Snap Grid, remembered on this computer.
 */
import { useSyncExternalStore } from "react";

export type HandleStyle = "box" | "gimbal";
const KEY = "pare3d.handleStyle";
const EVENT = "pare3d-handle-style";

export function readHandleStyle(): HandleStyle {
  try {
    return window.localStorage.getItem(KEY) === "gimbal" ? "gimbal" : "box";
  } catch {
    return "box";
  }
}

let current: HandleStyle | null = null;

export function handleStyle(): HandleStyle {
  if (current === null) current = typeof window === "undefined" ? "box" : readHandleStyle();
  return current;
}

export function setHandleStyle(style: HandleStyle) {
  current = style;
  try { window.localStorage.setItem(KEY, style); } catch { /* remembered for this visit only */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function useHandleStyle(): HandleStyle {
  return useSyncExternalStore(subscribe, handleStyle, () => "box");
}
