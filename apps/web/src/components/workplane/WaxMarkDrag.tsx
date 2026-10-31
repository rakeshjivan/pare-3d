"use client";

/**
 * Build 105: the four marks on each tooth taken with the mouse and moved over the scan (as exocad's
 * "Modify contact points") - a mark a ray passes within MARK_GRAB mm of is picked up, follows the
 * pointer across the scan, and is put down where the pointer is let go. Presses that miss every mark
 * are left to the view (orbit, pan).
 */
import { useEffect, useRef } from "react";

export type DragMark = { id: string; point: [number, number, number] };
/** How near (mm, across the ray) a press must come to a mark to take it. */
export const MARK_GRAB = 0.8;

export function WaxMarkDrag({ marks, surfaceAt, onMove, onDrop }: {
  marks: DragMark[];
  /** The scan's point under the pointer (page pixels), or null. */
  surfaceAt: (x: number, y: number) => [number, number, number] | null;
  onMove: (id: string, point: [number, number, number]) => void;
  onDrop: (id: string, point: [number, number, number]) => void;
}) {
  const live = useRef({ marks, surfaceAt, onMove, onDrop });
  live.current = { marks, surfaceAt, onMove, onDrop };
  useEffect(() => {
    const onCanvas = (event: Event) => (event.target as Element | null)?.closest?.(".workplane-plane canvas, .three-workplane-host canvas") != null;
    let drag: { id: string; pointer: number; last: [number, number, number] | null; frame: number; x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !onCanvas(event)) return;
      const ray = window.layerlingScreenRay?.(event.clientX, event.clientY);
      if (!ray) return;
      const [ox, oy, oz] = ray.origin, [dx, dy, dz] = ray.direction;
      let best: { id: string; d: number } | null = null;
      for (const mark of live.current.marks) {
        const px = mark.point[0] - ox, py = mark.point[1] - oy, pz = mark.point[2] - oz;
        const t = px * dx + py * dy + pz * dz;
        if (t <= 0) continue;
        const d = Math.hypot(px - dx * t, py - dy * t, pz - dz * t);
        if (d < MARK_GRAB && (!best || d < best.d)) best = { id: mark.id, d };
      }
      if (!best) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = { id: best.id, pointer: event.pointerId, last: null, frame: 0, x: event.clientX, y: event.clientY };
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.x = event.clientX; drag.y = event.clientY;
      if (drag.frame) return;
      // One look-up of the scan a frame, however fast the pointer moves.
      drag.frame = window.requestAnimationFrame(() => {
        if (!drag) return;
        drag.frame = 0;
        const point = live.current.surfaceAt(drag.x, drag.y);
        if (point) { drag.last = point; live.current.onMove(drag.id, point); }
      });
    };
    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (drag.frame) window.cancelAnimationFrame(drag.frame);
      const point = live.current.surfaceAt(event.clientX, event.clientY) ?? drag.last;
      const id = drag.id;
      drag = null;
      if (point) live.current.onDrop(id, point);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, []);
  return null;
}
