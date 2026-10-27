"use client";

/**
 * Build 79: the wax-up landmarks - each click on the view marks a point (page pixels); the view can
 * still be turned and zoomed as with the trim line (right or middle button, wheel). Esc gives up.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { passToView } from "./DentalTrimOverlay";

export function WaxupPointOverlay({ hint, onPick, onCancel }: { hint: string; onPick: (x: number, y: number) => void; onCancel: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".workplane-plane"));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  if (!host) return null;
  return createPortal(
    <div
      className="dental-trim-overlay waxup-point-overlay"
      role="application"
      aria-label={hint}
      onWheel={passToView.wheel}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (passToView.pointerDown(event)) return;
        if (event.button !== 0) return;
        event.preventDefault();
        onPick(event.clientX, event.clientY);
      }}
    >
      <p className="dental-trim-hint">{hint}</p>
    </div>,
    host,
  );
}

/** The nearest triangle of `world` (a soup) the ray meets, as the point it meets it at; null if none. */
export function rayHit(world: ArrayLike<number>, origin: [number, number, number], direction: [number, number, number]): [number, number, number] | null {
  let best = Infinity;
  const [ox, oy, oz] = origin, [dx, dy, dz] = direction;
  for (let t = 0; t + 8 < world.length; t += 9) {
    const ax = world[t], ay = world[t + 1], az = world[t + 2];
    const e1x = world[t + 3] - ax, e1y = world[t + 4] - ay, e1z = world[t + 5] - az;
    const e2x = world[t + 6] - ax, e2y = world[t + 7] - ay, e2z = world[t + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (distance > 1e-6 && distance < best) best = distance;
  }
  return Number.isFinite(best) ? [ox + dx * best, oy + dy * best, oz + dz * best] : null;
}

/** A small diamond (octahedron) at each point, as a soup - landmarks drawn with the view's highlight. */
export function markerTriangles(points: Array<[number, number, number]>, size = 0.6): Float32Array {
  const out: number[] = [];
  const axes: Array<[number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const [x, y, z] of points) {
    const corner = (axis: number, sign: number): [number, number, number] => [x + axes[axis][0] * sign * size, y + axes[axis][1] * sign * size, z + axes[axis][2] * sign * size];
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      const a = corner(0, sx), b = corner(1, sy), c = corner(2, sz);
      // Outward: flip the winding on odd octants.
      if (sx * sy * sz > 0) out.push(...a, ...b, ...c);
      else out.push(...a, ...c, ...b);
    }
  }
  return Float32Array.from(out);
}
