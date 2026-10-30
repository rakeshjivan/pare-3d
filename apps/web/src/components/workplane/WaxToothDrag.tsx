"use client";

/**
 * Build 103: in Position, the library teeth are moved by taking hold of them. Press on a tooth: it is
 * selected and follows the pointer in the plane of the screen - seen from the front, along the arch
 * and up or down; from above, along and out - so it goes where the hand goes, from any view. Shift
 * holds it to up and down. The wheel over a tooth turns it about its long axis (Shift: torque, Alt:
 * tip), a degree a notch. The tooth follows at once (`onPreview`); the change is kept when it is let
 * go, or a moment after the last notch (`onCommit`). A press that misses every tooth is left to the
 * view (orbit, pan), so the camera works as always.
 */
import { useEffect, useRef } from "react";
import type { ToothAdjust, ToothFrame } from "@/lib/dentalWaxup";

type V = [number, number, number];
export type DragTooth = { id: string; frame: ToothFrame; triangles: () => Float32Array };

/** Degrees per wheel notch, and with Shift (coarse) the same: torque and tip are by the notch too. */
const WHEEL_DEGREES = 1;
const SETTLE_MS = 600;

/** Where a ray first meets a soup of triangles (distance along it), or null. */
function hitDistance(o: V, d: V, tris: Float32Array): number | null {
  let best = Infinity;
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const e1x = tris[t + 3] - tris[t], e1y = tris[t + 4] - tris[t + 1], e1z = tris[t + 5] - tris[t + 2];
    const e2x = tris[t + 6] - tris[t], e2y = tris[t + 7] - tris[t + 1], e2z = tris[t + 8] - tris[t + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = o[0] - tris[t], sy = o[1] - tris[t + 1], sz = o[2] - tris[t + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist > 1e-6 && dist < best) best = dist;
  }
  return Number.isFinite(best) ? best : null;
}

export function WaxToothDrag({ teeth, onSelect, onPreview, onCommit }: {
  teeth: DragTooth[];
  onSelect: (id: string) => void;
  onPreview: (id: string, change: ToothAdjust | null) => void;
  onCommit: (id: string, change: ToothAdjust) => void;
}) {
  const live = useRef({ teeth, onSelect, onPreview, onCommit });
  live.current = { teeth, onSelect, onPreview, onCommit };
  useEffect(() => {
    const ray = (x: number, y: number) => window.layerlingScreenRay?.(x, y) ?? null;
    const onCanvas = (event: Event) => {
      const target = event.target as Element | null;
      return Boolean(target && target.tagName === "CANVAS" && target.closest?.(".three-workplane-host"));
    };
    /** The tooth under the pointer and where (nearest first). */
    const pick = (x: number, y: number) => {
      const r = ray(x, y);
      if (!r) return null;
      let best: { tooth: DragTooth; dist: number } | null = null;
      for (const tooth of live.current.teeth) {
        const dist = hitDistance(r.origin, r.direction, tooth.triangles());
        if (dist !== null && (!best || dist < best.dist)) best = { tooth, dist };
      }
      return best ? { ...best, ray: r } : null;
    };
    let drag: { tooth: DragTooth; point: V; normal: V; vertical: boolean; change: ToothAdjust; pointer: number } | null = null;
    const planePoint = (x: number, y: number, point: V, normal: V): V | null => {
      const r = ray(x, y);
      if (!r) return null;
      const den = r.direction[0] * normal[0] + r.direction[1] * normal[1] + r.direction[2] * normal[2];
      if (Math.abs(den) < 1e-9) return null;
      const t = ((point[0] - r.origin[0]) * normal[0] + (point[1] - r.origin[1]) * normal[1] + (point[2] - r.origin[2]) * normal[2]) / den;
      return [r.origin[0] + r.direction[0] * t, r.origin[1] + r.direction[1] * t, r.origin[2] + r.direction[2] * t];
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || !onCanvas(event)) return;
      const hit = pick(event.clientX, event.clientY);
      if (!hit) return;
      // The tooth is taken: the view does not orbit or select.
      event.preventDefault();
      event.stopImmediatePropagation();
      live.current.onSelect(hit.tooth.id);
      const o = hit.ray.origin, d = hit.ray.direction;
      drag = { tooth: hit.tooth, point: [o[0] + d[0] * hit.dist, o[1] + d[1] * hit.dist, o[2] + d[2] * hit.dist], normal: [-d[0], -d[1], -d[2]], vertical: event.shiftKey, change: {}, pointer: event.pointerId };
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const p = planePoint(event.clientX, event.clientY, drag.point, drag.normal);
      if (!p) return;
      const delta: V = [p[0] - drag.point[0], p[1] - drag.point[1], p[2] - drag.point[2]];
      const f = drag.tooth.frame;
      const along = (axis: readonly number[]) => delta[0] * axis[0] + delta[1] * axis[1] + delta[2] * axis[2];
      drag.change = drag.vertical || event.shiftKey ? { up: along(f.up) } : { mesial: along(f.mesial), out: along(f.out), up: along(f.up) };
      live.current.onPreview(drag.tooth.id, drag.change);
    };
    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const { tooth, change } = drag;
      drag = null;
      const moved = Object.values(change).some((v) => typeof v === "number" && Math.abs(v) > 0.005);
      if (moved && event.type === "pointerup") live.current.onCommit(tooth.id, change);
      live.current.onPreview(tooth.id, null);
    };
    // The wheel over a tooth turns it; the turns are kept a moment after the last.
    let wheel: { tooth: DragTooth; change: ToothAdjust; timer: number } | null = null;
    const settle = () => {
      if (!wheel) return;
      const { tooth, change } = wheel;
      wheel = null;
      live.current.onCommit(tooth.id, change);
      live.current.onPreview(tooth.id, null);
    };
    const onWheel = (event: WheelEvent) => {
      if (!onCanvas(event)) return;
      const hit = wheel ? { tooth: wheel.tooth } : pick(event.clientX, event.clientY);
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const delta = event.deltaY || event.deltaX;
      if (!delta) return;
      const key = event.shiftKey ? "torque" : event.altKey ? "tip" : "turn";
      if (!wheel) { live.current.onSelect(hit.tooth.id); wheel = { tooth: hit.tooth, change: {}, timer: 0 }; }
      else window.clearTimeout(wheel.timer);
      wheel.change = { ...wheel.change, [key]: (wheel.change[key] ?? 0) + (delta < 0 ? WHEEL_DEGREES : -WHEEL_DEGREES) };
      live.current.onPreview(wheel.tooth.id, wheel.change);
      wheel.timer = window.setTimeout(settle, SETTLE_MS);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      if (wheel) { window.clearTimeout(wheel.timer); settle(); }
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, []);
  return null;
}
