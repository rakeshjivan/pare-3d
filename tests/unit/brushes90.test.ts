import { describe, expect, it } from "vitest";
import { LiveMesh, stampBrush, type LiveBrush } from "@/lib/liveSculpt";

/** A 40 mm plate on an n x n grid, heights from `height`; `jitter` moves the grid's corners about in the plane. */
function plate(n: number, height: (x: number, y: number) => number, jitter = 0) {
  const soup: number[] = []; const s = 40 / n;
  const at = (i: number, j: number) => {
    const inside = i > 0 && j > 0 && i < n && j < n;
    const jx = inside ? jitter * s * Math.sin(i * 12.9898 + j * 78.233) : 0, jy = inside ? jitter * s * Math.cos(i * 39.346 + j * 11.135) : 0;
    const x = -20 + i * s + jx, y = -20 + j * s + jy; return [x, y, height(x, y)];
  };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); soup.push(...a, ...b, ...c, ...a, ...c, ...d); }
  return LiveMesh.fromSoup(soup);
}
const stroke = (mesh: LiveMesh, brush: Exclude<LiveBrush, "move">, s: number, y = 0, from = -8, to = 8) => {
  mesh.beginStroke();
  for (let d = from; d <= to + 1e-9; d += 0.6) { const hit = mesh.pick([d, y, 10], [0, 0, -1]); if (hit) stampBrush(mesh, brush, hit.point, [0, 0, 1], 3, hit.triangle, s); }
};
const top = (mesh: LiveMesh) => { let z = -Infinity; for (let v = 0; v < mesh.vCount; v += 1) z = Math.max(z, mesh.pos[v * 3 + 2]); return z; };
const dome = (x: number, y: number) => Math.max(0, 1 - (x * x + y * y) / 9);
const ridge = (x: number) => 0.8 * Math.exp(-((x / 0.565) ** 2) * Math.LN2);
/** The ridge's half-height width near y = 0 (its height too). */
function width(mesh: LiveMesh) {
  let pk = 0;
  const pts: Array<[number, number]> = [];
  for (let v = 0; v < mesh.vCount; v += 1) if (Math.abs(mesh.pos[v * 3 + 1]) < 0.6 && Math.abs(mesh.pos[v * 3]) < 4) { pts.push([mesh.pos[v * 3], mesh.pos[v * 3 + 2]]); pk = Math.max(pk, mesh.pos[v * 3 + 2]); }
  const hi = pts.filter((p) => p[1] >= pk / 2).map((p) => p[0]);
  return { height: pk, width: Math.max(...hi) - Math.min(...hi) };
}
const freezeLeftHalf = (mesh: LiveMesh) => { for (let v = 0; v < mesh.vCount; v += 1) if (mesh.pos[v * 3] < 0) mesh.mask[v] = 1; };

describe("Build 90: Pinch as Meshmixer's, and Freeze", () => {
  it("Pinch draws a soft ridge a sixth, a quarter and a third narrower at 25 / 53 / 100, keeping its height", () => {
    const before = width(plate(200, ridge)).width;
    const narrower = [0.25, 0.53, 1].map((s) => {
      const mesh = plate(200, ridge);
      mesh.beginStroke();
      for (let d = -8; d <= 8; d += 0.6) { const hit = mesh.pick([0, d, 10], [0, 0, -1]); if (hit) stampBrush(mesh, "pinch", hit.point, [0, 0, 1], 3, hit.triangle, s); }
      const after = width(mesh);
      expect(after.height).toBeGreaterThan(0.75);
      return 1 - after.width / before;
    });
    expect(narrower[0]).toBeGreaterThan(0.08); expect(narrower[0]).toBeLessThan(0.22);
    expect(narrower[1]).toBeGreaterThan(0.18); expect(narrower[1]).toBeLessThan(0.32);
    expect(narrower[2]).toBeGreaterThan(0.27); expect(narrower[2]).toBeLessThan(0.42);
  });

  it("frozen corners stay put under every brush, the free ones move", () => {
    for (const brush of ["draw", "draw2", "inflate", "smooth", "bubbleSmooth", "flatten", "pinch", "crease", "drag"] as const) {
      const mesh = plate(80, dome);
      freezeLeftHalf(mesh);
      const before = Float64Array.from(mesh.pos.subarray(0, mesh.vCount * 3));
      stroke(mesh, brush, 1, 0.5, -4, 4);
      let frozenMoved = 0, freeMoved = 0;
      for (let v = 0; v < mesh.vCount; v += 1) {
        const d = Math.hypot(mesh.pos[v * 3] - before[v * 3], mesh.pos[v * 3 + 1] - before[v * 3 + 1], mesh.pos[v * 3 + 2] - before[v * 3 + 2]);
        if (before[v * 3] < 0) frozenMoved = Math.max(frozenMoved, d); else freeMoved = Math.max(freeMoved, d);
      }
      expect(frozenMoved, brush).toBe(0);
      expect(freeMoved, brush).toBeGreaterThan(1e-4);
    }
  });

  it("refining leaves the frozen triangles as they were and splits the free ones", () => {
    const mesh = plate(40, () => 0);
    freezeLeftHalf(mesh);
    const frozenTris = () => { const out: string[] = []; for (let t = 0; t < mesh.tCount; t += 1) if (mesh.tAlive[t]) { const c = [0, 1, 2].map((k) => mesh.tri[t * 3 + k]); if (c.every((v) => mesh.mask[v] === 1)) out.push(c.join(",")); } return out.sort().join(" "); };
    const before = frozenTris(), count = mesh.triangleCount();
    const corners: number[] = []; for (let v = 0; v < mesh.vCount; v += 1) if (Math.abs(mesh.pos[v * 3]) < 4 && Math.abs(mesh.pos[v * 3 + 1]) < 4) corners.push(v);
    mesh.refine(corners, 0.25, { budget: 20000, always: true });
    expect(frozenTris()).toBe(before);
    expect(mesh.triangleCount()).toBeGreaterThan(count + 100);
  });

  it("the Freeze brush paints and Ctrl frees; invert, clear and freezing the selection's points", () => {
    const mesh = plate(60, () => 0);
    const hit = mesh.pick([0, 0, 10], [0, 0, -1])!;
    stampBrush(mesh, "mask", hit.point, [0, 0, 1], 3, hit.triangle, 1);
    stampBrush(mesh, "mask", hit.point, [0, 0, 1], 3, hit.triangle, 1);
    const centre = mesh.frozenCount();
    expect(centre).toBeGreaterThan(20);
    // Nothing outside the brush.
    for (let v = 0; v < mesh.vCount; v += 1) if (Math.hypot(mesh.pos[v * 3], mesh.pos[v * 3 + 1]) > 3.01) expect(mesh.mask[v]).toBe(0);
    stampBrush(mesh, "mask", hit.point, [0, 0, 1], 3, hit.triangle, 1, true);
    stampBrush(mesh, "mask", hit.point, [0, 0, 1], 3, hit.triangle, 1, true);
    expect(mesh.frozenCount()).toBe(0);
    mesh.invertMask();
    const alive = mesh.vCount;
    expect(mesh.frozenCount()).toBe(alive);
    mesh.clearMask();
    expect(mesh.frozenCount()).toBe(0);
    // Freezing by points, as from a selection (single precision, as the selection's copy has them).
    const soup = mesh.soup();
    expect(mesh.freezePoints(soup.subarray(0, 9 * 10))).toBeGreaterThan(5);
    const kept = mesh.frozenPoints();
    const copy = LiveMesh.fromSoup(soup);
    copy.freezePoints(kept);
    expect(copy.frozenCount()).toBe(mesh.frozenCount());
  });

  it("frozen corners are drawn tinted, and a split between frozen and free takes half of each", () => {
    const mesh = plate(10, () => 0);
    freezeLeftHalf(mesh);
    for (let v = 0; v < mesh.vCount; v += 1) if (mesh.pos[v * 3] < 0) { (mesh as unknown as { dirtyC: Set<number> }).dirtyC.add(v); }
    (mesh as unknown as { maskShown: boolean }).maskShown = true;
    mesh.flushGpu();
    const colors = mesh.geometry.getAttribute("color").array as Float32Array;
    let frozen = -1, free = -1;
    for (let v = 0; v < mesh.vCount; v += 1) { if (mesh.pos[v * 3] < -1) frozen = v; else if (mesh.pos[v * 3] > 1) free = v; }
    expect(colors[frozen * 3]).toBeLessThan(0.6);
    expect(colors[free * 3]).toBe(1);
    let a = -1, b = -1;
    for (let v = 0; v < mesh.vCount && a < 0; v += 1) if (mesh.mask[v] === 1) for (const w of mesh.neighbours(v)) if (mesh.mask[w] === 0) { a = v; b = w; break; }
    const m = mesh.splitEdge(a, b)!;
    expect(mesh.mask[m]).toBeCloseTo(0.5);
  });
});
