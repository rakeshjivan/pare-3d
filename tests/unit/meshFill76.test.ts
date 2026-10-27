import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { eraseAndFill } from "@/lib/meshFill";
import { sculptMeshOf } from "@/lib/meshSculpt";

function sphereSoup(r: number, detail: number) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  return Array.from((g.toNonIndexed().getAttribute("position") as THREE.BufferAttribute).array as Float32Array);
}
/** Edge use counts of a soup, corners welded. */
function edges(p: ArrayLike<number>) {
  const id = new Map<string, number>();
  const at = (i: number) => { const k = `${p[i].toFixed(4)},${p[i + 1].toFixed(4)},${p[i + 2].toFixed(4)}`; let v = id.get(k); if (v === undefined) { v = id.size; id.set(k, v); } return v; };
  const count = new Map<string, number>();
  for (let t = 0; t + 8 < p.length; t += 9) {
    const c = [at(t), at(t + 3), at(t + 6)];
    for (let k = 0; k < 3; k += 1) { const a = c[k], b = c[(k + 1) % 3]; const key = a < b ? `${a},${b}` : `${b},${a}`; count.set(key, (count.get(key) ?? 0) + 1); }
  }
  let one = 0, more = 0;
  for (const n of count.values()) { if (n === 1) one += 1; else if (n > 2) more += 1; }
  return { one, more };
}
function volume(p: ArrayLike<number>) {
  let v = 0;
  for (let i = 0; i + 8 < p.length; i += 9) v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
  return v;
}

describe("Erase & Fill (build 76)", () => {
  it("closes the hole left in a sphere with a patch that carries on its curve", () => {
    const mesh = sculptMeshOf(sphereSoup(10, 12));
    const chosen = new Uint8Array(mesh.triangles.length / 3);
    for (let t = 0; t < chosen.length; t += 1) {
      let y = 0;
      for (let k = 0; k < 3; k += 1) y += mesh.points[mesh.triangles[t * 3 + k] * 3 + 1];
      if (y / 3 > 6) chosen[t] = 1;
    }
    const result = eraseAndFill(mesh.points, mesh.triangles, chosen);
    expect(result.filled).toBe(1);
    expect(result.open).toBe(0);
    const e = edges(result.positions);
    expect(e.one).toBe(0);
    expect(e.more).toBe(0);
    for (const value of result.positions) expect(Number.isFinite(value)).toBe(true);
    // Faces outward like the rest of the sphere, and the patch bulges out towards where the cap was.
    expect(volume(result.positions)).toBeGreaterThan((4 / 3) * Math.PI * 1000 * 0.9);
    let top = -Infinity;
    for (let i = 1; i < result.positions.length; i += 3) top = Math.max(top, result.positions[i]);
    expect(top).toBeGreaterThan(8);
    expect(top).toBeLessThan(10.5);
  });

  it("leaves an opening that runs into the surface's own edge open", () => {
    // A bowl (the lower half of a sphere) with a selection touching its rim.
    const soup = sphereSoup(10, 10);
    const bowl: number[] = [];
    for (let t = 0; t < soup.length; t += 9) if (soup[t + 1] + soup[t + 4] + soup[t + 7] < 0) bowl.push(...soup.slice(t, t + 9));
    const mesh = sculptMeshOf(bowl);
    const chosen = new Uint8Array(mesh.triangles.length / 3);
    for (let t = 0; t < chosen.length; t += 1) {
      const x = mesh.points[mesh.triangles[t * 3] * 3];
      if (x > 6) chosen[t] = 1;
    }
    const result = eraseAndFill(mesh.points, mesh.triangles, chosen);
    expect(result.filled).toBe(0);
    expect(result.open).toBe(1);
    expect(result.removed).toBeGreaterThan(0);
  });

  it("fills two holes at once and keeps the rest of the surface exactly", () => {
    const mesh = sculptMeshOf(sphereSoup(10, 10));
    const chosen = new Uint8Array(mesh.triangles.length / 3);
    for (let t = 0; t < chosen.length; t += 1) {
      const y = mesh.points[mesh.triangles[t * 3] * 3 + 1];
      if (Math.abs(y) > 8.5) chosen[t] = 1;
    }
    const result = eraseAndFill(mesh.points, mesh.triangles, chosen);
    expect(result.filled).toBe(2);
    expect(edges(result.positions).one).toBe(0);
    // Every corner of the old surface kept is still exactly on the sphere.
    let off = 0;
    for (let i = 0; i < result.positions.length; i += 3) {
      const r = Math.hypot(result.positions[i], result.positions[i + 1], result.positions[i + 2]);
      if (Math.abs(result.positions[i + 1]) < 8 && Math.abs(r - 10) > 0.02) off += 1;
    }
    expect(off).toBe(0);
  });
});
