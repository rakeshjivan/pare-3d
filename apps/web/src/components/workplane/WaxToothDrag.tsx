"use client";

/**
 * Build 103: in Position the library teeth are worked as in exocad's tooth placement - no handles
 * over the tooth, the tooth itself taken with the mouse:
 * - drag: moves it (in the plane of the screen, held to a direction when one is chosen - mesial-
 *   distal, labial-lingual, incisal, or along the arch and in-out with the height kept);
 * - Ctrl (or ⌘) + drag: turns it about its middle, as a trackball - across the screen about the
 *   screen's vertical, up and down about its horizontal - so rotation and both tilts come from any view;
 * - Shift + drag: the whole tooth larger (up) or smaller (down);
 * - Ctrl + Shift + drag: larger or smaller in the direction dragged (width, length or thickness,
 *   whichever of the tooth's axes the drag runs along on the screen);
 * - Alt with any of them: a fifth as far (fine);
 * - the wheel over a tooth: turns it about its long axis (Shift: labio-lingual tilt, Alt:
 *   mesio-distal tilt), a degree a notch;
 * - a double click on a tooth: `onDouble` (a confirmed tooth is taken up again).
 * The tooth follows at once (`onPreview`); the change is kept when let go, or a moment after the last
 * notch (`onCommit`). A press that misses every tooth is left to the view (orbit, pan).
 */
import { useEffect, useRef } from "react";
import type { ToothAdjust, ToothFrame } from "@/lib/dentalWaxup";

type V = [number, number, number];
export type DragTooth = { id: string; frame: ToothFrame; width: number; length: number; triangles: () => Float32Array; locked?: boolean };
/** Which way a move is held (exocad's direction buttons). */
export type WaxRestrict = "free" | "mesial" | "out" | "up" | "plane";

const WHEEL_DEGREES = 1;
const SETTLE_MS = 600;
/** Alt held: a fifth as far. */
const FINE = 0.2;
/** Ctrl + drag: degrees per pixel. */
const DEG_PER_PX = 0.25;
/** Shift + drag: size per pixel (0.2% a pixel). */
const SIZE_PER_PX = 0.002;
const SIZE_MIN = 0.6, SIZE_MAX = 1.6;

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

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

export function WaxToothDrag({ teeth, restrict = "free", onSelect, onPreview, onCommit, onDouble }: {
  teeth: DragTooth[];
  restrict?: WaxRestrict;
  onSelect: (id: string) => void;
  onPreview: (id: string, change: ToothAdjust | null) => void;
  onCommit: (id: string, change: ToothAdjust) => void;
  onDouble?: (id: string) => void;
}) {
  const live = useRef({ teeth, restrict, onSelect, onPreview, onCommit, onDouble });
  live.current = { teeth, restrict, onSelect, onPreview, onCommit, onDouble };
  useEffect(() => {
    const ray = (x: number, y: number) => window.layerlingScreenRay?.(x, y) ?? null;
    const onCanvas = (event: Event) => {
      const target = event.target as Element | null;
      return Boolean(target && target.tagName === "CANVAS" && target.closest?.(".three-workplane-host"));
    };
    /** The tooth under the pointer (nearest first), locked ones too when asked. */
    const pick = (x: number, y: number, withLocked = false) => {
      const r = ray(x, y);
      if (!r) return null;
      let best: { tooth: DragTooth; dist: number } | null = null;
      for (const tooth of live.current.teeth) {
        if (tooth.locked && !withLocked) continue;
        const dist = hitDistance(r.origin, r.direction, tooth.triangles());
        if (dist !== null && (!best || dist < best.dist)) best = { tooth, dist };
      }
      return best ? { ...best, ray: r } : null;
    };
    type Mode = "move" | "rotate" | "scale" | "stretch";
    let drag: { tooth: DragTooth; point: V; normal: V; mode: Mode; start: [number, number]; change: ToothAdjust; pointer: number; screenUp: V; screenRight: V } | null = null;
    const planePoint = (x: number, y: number, point: V, normal: V): V | null => {
      const r = ray(x, y);
      if (!r) return null;
      const den = dot(r.direction, normal);
      if (Math.abs(den) < 1e-9) return null;
      const t = dot([point[0] - r.origin[0], point[1] - r.origin[1], point[2] - r.origin[2]], normal) / den;
      return [r.origin[0] + r.direction[0] * t, r.origin[1] + r.direction[1] * t, r.origin[2] + r.direction[2] * t];
    };
    const modeOf = (event: PointerEvent): Mode => {
      const ctrl = event.ctrlKey || event.metaKey;
      return ctrl && event.shiftKey ? "stretch" : ctrl ? "rotate" : event.shiftKey ? "scale" : "move";
    };
    /** The screen's directions in the scene, at the tooth (from rays a little apart). */
    const screenAxes = (x: number, y: number, point: V, normal: V) => {
      const a = planePoint(x, y, point, normal), r = planePoint(x + 20, y, point, normal), u = planePoint(x, y - 20, point, normal);
      const unit = (p: V | null): V => {
        if (!a || !p) return [0, 0, 0];
        const d: V = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], l = Math.hypot(...d) || 1;
        return [d[0] / l, d[1] / l, d[2] / l];
      };
      return { right: unit(r), up: unit(u) };
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !onCanvas(event)) return;
      const hit = pick(event.clientX, event.clientY);
      if (!hit) return;
      // The tooth is taken: the view does not orbit or select.
      event.preventDefault();
      event.stopImmediatePropagation();
      live.current.onSelect(hit.tooth.id);
      const o = hit.ray.origin, d = hit.ray.direction;
      const point: V = [o[0] + d[0] * hit.dist, o[1] + d[1] * hit.dist, o[2] + d[2] * hit.dist];
      const normal: V = [-d[0], -d[1], -d[2]];
      const axes = screenAxes(event.clientX, event.clientY, point, normal);
      drag = { tooth: hit.tooth, point, normal, mode: modeOf(event), start: [event.clientX, event.clientY], change: {}, pointer: event.pointerId, screenUp: axes.up, screenRight: axes.right };
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const f = drag.tooth.frame;
      const k = event.altKey ? FINE : 1;
      const dx = event.clientX - drag.start[0], dy = drag.start[1] - event.clientY;
      if (drag.mode === "move") {
        const p = planePoint(event.clientX, event.clientY, drag.point, drag.normal);
        if (!p) return;
        const delta: V = [p[0] - drag.point[0], p[1] - drag.point[1], p[2] - drag.point[2]];
        const along = (axis: readonly number[]) => dot(delta, axis) * k;
        const r = live.current.restrict;
        drag.change = r === "mesial" ? { mesial: along(f.mesial) } : r === "out" ? { out: along(f.out) } : r === "up" ? { up: along(f.up) } : r === "plane" ? { mesial: along(f.mesial), out: along(f.out) } : { mesial: along(f.mesial), out: along(f.out), up: along(f.up) };
      } else if (drag.mode === "rotate") {
        // A trackball: the turn about the screen's vertical (across) and horizontal (up and down),
        // read in the tooth's own frame - about its up (rotation), out (mesio-distal tilt), mesial (labio-lingual tilt).
        const w: V = [
          (drag.screenUp[0] * dx - drag.screenRight[0] * dy) * DEG_PER_PX * k,
          (drag.screenUp[1] * dx - drag.screenRight[1] * dy) * DEG_PER_PX * k,
          (drag.screenUp[2] * dx - drag.screenRight[2] * dy) * DEG_PER_PX * k,
        ];
        // Each side's frame is the other's mirror image: turns read in it the same way.
        const handed = Math.sign(dot(cross(f.mesial, f.out), f.up)) || 1;
        drag.change = { turn: dot(w, f.up) * handed, tip: dot(w, f.out) * handed, torque: dot(w, f.mesial) * handed };
      } else if (drag.mode === "scale") {
        const s = Math.max(SIZE_MIN, Math.min(SIZE_MAX, 1 + dy * SIZE_PER_PX * k));
        drag.change = { wider: s, longer: s, thicker: s };
      } else {
        // Along the tooth axis the drag runs most nearly along on the screen.
        const len = Math.hypot(dx, dy) || 1;
        const screen = (axis: readonly number[]): [number, number] => [dot(axis, drag!.screenRight), dot(axis, drag!.screenUp)];
        const options = ([["wider", f.mesial], ["longer", f.up], ["thicker", f.out]] as const).map(([key, axis]) => {
          const s = screen(axis), l = Math.hypot(...s) || 1;
          return { key, along: (dx * s[0] + dy * s[1]) / l, fit: Math.abs((dx * s[0] + dy * s[1]) / (l * len)) };
        }).sort((a, b) => b.fit - a.fit);
        const best = options[0];
        const s = Math.max(SIZE_MIN, Math.min(SIZE_MAX, 1 + Math.abs(best.along) * Math.sign(best.along) * SIZE_PER_PX * k));
        drag.change = { [best.key]: s };
      }
      live.current.onPreview(drag.tooth.id, drag.change);
    };
    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const { tooth, change } = drag;
      drag = null;
      const moved = Object.entries(change).some(([key, v]) => typeof v === "number" && (["wider", "longer", "thicker"].includes(key) ? Math.abs(v - 1) > 1e-3 : Math.abs(v) > 0.005));
      if (moved && event.type === "pointerup") live.current.onCommit(tooth.id, change);
      live.current.onPreview(tooth.id, null);
    };
    // Ctrl + click opens the menu on a Mac: not over a tooth being taken.
    const onMenu = (event: MouseEvent) => { if (onCanvas(event) && (drag || pick(event.clientX, event.clientY))) event.preventDefault(); };
    const onDbl = (event: MouseEvent) => {
      if (!onCanvas(event)) return;
      const hit = pick(event.clientX, event.clientY, true);
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      live.current.onDouble?.(hit.tooth.id);
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
    window.addEventListener("contextmenu", onMenu, { capture: true });
    window.addEventListener("dblclick", onDbl, { capture: true });
    return () => {
      if (wheel) { window.clearTimeout(wheel.timer); settle(); }
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("contextmenu", onMenu, { capture: true });
      window.removeEventListener("dblclick", onDbl, { capture: true });
    };
  }, []);
  return null;
}
