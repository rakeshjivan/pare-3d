import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LiveMesh, averageEdgeOf, offsetLive, remeshLive, thickenSoup } from "@/lib/liveSculpt";

/** An icosphere soup of radius r. */
function sphereSoup(r: number, detail: number) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  return Array.from((g.toNonIndexed().getAttribute("position") as THREE.BufferAttribute).array as Float32Array);
}
/** A flat open sheet, n x n squares of `size` mm, as a soup. */
function sheetSoup(n: number, size: number) {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const x0 = i * size, y0 = j * size, x1 = x0 + size, y1 = y0 + size;
    out.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
  }
  return out;
}
/** Every edge has exactly two triangles (closed) or at most two (open); no corner used by a dead triangle. */
function edgeCounts(mesh: LiveMesh) {
  const count = new Map<string, number>();
  for (let t = 0; t < mesh.tCount; t += 1) {
    if (!mesh.tAlive[t]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = mesh.tri[t * 3 + k], b = mesh.tri[t * 3 + ((k + 1) % 3)];
      expect(mesh.vAlive[a]).toBe(1);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  let one = 0, two = 0, more = 0;
  for (const c of count.values()) { if (c === 1) one += 1; else if (c === 2) two += 1; else more += 1; }
  return { one, two, more };
}
/** Signed volume of a closed mesh. */
function volume(mesh: LiveMesh) {
  let v = 0;
  const p = mesh.pos;
  for (let t = 0; t < mesh.tCount; t += 1) {
    if (!mesh.tAlive[t]) continue;
    const a = mesh.tri[t * 3] * 3, b = mesh.tri[t * 3 + 1] * 3, c = mesh.tri[t * 3 + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}

describe("Build 73: live Sculpt engine", () => {
  it("picks the surface along a ray", () => {
    const mesh = LiveMesh.fromSoup(sphereSoup(10, 3));
    const hit = mesh.pick([0, 0, 50], [0, 0, -1]);
    expect(hit).not.toBeNull();
    expect(hit!.point[2]).toBeGreaterThan(9.5);
    expect(hit!.point[2]).toBeLessThan(10.01);
    expect(mesh.pick([50, 50, 50], [1, 0, 0])).toBeNull();
  });

  it("brushes move only the corners under the brush that are joined to the point", () => {
    const mesh = LiveMesh.fromSoup(sphereSoup(10, 14));
    const before = mesh.pos.slice();
    const hit = mesh.pick([0, 0, 50], [0, 0, -1])!;
    const region = mesh.region(hit.point, 3, hit.triangle);
    expect(region.size).toBeGreaterThan(5);
    // Nothing on the far side of the sphere.
    for (const v of region.keys()) expect(mesh.pos[v * 3 + 2]).toBeGreaterThan(0);
    mesh.dab("inflate", hit.point, [0, 0, 1], 3, region, 1, 0.5);
    let movedOut = 0, movedElsewhere = 0;
    for (let v = 0; v < mesh.vCount; v += 1) {
      const d = Math.hypot(mesh.pos[v * 3] - before[v * 3], mesh.pos[v * 3 + 1] - before[v * 3 + 1], mesh.pos[v * 3 + 2] - before[v * 3 + 2]);
      if (d > 1e-9) { if (region.has(v)) movedOut += 1; else movedElsewhere += 1; }
    }
    expect(movedOut).toBeGreaterThan(5);
    expect(movedElsewhere).toBe(0);
    expect(volume(mesh)).toBeGreaterThan((4 / 3) * Math.PI * 1000 * 0.95);
  });

  it("every brush keeps the mesh sound", () => {
    for (const brush of ["draw", "inflate", "deflate", "smooth", "flatten", "pinch", "crease"] as const) {
      const mesh = LiveMesh.fromSoup(sphereSoup(10, 4));
      const hit = mesh.pick([0, 0, 50], [0, 0, -1])!;
      for (let i = 0; i < 10; i += 1) mesh.dab(brush, hit.point, [0, 0, 1], 4, mesh.region(hit.point, 4, hit.triangle), 0.7, 0.3);
      const counts = edgeCounts(mesh);
      expect(counts.one + counts.more).toBe(0);
      for (let i = 0; i < mesh.vCount * 3; i += 1) expect(Number.isFinite(mesh.pos[i])).toBe(true);
    }
  });

  it("refine splits long edges and collapses short ones under the brush, keeping the mesh closed", () => {
    const mesh = LiveMesh.fromSoup(sphereSoup(10, 2)); // coarse: edges ~3.9 mm
    const trianglesBefore = mesh.triangleCount();
    const hit = mesh.pick([0, 0, 50], [0, 0, -1])!;
    for (let i = 0; i < 6; i += 1) mesh.refine(mesh.region(hit.point, 6, null).keys(), 1, { within: { centre: hit.point, radius: 6 } });
    expect(mesh.triangleCount()).toBeGreaterThan(trianglesBefore * 2);
    const counts = edgeCounts(mesh);
    expect(counts.one + counts.more).toBe(0);
    // Under the brush the edges came near the target; far away they stayed coarse.
    const near = mesh.region(hit.point, 3, mesh.pick([0, 0, 50], [0, 0, -1])!.triangle);
    expect(mesh.averageEdge(near.keys())).toBeLessThan(1.6);
    const far = mesh.region([0, 0, -10], 3, null);
    expect(mesh.averageEdge(far.keys())).toBeGreaterThan(3);
    // Coarse to fine and back: collapse when the target grows.
    const finer = mesh.triangleCount();
    for (let i = 0; i < 6; i += 1) mesh.refine(mesh.region(hit.point, 6, null).keys(), 3, { within: { centre: hit.point, radius: 6 } });
    expect(mesh.triangleCount()).toBeLessThan(finer);
    expect(edgeCounts(mesh).one + edgeCounts(mesh).more).toBe(0);
  });

  it("refine keeps an open sheet's rim where it is", () => {
    const mesh = LiveMesh.fromSoup(sheetSoup(10, 2));
    const rimBefore = edgeCounts(mesh).one;
    for (let i = 0; i < 4; i += 1) mesh.refine(mesh.region([10, 10, 0], 30, null).keys(), 0.8);
    const after = edgeCounts(mesh);
    expect(after.more).toBe(0);
    // Rim edges are split (more, shorter), never collapsed or moved off the square.
    expect(after.one).toBeGreaterThanOrEqual(rimBefore);
    for (let v = 0; v < mesh.vCount; v += 1) {
      if (!mesh.vAlive[v]) continue;
      expect(mesh.pos[v * 3]).toBeGreaterThanOrEqual(-1e-9);
      expect(mesh.pos[v * 3]).toBeLessThanOrEqual(20 + 1e-9);
      expect(Math.abs(mesh.pos[v * 3 + 2])).toBeLessThan(1e-9);
    }
  });

  it("move drags the grabbed corners with falloff", () => {
    const mesh = LiveMesh.fromSoup(sphereSoup(10, 14));
    const hit = mesh.pick([0, 0, 50], [0, 0, -1])!;
    const region = mesh.region(hit.point, 4, hit.triangle);
    const grabbed: Array<[number, number, number, number, number]> = [];
    for (const [v, d] of region) { const x = 1 - (d / 4) ** 2; grabbed.push([v, x * x, mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]]); }
    mesh.drag(grabbed, [0, 0, 3]);
    const top = Math.max(...[...region.keys()].map((v) => mesh.pos[v * 3 + 2]));
    expect(top).toBeGreaterThan(12.5);
    expect(edgeCounts(mesh).one).toBe(0);
  });

  it("GPU buffers follow the changes in runs", () => {
    const mesh = LiveMesh.fromSoup(sphereSoup(10, 4));
    const hit = mesh.pick([0, 0, 50], [0, 0, -1])!;
    mesh.dab("inflate", hit.point, [0, 0, 1], 3, mesh.region(hit.point, 3, hit.triangle), 1, 0.5);
    mesh.refine(mesh.region(hit.point, 3, hit.triangle).keys(), 0.4);
    expect(mesh.flushGpu()).toBe(true);
    const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(position.updateRanges.length).toBeGreaterThan(0);
    for (let v = 0; v < mesh.vCount; v += 1) if (mesh.vAlive[v]) for (let k = 0; k < 3; k += 1) expect(position.array[v * 3 + k]).toBeCloseTo(mesh.pos[v * 3 + k], 4);
    const index = mesh.geometry.getIndex()!;
    for (let t = 0; t < mesh.tCount; t += 1) if (mesh.tAlive[t]) for (let k = 0; k < 3; k += 1) expect(index.array[t * 3 + k]).toBe(mesh.tri[t * 3 + k]);
    expect(mesh.geometry.drawRange.count).toBe(mesh.tCount * 3);
    expect(mesh.flushGpu()).toBe(false);
  });

  it("Remesh evens a part's triangles and keeps it on its surface", () => {
    const mesh = LiveMesh.fromSoup(sphereSoup(10, 2));
    remeshLive(mesh, 1.0, 4);
    const counts = edgeCounts(mesh);
    expect(counts.one + counts.more).toBe(0);
    expect(averageEdgeOf(mesh)).toBeGreaterThan(0.7);
    expect(averageEdgeOf(mesh)).toBeLessThan(1.4);
    // Still on the original (faceted) sphere: every corner between its inradius and radius.
    for (let v = 0; v < mesh.vCount; v += 1) {
      if (!mesh.vAlive[v]) continue;
      const r = Math.hypot(mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]);
      expect(r).toBeGreaterThan(9.3);
      expect(r).toBeLessThan(10.01);
    }
  });

  it("Offset grows a closed part all round", () => {
    const mesh = LiveMesh.fromSoup(sphereSoup(10, 4));
    offsetLive(mesh, 1);
    const v0 = volume(mesh);
    expect(v0).toBeGreaterThan((4 / 3) * Math.PI * 11 ** 3 * 0.95);
    expect(v0).toBeLessThan((4 / 3) * Math.PI * 11 ** 3 * 1.02);
  });

  it("Thicken makes an open sheet a closed shell of the thickness", () => {
    const mesh = LiveMesh.fromSoup(sheetSoup(6, 2));
    const shell = LiveMesh.fromSoup(thickenSoup(mesh, 1));
    const counts = edgeCounts(shell);
    expect(counts.one).toBe(0);
    expect(counts.more).toBe(0);
    expect(Math.abs(volume(shell))).toBeCloseTo(12 * 12 * 1, 0);
  });
});
