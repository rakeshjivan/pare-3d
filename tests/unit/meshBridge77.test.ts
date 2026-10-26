import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bridgeLoops, bridgeNearestRims, joinOpenEdges, rimLoopsOfSoup } from "@/lib/meshBridge";

/** A soup of a geometry after a transform. */
function soupOf(g: THREE.BufferGeometry, m = new THREE.Matrix4()) {
  const geo = (g.index ? g.toNonIndexed() : g).clone().applyMatrix4(m);
  return Array.from((geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array);
}
/** An open tube along Y from y0 to y0 + h. */
function tube(r: number, h: number, radial: number, y0: number, x = 0, turn = 0, rows = 4) {
  const m = new THREE.Matrix4().makeRotationY(turn).premultiply(new THREE.Matrix4().makeTranslation(x, y0 + h / 2, 0));
  return soupOf(new THREE.CylinderGeometry(r, r, h, radial, rows, true), m);
}
function flipSoup(s: number[]) {
  const out = s.slice();
  for (let i = 0; i < out.length; i += 9) for (let k = 0; k < 3; k += 1) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; }
  return out;
}

/** Undirected edge uses, and whether any directed edge is run twice (two neighbours facing opposite ways). */
function edgeReport(soup: ArrayLike<number>) {
  const ids = new Map<string, number>();
  const id = (i: number) => {
    const k = `${Math.round(soup[i] * 1e4)},${Math.round(soup[i + 1] * 1e4)},${Math.round(soup[i + 2] * 1e4)}`;
    let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v;
  };
  const uses = new Map<string, number>();
  const directed = new Map<string, number>();
  let nan = false, degenerate = 0;
  for (let i = 0; i < soup.length; i += 9) {
    for (let k = 0; k < 9; k += 1) if (!Number.isFinite(soup[i + k])) nan = true;
    const v = [id(i), id(i + 3), id(i + 6)];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) { degenerate += 1; continue; }
    for (let k = 0; k < 3; k += 1) {
      const a = v[k], b = v[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
      directed.set(`${a},${b}`, (directed.get(`${a},${b}`) ?? 0) + 1);
    }
  }
  let open = 0, two = 0, more = 0;
  for (const c of uses.values()) { if (c === 1) open += 1; else if (c === 2) two += 1; else more += 1; }
  let twiceSameWay = 0;
  for (const c of directed.values()) if (c > 1) twiceSameWay += 1;
  return { open, two, more, twiceSameWay, nan, degenerate };
}
function signedVolume(soup: ArrayLike<number>) {
  let v = 0;
  for (let i = 0; i < soup.length; i += 9) {
    const a = new THREE.Vector3(soup[i], soup[i + 1], soup[i + 2]), b = new THREE.Vector3(soup[i + 3], soup[i + 4], soup[i + 5]), c = new THREE.Vector3(soup[i + 6], soup[i + 7], soup[i + 8]);
    v += a.dot(b.cross(c)) / 6;
  }
  return v;
}

describe("bridge (build 77)", () => {
  it("bridges two coaxial tubes of different corner counts into one tube of the same radius", () => {
    const soup = [...tube(5, 10, 32, 0), ...tube(5, 10, 48, 16, 0, 0.37)];
    const loops = rimLoopsOfSoup(soup);
    expect(loops.length).toBe(4);
    const top = loops.find((l) => Math.abs(l[0][1] - 10) < 1e-3)!;
    const bottom = loops.find((l) => Math.abs(l[0][1] - 16) < 1e-3)!;
    const result = bridgeLoops(soup, top, bottom);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flipped).toBe(false);
    expect(result.segments).toBeGreaterThan(3);
    const report = edgeReport(result.soup);
    expect(report.nan).toBe(false);
    expect(report.more).toBe(0);
    expect(report.twiceSameWay).toBe(0);
    expect(report.degenerate).toBe(0);
    // Only the two far ends stay open.
    const after = rimLoopsOfSoup(result.soup);
    expect(after.length).toBe(2);
    expect(report.open).toBe(32 + 48);
    // Every corner in the gap on the cylinder of radius 5.
    let worst = 0, count = 0;
    for (let i = 0; i < result.soup.length; i += 3) {
      const y = result.soup[i + 1];
      if (y <= 10.01 || y >= 15.99) continue;
      worst = Math.max(worst, Math.abs(Math.hypot(result.soup[i], result.soup[i + 2]) - 5));
      count += 1;
    }
    expect(count).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.1);
    // Outward facing: the bridge triangles' normals point away from the axis.
    for (let i = 0; i < result.soup.length; i += 9) {
      const a = new THREE.Vector3(result.soup[i], result.soup[i + 1], result.soup[i + 2]);
      const b = new THREE.Vector3(result.soup[i + 3], result.soup[i + 4], result.soup[i + 5]);
      const c = new THREE.Vector3(result.soup[i + 6], result.soup[i + 7], result.soup[i + 8]);
      const centre = a.clone().add(b).add(c).divideScalar(3);
      if (centre.y < 10.2 || centre.y > 15.8) continue;
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      expect(n.dot(new THREE.Vector3(centre.x, 0, centre.z))).toBeGreaterThan(0);
    }
  });

  it("closes a capsule: two closed-ended cups bridged give a closed outward-facing solid", () => {
    const cupA = soupOf(new THREE.SphereGeometry(5, 40, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)); // lower half, open at y=0
    const cupB = soupOf(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 8, 0));
    const result = bridgeNearestRims([...cupA, ...cupB], [5, 0, 0], [0, 8, 5], { refine: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = edgeReport(result.soup);
    expect(report.open).toBe(0);
    expect(report.more).toBe(0);
    expect(report.twiceSameWay).toBe(0);
    // Two half balls and a cylinder 8 long.
    const expected = (4 / 3) * Math.PI * 125 + Math.PI * 25 * 8;
    expect(signedVolume(result.soup)).toBeGreaterThan(expected * 0.95);
    expect(signedVolume(result.soup)).toBeLessThan(expected * 1.01);
  });

  it("turns over a second shell that faces inwards", () => {
    const soup = [...tube(5, 10, 32, 0), ...flipSoup(tube(5, 10, 32, 14))];
    const result = bridgeNearestRims(soup, [5, 10, 0], [5, 14, 0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flipped).toBe(true);
    const report = edgeReport(result.soup);
    expect(report.twiceSameWay).toBe(0);
    expect(report.open).toBe(64);
    // A straight tube across the gap, not an hourglass.
    for (let i = 0; i < result.soup.length; i += 3) if (result.soup[i + 1] > 10.01 && result.soup[i + 1] < 13.99) expect(Math.hypot(result.soup[i], result.soup[i + 2])).toBeGreaterThan(4.9);
  });

  it("bridges two side-by-side rims facing the same way (a handle) without twisting", () => {
    const soup = [...tube(3, 6, 24, 0, -8), ...tube(3, 6, 24, 0, 8)];
    const result = bridgeNearestRims(soup, [-8, 6, 3], [8, 6, 3], { segments: 8, smooth: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flipped).toBe(false);
    const report = edgeReport(result.soup);
    expect(report.twiceSameWay).toBe(0);
    expect(report.more).toBe(0);
    expect(report.open).toBe(48);
    // The bridge arcs up out of both rims (they face up), and no triangle of it is folded flat.
    let smallest = Infinity;
    for (let i = 0; i < result.soup.length; i += 9) {
      const a = new THREE.Vector3(result.soup[i], result.soup[i + 1], result.soup[i + 2]);
      const b = new THREE.Vector3(result.soup[i + 3], result.soup[i + 4], result.soup[i + 5]);
      const c = new THREE.Vector3(result.soup[i + 6], result.soup[i + 7], result.soup[i + 8]);
      if (a.y < 6.01 && b.y < 6.01 && c.y < 6.01) continue;
      expect(Math.min(a.y, b.y, c.y)).toBeGreaterThan(5.99);
      smallest = Math.min(smallest, b.sub(a).cross(c.sub(a)).length() / 2);
    }
    expect(smallest).toBeGreaterThan(0.01);
  });

  it("refuses a single rim and a rim that is not one", () => {
    const one = tube(5, 10, 16, 0);
    const res = bridgeNearestRims(one, [5, 0, 0], [5, 10, 0]);
    expect(res.ok).toBe(true);
    const same = bridgeNearestRims(one, [5, 10, 0], [-5, 10, 0]);
    expect(same).toEqual({ ok: false, reason: "same-rim" });
    const notRim = bridgeLoops(one, [[1, 2, 3], [4, 5, 6], [7, 8, 9]], [[5, 10, 0]]);
    expect(notRim).toEqual({ ok: false, reason: "not-a-rim" });
  });

  it("bridges on a 200k-triangle mesh quickly", () => {
    const soup = [...tube(20, 40, 500, 0, 0, 0, 100), ...tube(20, 40, 500, 50, 0, 0.003, 100)];
    expect(soup.length / 9).toBe(200000);
    const t0 = performance.now();
    const result = bridgeNearestRims(soup, [20, 40, 0], [20, 50, 0]);
    const ms = performance.now() - t0;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flipped).toBe(false);
    expect(result.segments).toBe(40);
    const report = edgeReport(result.soup);
    expect(report.open).toBe(1000);
    expect(report.twiceSameWay).toBe(0);
    console.log(`bridge 200k: ${ms.toFixed(0)} ms, ${result.added} bridge triangles, ${result.segments} rings`);
    expect(ms).toBeLessThan(15000);
  }, 30000);
});

describe("join (build 77)", () => {
  const upper = (segments: number) => soupOf(new THREE.SphereGeometry(10, segments, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  const lower = (segments: number, gap: number) => soupOf(new THREE.SphereGeometry(10, segments, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.Matrix4().makeTranslation(0, -gap, 0));

  it("zips two halves with matching rims a hair apart into a closed ball", () => {
    const result = joinOpenEdges([...upper(32), ...lower(32, 0.01)], 0.1);
    expect(result.openBefore).toBe(64);
    expect(result.openAfter).toBe(0);
    expect(result.merged).toBe(32);
    const report = edgeReport(result.soup);
    expect(report.open).toBe(0);
    expect(report.more).toBe(0);
    expect(report.twiceSameWay).toBe(0);
    expect(signedVolume(result.soup)).toBeGreaterThan(0);
  });

  it("zips rims with different corner counts by putting corners into the opposite edges", () => {
    const result = joinOpenEdges([...upper(32), ...lower(48, 0.02)], 0.4);
    expect(result.inserted).toBeGreaterThan(0);
    const report = edgeReport(result.soup);
    expect(report.nan).toBe(false);
    expect(report.open).toBe(0);
    expect(report.more).toBe(0);
    expect(report.twiceSameWay).toBe(0);
  });

  it("turns over a half that faces inwards", () => {
    const result = joinOpenEdges([...upper(32), ...flipSoup(lower(32, 0.01))], 0.05);
    expect(result.flipped).toBe(1);
    const report = edgeReport(result.soup);
    expect(report.open).toBe(0);
    expect(report.twiceSameWay).toBe(0);
    expect(signedVolume(result.soup)).toBeGreaterThan(4000);
  });

  it("leaves rims further apart than the tolerance alone", () => {
    const result = joinOpenEdges([...upper(32), ...lower(32, 2)], 0.5);
    expect(result.merged).toBe(0);
    expect(result.openAfter).toBe(64);
  });

  it("joins a 200k-triangle pair of halves quickly", () => {
    const top = soupOf(new THREE.SphereGeometry(20, 560, 100, 0, Math.PI * 2, 0, Math.PI / 2));
    const bottom = soupOf(new THREE.SphereGeometry(20, 440, 100, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.Matrix4().makeTranslation(0, -0.01, 0));
    const t0 = performance.now();
    const result = joinOpenEdges([...top, ...bottom], 0.2);
    const ms = performance.now() - t0;
    console.log(`join ${(top.length + bottom.length) / 9} soup triangles: ${ms.toFixed(0)} ms, ${result.merged} merged, ${result.inserted} inserted`);
    expect(result.openAfter).toBe(0);
    expect(ms).toBeLessThan(15000);
  }, 30000);
});
