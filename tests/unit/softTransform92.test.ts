import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LiveMesh } from "@/lib/liveSculpt";

function plate(n: number, size: number, height = (_x: number, _y: number) => 0) {
  const soup: number[] = []; const s = size / n;
  const at = (i: number, j: number) => { const x = -size / 2 + i * s, y = -size / 2 + j * s; return [x, y, height(x, y)]; };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); soup.push(...a, ...b, ...c, ...a, ...c, ...d); }
  return LiveMesh.fromSoup(soup);
}
const near = (mesh: LiveMesh, r: number) => { const out: number[] = []; for (let v = 0; v < mesh.vCount; v += 1) if (Math.hypot(mesh.pos[v * 3], mesh.pos[v * 3 + 1]) <= r) out.push(v); return Int32Array.from(out); };

describe("Build 92: Soft Transform", () => {
  it("takes the selection fully and fades out over the soft edge, measured across the surface", () => {
    const mesh = plate(80, 20);
    const core = near(mesh, 2);
    const { verts, weights } = mesh.softWeights(core, 3);
    const w = new Map<number, number>(); verts.forEach((v, i) => w.set(v, weights[i]));
    for (const v of core) expect(w.get(v)).toBe(1);
    for (let v = 0; v < mesh.vCount; v += 1) {
      const r = Math.hypot(mesh.pos[v * 3], mesh.pos[v * 3 + 1]);
      if (r > 5.6) expect(w.has(v)).toBe(false);
      if (r > 2.6 && r < 3.9 && w.has(v)) { expect(w.get(v)!).toBeGreaterThan(0); expect(w.get(v)!).toBeLessThan(1); }
    }
  });

  it("does not reach across a gap to a part that is not joined to the selection", () => {
    // Two plates 1 mm apart, the selection on one: a soft edge of 5 mm stays on it.
    const a: number[] = [], s = 0.25;
    for (const ox of [-6, 6]) for (let i = 0; i < 20; i += 1) for (let j = 0; j < 20; j += 1) {
      const x0 = ox - 2.5 + i * s, y0 = -2.5 + j * s;
      a.push(x0, y0, 0, x0 + s, y0, 0, x0 + s, y0 + s, 0, x0, y0, 0, x0 + s, y0 + s, 0, x0, y0 + s, 0);
    }
    const mesh = LiveMesh.fromSoup(a);
    const core: number[] = []; for (let v = 0; v < mesh.vCount; v += 1) if (mesh.pos[v * 3] < -5) core.push(v);
    const { verts } = mesh.softWeights(core, 20);
    for (const v of verts) expect(mesh.pos[v * 3]).toBeLessThan(0);
  });

  it("moves the selection by the full amount and the edge partly, and puts it back exactly", () => {
    const mesh = plate(60, 20);
    const core = near(mesh, 2);
    const { verts, weights } = mesh.softWeights(core, 3);
    const from = new Float64Array(verts.length * 3);
    verts.forEach((v, i) => from.set(mesh.pos.subarray(v * 3, v * 3 + 3), i * 3));
    mesh.softMove(verts, weights, from, new THREE.Matrix4().makeTranslation(0, 0, 1.5));
    for (const v of core) expect(mesh.pos[v * 3 + 2]).toBeCloseTo(1.5, 9);
    let partly = 0;
    verts.forEach((v, i) => { if (weights[i] > 0 && weights[i] < 1) { partly += 1; expect(mesh.pos[v * 3 + 2]).toBeGreaterThan(0); expect(mesh.pos[v * 3 + 2]).toBeLessThan(1.5); } });
    expect(partly).toBeGreaterThan(20);
    mesh.setPositions(verts, from);
    for (let v = 0; v < mesh.vCount; v += 1) expect(mesh.pos[v * 3 + 2]).toBe(0);
  });

  it("finds the corners of a selection from its points", () => {
    const mesh = plate(10, 10);
    const soup = mesh.soup();
    expect(mesh.cornersAt(soup.subarray(0, 9)).length).toBe(3);
  });
});
