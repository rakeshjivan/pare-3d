/**
 * Build 106: the studio frame's slots - the step bar along the top, Back and Next along the bottom, and
 * the line of guidance over the 3D view. The frame (StudioShell) puts the places on the page; the open
 * studio's panel fills them through portals, so its steps keep their own state where they are.
 */
import { useSyncExternalStore } from "react";

export type StudioSlotName = "steps" | "nav" | "hint" | "undo" | "case";

const slots: Partial<Record<StudioSlotName, HTMLElement | null>> = {};
const listeners = new Set<() => void>();

export function setStudioSlot(name: StudioSlotName, element: HTMLElement | null) {
  if (slots[name] === element) return;
  slots[name] = element;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The slot's element while the frame is shown, else null. */
export function useStudioSlot(name: StudioSlotName): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => slots[name] ?? null, () => null);
}
