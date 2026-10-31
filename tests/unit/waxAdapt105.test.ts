import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { signedDistances } from "@/lib/biteContacts";
import { adaptWax, waxContactDistances } from "@/lib/waxAdapt";

const sphere = (r: number, x: number, y: number, z: number) => {
  const g = new THREE.SphereGeometry(r, 48, 32).toNonIndexed();
  g.translate(x, y, z);
  return Float32Array.from(g.getAttribute("position").array as ArrayLike<number>);
};
/** A flat sheet facing down at z = h (the opposing arch, open as a scan is). */
const sheet = (h: number) => {
  const g = new THREE.PlaneGeometry(40, 40, 60, 60).toNonIndexed();
  g.rotateX(Math.PI); // normal -z: facing the teeth below
  g.translate(0, 0, h);
  return Float32Array.from(g.getAttribute("position").array as ArrayLike<number>);
};
const min = (a: Float32Array) => a.reduce((m, v) => (Number.isNaN(v) ? m : Math.min(m, v)), Infinity);

describe("Build 105: wax teeth adapted to the bite and to each other", () => {
  // Two teeth (balls of 4 mm) overlapping by 1 mm, both 0.8 mm into an opposing surface at z = 3.2.
  const a = sphere(4, -3.5, 0, 0), b = sphere(4, 3.5, 0, 0);
  const opposing = sheet(3.2);

  it("measures overlap with the bite and between neighbours as negative", () => {
    const [da, db] = waxContactDistances([a, b], opposing);
    expect(min(da)).toBeLessThan(-0.5);
    expect(min(db)).toBeLessThan(-0.5);
  });

  it("sets the teeth back 0.1 mm from the opposing arch and cuts the overlap between them", () => {
    const { teeth } = adaptWax([{ fdi: 11, positions: a }, { fdi: 12, positions: b }], opposing, { occlusal: 0.1 });
    for (const t of teeth) {
      expect(t.bite).toBeGreaterThan(0);
      const toBite = signedDistances(t.positions, opposing, 2, true);
      expect(min(toBite)).toBeGreaterThan(0.1 - 0.06);
    }
    // 12 (further from the midline) cut where it ran into 11; 11 left whole there.
    expect(teeth[1].contact).toBeGreaterThan(0);
    expect(teeth[0].contact).toBe(0);
    const between = signedDistances(teeth[1].positions, teeth[0].positions, 2);
    expect(min(between)).toBeGreaterThan(-0.08);
  });

  it("leaves a tooth clear of everything as it was", () => {
    const lone = sphere(3, 0, 20, -5);
    const { teeth } = adaptWax([{ fdi: 13, positions: lone }], opposing);
    expect(teeth[0].bite).toBe(0);
    expect(teeth[0].contact).toBe(0);
  });
});
