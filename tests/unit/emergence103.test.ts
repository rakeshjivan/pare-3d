import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { boundaryLoops, weld } from "@/lib/dentalMesh";
import { emergeFromMargin, waxedNeighbourSides, type PlacedTooth } from "@/lib/dentalWaxup";
import { closedOrientation } from "@/lib/biteContacts";

/** A closed rounded box (a stand-in crown), its geometry a soup, centre (cx, cy), from z0 to z1. */
function crownSoup(cx: number, cy: number, z0: number, z1: number, w = 7, d = 6) {
  const g = new THREE.BoxGeometry(w, d, z1 - z0, 12, 12, 16).toNonIndexed();
  g.translate(cx, cy, (z0 + z1) / 2);
  return Float32Array.from(g.getAttribute("position").array as ArrayLike<number>);
}

/** A scalloped margin round (0, 0): lower facially (-y), higher at the papillae (±x). */
function margin() {
  const out: number[] = [];
  for (let i = 0; i < 160; i += 1) {
    const a = (i / 160) * Math.PI * 2;
    out.push(Math.cos(a) * 3.6, Math.sin(a) * 3.1, -1 + 1.2 * Math.cos(a) ** 2);
  }
  return Float32Array.from(out);
}

function placed(positions: Float32Array): PlacedTooth {
  return {
    tooth: { index: 0, kind: "central", side: 1, positions, centroid: [0, 0, 0] } as never,
    matrix: new THREE.Matrix4(), clearance: null, width: 7, length: 10, lengthening: 0, extension: 0,
    frame: { origin: [0, 0, 10], out: [0, -1, 0], mesial: [-1, 0, 0], up: [0, 0, 1] },
    positions,
  };
}

describe("Build 103: the neck rebuilt on the patient's margin", () => {
  it("ends on the margin all round, closed, whatever height the library tooth's neck stood at", () => {
    // The library tooth 2 mm short of the margin and 1.5 mm in front of the patient's.
    const tooth = placed(crownSoup(0, -1.5, 2, 10));
    const patient = crownSoup(0, 0, -1, 9, 7.2, 6.2);
    expect(emergeFromMargin(tooth, margin(), patient)).toBe(true);
    const mesh = weld(tooth.positions, 1e-5);
    expect(boundaryLoops(mesh).length).toBe(0);
    expect(closedOrientation(tooth.positions)).toBe(1);
    // Every margin point has wax within 0.5 mm (the wax ends just into the gum and just proud).
    const m = margin();
    let worst = 0;
    for (let i = 0; i < m.length; i += 3) {
      let best = Infinity;
      for (let k = 0; k < mesh.v.length; k += 3) best = Math.min(best, Math.hypot(mesh.v[k] - m[i], mesh.v[k + 1] - m[i + 1], mesh.v[k + 2] - m[i + 2]));
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(0.5);
    // The library tooth above the band is untouched: its top is where it was.
    let top = -Infinity;
    for (let k = 2; k < mesh.v.length; k += 3) top = Math.max(top, mesh.v[k]);
    expect(top).toBeCloseTo(10, 5);
  });

  it("the cut-back reaches only towards waxed neighbours", () => {
    const mesial: [number, number, number] = [1, 0, 0];
    expect(waxedNeighbourSides(11, new Set([11, 21, 12]), mesial).map((d) => d.map((x) => x + 0))).toEqual([[1, 0, 0], [-1, 0, 0]]);
    expect(waxedNeighbourSides(13, new Set([11, 12, 13]), mesial)).toEqual([[1, 0, 0]]);
    expect(waxedNeighbourSides(41, new Set([41]), mesial)).toEqual([]);
    expect(waxedNeighbourSides(31, new Set([31, 41]), mesial)).toEqual([[1, 0, 0]]);
  });

  it("a closed model is told by its own orientation; an open scan is not", () => {
    const box = crownSoup(0, 0, 0, 5);
    expect(closedOrientation(box)).toBe(1);
    const inside = box.slice();
    for (let t = 0; t < inside.length; t += 9) for (let k = 0; k < 3; k += 1) { const x = inside[t + 3 + k]; inside[t + 3 + k] = inside[t + 6 + k]; inside[t + 6 + k] = x; }
    expect(closedOrientation(inside)).toBe(-1);
    expect(closedOrientation(box.slice(0, box.length / 2))).toBeNull();
  });
});
