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

import { NearestSurface } from "@/lib/nearestSurface";
import { stampBrush } from "@/lib/liveSculpt";

describe("Build 92: Attract", () => {
  it("finds the nearest point of a surface within reach, and nothing beyond it", () => {
    const target = new NearestSurface(Float32Array.from([-5, -5, 2, 5, -5, 2, 0, 5, 2]), 3);
    const q = new Float64Array(3);
    expect(target.nearest(0, 0, 0, q)).toBeCloseTo(2, 9);
    expect(q[2]).toBeCloseTo(2, 9);
    expect(target.nearest(0, 0, -2, q)).toBe(Infinity);
  });

  it("pulls the surface onto the other part and stops there, never through it", () => {
    const mesh = plate(60, 20);
    const sheet = plate(10, 30, () => 1).soup();
    mesh.attractTarget = new NearestSurface(sheet, 4);
    for (let k = 0; k < 30; k += 1) for (let x = -3; x <= 3; x += 0.5) {
      const hit = mesh.pick([x, 0, 0.5], [0, 0, -1]) ?? mesh.pick([x, 0, 5], [0, 0, -1]);
      if (hit) stampBrush(mesh, "attract", hit.point, [0, 0, 1], 2.5, hit.triangle, 1);
    }
    let top = -Infinity;
    for (let v = 0; v < mesh.vCount; v += 1) top = Math.max(top, mesh.pos[v * 3 + 2]);
    expect(top).toBeGreaterThan(0.95);
    expect(top).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe("Build 92: brush options", () => {
  const raiseProfile = (falloff: "smooth" | "sharp" | "flat") => {
    const mesh = plate(80, 20);
    mesh.falloff = falloff;
    const hit = mesh.pick([0, 0, 5], [0, 0, -1])!;
    mesh.dab("draw", hit.point, [0, 0, 1], 4, mesh.region(hit.point, 4, hit.triangle), 1, 0.5);
    const at = (r: number) => { let best = 0, bd = Infinity; for (let v = 0; v < mesh.vCount; v += 1) { const d = Math.abs(Math.hypot(mesh.pos[v * 3], mesh.pos[v * 3 + 1]) - r); if (d < bd) { bd = d; best = mesh.pos[v * 3 + 2]; } } return best; };
    return [at(0), at(2), at(3.5)];
  };
  it("falloff: sharp narrower than smooth, flat fuller", () => {
    const smooth = raiseProfile("smooth"), sharp = raiseProfile("sharp"), flat = raiseProfile("flat");
    expect(sharp[1] / sharp[0]).toBeLessThan(smooth[1] / smooth[0] - 0.1);
    expect(flat[1] / flat[0]).toBeGreaterThan(0.95);
    expect(flat[2]).toBeGreaterThan(0);
  });
  it("hold boundary keeps a scan's open edge where it is", () => {
    for (const hold of [false, true]) {
      const mesh = plate(40, 10);
      mesh.holdBoundary = hold;
      const hit = mesh.pick([4.6, 0, 5], [0, 0, -1])!;
      for (let k = 0; k < 5; k += 1) mesh.dab("draw", hit.point, [0, 0, 1], 2, mesh.region(hit.point, 2, hit.triangle), 1, 0.3);
      let edge = 0;
      for (let v = 0; v < mesh.vCount; v += 1) if (mesh.pos[v * 3] > 4.99) edge = Math.max(edge, Math.abs(mesh.pos[v * 3 + 2]));
      if (hold) expect(edge).toBe(0); else expect(edge).toBeGreaterThan(0.01);
    }
  });
  it("Flatten's depth sets the plane above or below the surface's middle", () => {
    const mesh = plate(60, 20);
    mesh.flattenDepth = 0.5;
    const hit = mesh.pick([0, 0, 5], [0, 0, -1])!;
    for (let k = 0; k < 20; k += 1) mesh.dab("flatten", hit.point, [0, 0, 1], 3, mesh.region(hit.point, 3, hit.triangle), 0.5, 0.06);
    let mid = 0, bd = Infinity;
    for (let v = 0; v < mesh.vCount; v += 1) { const d = Math.hypot(mesh.pos[v * 3], mesh.pos[v * 3 + 1]); if (d < bd) { bd = d; mid = mesh.pos[v * 3 + 2]; } }
    expect(mid).toBeGreaterThan(0.1);
  });
});

describe("Build 92: face groups", () => {
  it("a box comes out as its six faces", () => {
    const g = new THREE.BoxGeometry(20, 10, 14, 8, 4, 6);
    const mesh = LiveMesh.fromSoup(Array.from((g.toNonIndexed().getAttribute("position") as THREE.BufferAttribute).array as Float32Array));
    expect(mesh.generateGroups(30)).toBe(6);
    // Every triangle of one face in one group.
    const byGroup = new Map<number, Set<string>>();
    for (let t = 0; t < mesh.tCount; t += 1) {
      const n = new THREE.Vector3(); const a = mesh.tri[t * 3], b = mesh.tri[t * 3 + 1], c = mesh.tri[t * 3 + 2];
      const p = (v: number) => new THREE.Vector3(mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]);
      n.crossVectors(p(b).sub(p(a)), p(c).sub(p(a))).normalize();
      const key = [n.x, n.y, n.z].map((x) => Math.round(x)).join(",");
      const g2 = mesh.groupOf(t);
      if (!byGroup.has(g2)) byGroup.set(g2, new Set());
      byGroup.get(g2)!.add(key);
    }
    for (const keys of byGroup.values()) expect(keys.size).toBe(1);
  });

  it("a groove between two bumps splits them, and small specks are merged away", () => {
    const bump = (x: number, y: number) => Math.max(0, 2 - Math.hypot(x + 3, y)) * 1.2 + Math.max(0, 2 - Math.hypot(x - 3, y)) * 1.2 + 0.01 * Math.sin(x * 40) * Math.cos(y * 40);
    const mesh = plate(120, 20, bump);
    const count = mesh.generateGroups(30);
    expect(count).toBeGreaterThan(2);
    expect(count).toBeLessThan(40);
    const left = mesh.pick([-3, 0.3, 10], [0, 0, -1])!, right = mesh.pick([3, 0.3, 10], [0, 0, -1])!;
    expect(mesh.groupOf(left.triangle)).not.toBe(mesh.groupOf(right.triangle));
  });

  it("paints the groups in colour and takes it away again", () => {
    const mesh = plate(20, 10, (x) => (x > 0 ? x : 0));
    mesh.generateGroups(20);
    mesh.showGroups(true);
    expect(mesh.painted).toBe(true);
    mesh.flushGpu();
    const colors = mesh.geometry.getAttribute("color").array as Float32Array;
    expect([colors[0], colors[1], colors[2]].some((c) => c !== 1)).toBe(true);
    mesh.showGroups(false);
    mesh.flushGpu();
    expect(mesh.painted).toBe(false);
    expect((mesh.geometry.getAttribute("color").array as Float32Array)[0]).toBe(1);
  });
});
