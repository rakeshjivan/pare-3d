import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { alignToPlate, planeOfSelection } from "@/lib/meshAlign";

function soupOf(g: THREE.BufferGeometry, m = new THREE.Matrix4()) {
  const geo = (g.index ? g.toNonIndexed() : g).clone().applyMatrix4(m);
  return Array.from((geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array);
}
function normalOf(s: ArrayLike<number>, t: number) {
  const i = t * 9;
  const a = new THREE.Vector3(s[i], s[i + 1], s[i + 2]), b = new THREE.Vector3(s[i + 3], s[i + 4], s[i + 5]), c = new THREE.Vector3(s[i + 6], s[i + 7], s[i + 8]);
  return b.sub(a).cross(c.sub(a)).normalize();
}
function apply(s: number[], m: THREE.Matrix4) {
  const v = new THREE.Vector3();
  const out = s.slice();
  for (let i = 0; i < out.length; i += 3) { v.set(out[i], out[i + 1], out[i + 2]).applyMatrix4(m); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
  return out;
}
/** Chosen: triangles whose normal is near `n`. */
function choose(s: number[], n: THREE.Vector3) {
  const out = new Uint8Array(s.length / 9);
  for (let t = 0; t < out.length; t += 1) out[t] = normalOf(s, t).dot(n) > 0.999 ? 1 : 0;
  return out;
}
function expectRigid(m: THREE.Matrix4) {
  const e = m.elements;
  const x = new THREE.Vector3(e[0], e[1], e[2]), y = new THREE.Vector3(e[4], e[5], e[6]), z = new THREE.Vector3(e[8], e[9], e[10]);
  expect(x.length()).toBeCloseTo(1, 9); expect(y.length()).toBeCloseTo(1, 9); expect(z.length()).toBeCloseTo(1, 9);
  expect(x.dot(y)).toBeCloseTo(0, 9); expect(y.dot(z)).toBeCloseTo(0, 9);
  expect(m.determinant()).toBeCloseTo(1, 9);
  expect(e[3]).toBe(0); expect(e[7]).toBe(0); expect(e[11]).toBe(0); expect(e[15]).toBe(1);
}

describe("align to plate (build 77)", () => {
  const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.7, -1.1, 0.4)).premultiply(new THREE.Matrix4().makeTranslation(30, -12, 7));

  for (const [name, face] of [["a side", new THREE.Vector3(1, 0, 0)], ["the underside", new THREE.Vector3(0, -1, 0)], ["the top (a half turn)", new THREE.Vector3(0, 1, 0)]] as const) {
    it(`puts ${name} of a tilted box flat on the plate`, () => {
      const box = soupOf(new THREE.BoxGeometry(20, 8, 12, 3, 2, 2), tilt);
      const chosen = choose(box, face.clone().transformDirection(tilt));
      expect(chosen.reduce((s, x) => s + x, 0)).toBeGreaterThan(0);
      const m = alignToPlate(box, chosen)!;
      expectRigid(m);
      const moved = apply(box, m);
      let lowest = Infinity;
      for (let i = 1; i < moved.length; i += 3) lowest = Math.min(lowest, moved[i]);
      expect(lowest).toBeCloseTo(0, 6);
      for (let t = 0; t < chosen.length; t += 1) {
        if (!chosen[t]) continue;
        expect(normalOf(moved, t).y).toBeCloseTo(-1, 6);
        for (let k = 0; k < 3; k += 1) expect(Math.abs(moved[t * 9 + k * 3 + 1])).toBeLessThan(1e-4);
      }
    });
  }

  it("keeps the patch's centre where it was across the plate", () => {
    const box = soupOf(new THREE.BoxGeometry(20, 8, 12), tilt);
    const chosen = choose(box, new THREE.Vector3(0, 0, 1).transformDirection(tilt));
    const before = planeOfSelection(box, chosen)!;
    const after = planeOfSelection(apply(box, alignToPlate(box, chosen)!), chosen)!;
    expect(after.centre.x).toBeCloseTo(before.centre.x, 5);
    expect(after.centre.z).toBeCloseTo(before.centre.z, 5);
    expect(after.normal.y).toBeCloseTo(-1, 9);
  });

  it("finds the least-squares plane of a curved patch (area weighted)", () => {
    // A cap of a ball round axis `axis`.
    const axis = new THREE.Vector3(0.3, -0.8, 0.52).normalize();
    const ball = soupOf(new THREE.SphereGeometry(10, 96, 48), new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)));
    const chosen = new Uint8Array(ball.length / 9);
    for (let t = 0; t < chosen.length; t += 1) {
      const c = new THREE.Vector3(ball[t * 9] + ball[t * 9 + 3] + ball[t * 9 + 6], ball[t * 9 + 1] + ball[t * 9 + 4] + ball[t * 9 + 7], ball[t * 9 + 2] + ball[t * 9 + 5] + ball[t * 9 + 8]).divideScalar(3);
      chosen[t] = c.clone().normalize().dot(axis) > 0.8 ? 1 : 0;
    }
    const plane = planeOfSelection(ball, chosen)!;
    expect(plane.normal.dot(axis)).toBeGreaterThan(0.9999);
    expect(plane.spread).toBeGreaterThan(0.1);
    // A flat patch: no spread.
    const flat = soupOf(new THREE.PlaneGeometry(10, 10, 5, 5));
    const flatPlane = planeOfSelection(flat, new Uint8Array(flat.length / 9).fill(1))!;
    expect(flatPlane.spread).toBeLessThan(1e-6);
    expect(flatPlane.normal.z).toBeCloseTo(1, 9);
    expect(flatPlane.area).toBeCloseTo(100, 6);
  });

  it("gives null for nothing chosen", () => {
    const box = soupOf(new THREE.BoxGeometry(2, 2, 2));
    expect(alignToPlate(box, new Uint8Array(box.length / 9))).toBeNull();
  });

  it("aligns a 200k-triangle part quickly", () => {
    const ball = soupOf(new THREE.IcosahedronGeometry(20, 99), tilt);
    const chosen = new Uint8Array(ball.length / 9);
    for (let t = 0; t < chosen.length; t += 2) chosen[t] = 1;
    const t0 = performance.now();
    const m = alignToPlate(ball, chosen);
    const ms = performance.now() - t0;
    expect(m).not.toBeNull();
    expectRigid(m!);
    console.log(`align 200k: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(3000);
  });
});
