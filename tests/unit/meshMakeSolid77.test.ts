import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeSolid } from "@/lib/meshMakeSolid";

function soupOf(g: THREE.BufferGeometry, m = new THREE.Matrix4()) {
  const geo = (g.index ? g.toNonIndexed() : g).clone().applyMatrix4(m);
  return Array.from((geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array);
}
function flipSoup(s: number[]) {
  const out = s.slice();
  for (let i = 0; i < out.length; i += 9) for (let k = 0; k < 3; k += 1) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; }
  return out;
}
/** Every edge used exactly twice, each way once; no NaN. */
function closedReport(soup: ArrayLike<number>) {
  const ids = new Map<string, number>();
  const id = (i: number) => { const k = `${soup[i]},${soup[i + 1]},${soup[i + 2]}`; let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
  const directed = new Map<string, number>();
  let nan = false;
  for (let i = 0; i < soup.length; i += 9) {
    for (let k = 0; k < 9; k += 1) if (!Number.isFinite(soup[i + k])) nan = true;
    const v = [id(i), id(i + 3), id(i + 6)];
    for (let k = 0; k < 3; k += 1) { const key = `${v[k]},${v[(k + 1) % 3]}`; directed.set(key, (directed.get(key) ?? 0) + 1); }
  }
  let unpaired = 0, doubled = 0;
  for (const [key, c] of directed) { if (c > 1) doubled += 1; const [a, b] = key.split(","); if (!directed.has(`${b},${a}`)) unpaired += 1; }
  return { nan, unpaired, doubled };
}
function signedVolume(soup: ArrayLike<number>) {
  let v = 0;
  for (let i = 0; i < soup.length; i += 9) {
    v += (soup[i] * (soup[i + 4] * soup[i + 8] - soup[i + 5] * soup[i + 7]) - soup[i + 1] * (soup[i + 3] * soup[i + 8] - soup[i + 5] * soup[i + 6]) + soup[i + 2] * (soup[i + 3] * soup[i + 7] - soup[i + 4] * soup[i + 6])) / 6;
  }
  return v;
}

describe("make solid (build 77)", () => {
  let runtime: ManifoldToplevel;
  beforeAll(async () => { runtime = await manifoldModule(); runtime.setup(); });

  it("keeps a closed ball's volume within 2% at fine detail", () => {
    const soup = soupOf(new THREE.IcosahedronGeometry(10, 12));
    const input = signedVolume(soup);
    const r = makeSolid(soup, { detail: 0.4 }, runtime);
    expect(r.solid.status()).toBe("NoError");
    expect(r.solid.genus()).toBe(0);
    expect(r.bodies).toBe(1);
    expect(r.detail).toBeCloseTo(0.4, 6);
    const rep = closedReport(r.soup);
    expect(rep).toEqual({ nan: false, unpaired: 0, doubled: 0 });
    expect(Math.abs(r.solid.volume() / input - 1)).toBeLessThan(0.02);
    expect(signedVolume(r.soup)).toBeGreaterThan(0);
    r.solid.delete();
  });

  it("closes an open hemisphere bowl into a solid half ball", () => {
    // The lower half of a ball, open at y = 0 (a cup).
    const soup = soupOf(new THREE.SphereGeometry(10, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
    const r = makeSolid(soup, { detail: 0.5 }, runtime);
    expect(r.solid.status()).toBe("NoError");
    expect(r.bodies).toBe(1);
    expect(r.solid.genus()).toBe(0);
    expect(closedReport(r.soup)).toEqual({ nan: false, unpaired: 0, doubled: 0 });
    const half = (2 / 3) * Math.PI * 1000;
    expect(Math.abs(r.solid.volume() / half - 1)).toBeLessThan(0.05);
    const box = r.solid.boundingBox();
    expect(box.max[1]).toBeLessThan(0.6);
    expect(box.min[1]).toBeGreaterThan(-10.5);
    r.solid.delete();
  });

  it("closes an open scan-like sheet with a hole, and keeps an inside-out shell inside", () => {
    // A box with one side missing and a hole in another, one wall turned inside out.
    const box = soupOf(new THREE.BoxGeometry(20, 10, 14, 10, 5, 7));
    const kept: number[] = [];
    for (let i = 0; i < box.length; i += 9) {
      const cy = (box[i + 1] + box[i + 4] + box[i + 7]) / 3, cx = (box[i] + box[i + 3] + box[i + 6]) / 3, cz = (box[i + 2] + box[i + 5] + box[i + 8]) / 3;
      if (cy > 4.99) continue; // open top
      if (cz > 6.99 && Math.abs(cx) < 3 && Math.abs(cy) < 2) continue; // a hole in the front
      const tri = box.slice(i, i + 9);
      kept.push(...(cx < -9.99 ? flipSoup(tri) : tri)); // left wall inside out
    }
    const r = makeSolid(kept, { detail: 0.5 }, runtime);
    expect(r.solid.status()).toBe("NoError");
    expect(r.bodies).toBe(1);
    expect(r.solid.genus()).toBe(0);
    expect(Math.abs(r.solid.volume() / (20 * 10 * 14) - 1)).toBeLessThan(0.02);
    r.solid.delete();
  });

  it("unites overlapping shells into one body", () => {
    const a = soupOf(new THREE.IcosahedronGeometry(6, 8));
    const b = soupOf(new THREE.IcosahedronGeometry(6, 8), new THREE.Matrix4().makeTranslation(6, 0, 0));
    const r = makeSolid([...a, ...b], { detail: 0.3 }, runtime);
    expect(r.solid.status()).toBe("NoError");
    expect(r.bodies).toBe(1);
    expect(r.solid.genus()).toBe(0);
    // Two balls of radius 6 with centres 6 apart: 2 * (4/3)pi r^3 - lens; lens = pi (4r + d)(2r - d)^2 / 12.
    const R = 6, d = 6;
    const union = 2 * (4 / 3) * Math.PI * R ** 3 - (Math.PI * (4 * R + d) * (2 * R - d) ** 2) / 12;
    expect(Math.abs(r.solid.volume() / union - 1)).toBeLessThan(0.03);
    r.solid.delete();
  });

  it("offsets outwards, and keeps a lone sheet as a wall with a minimum thickness", () => {
    const ball = soupOf(new THREE.IcosahedronGeometry(5, 10));
    const grown = makeSolid(ball, { detail: 0.3, offset: 1 }, runtime);
    expect(Math.abs(grown.solid.volume() / ((4 / 3) * Math.PI * 216) - 1)).toBeLessThan(0.03);
    grown.solid.delete();
    const sheet = soupOf(new THREE.PlaneGeometry(10, 10, 4, 4));
    expect(() => makeSolid(sheet, { detail: 0.5 }, runtime)).toThrow();
    const wall = makeSolid(sheet, { detail: 0.25, minThickness: 1 }, runtime);
    expect(wall.solid.status()).toBe("NoError");
    expect(Math.abs(wall.solid.volume() / 100 - 1)).toBeLessThan(0.15);
    wall.solid.delete();
  });

  it("coarsens the detail to stay under the voxel cap", () => {
    const soup = soupOf(new THREE.IcosahedronGeometry(10, 4));
    const r = makeSolid(soup, { detail: 0.05, maxVoxels: 200_000 }, runtime);
    expect(r.voxels).toBeLessThanOrEqual(200_000);
    expect(r.detail).toBeGreaterThan(0.05);
    expect(r.solid.status()).toBe("NoError");
    r.solid.delete();
  });

  it("makes a 200k-triangle mesh solid in reasonable time", () => {
    const soup = soupOf(new THREE.IcosahedronGeometry(20, 99));
    expect(soup.length / 9).toBe(200000);
    const t0 = performance.now();
    const r = makeSolid(soup, { detail: 0.5 }, runtime);
    const ms = performance.now() - t0;
    expect(r.solid.status()).toBe("NoError");
    expect(r.bodies).toBe(1);
    console.log(`make solid 200k at 0.5 mm: ${ms.toFixed(0)} ms, ${r.voxels} voxels, ${r.soup.length / 9} triangles out`);
    expect(ms).toBeLessThan(20000);
    r.solid.delete();
  }, 30000);
});
