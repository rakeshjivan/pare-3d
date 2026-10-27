import { describe, expect, it } from "vitest";
import { marginUp } from "@/lib/dentalArch";
import { planeNormal } from "@/lib/dentalMesh";

/** A margin running round a scan cut across its arch: level along the sides, climbing the cut face at one end. */
function cutMargin() {
  const corners: Array<[number, number, number]> = [[0, 0, 0], [60, 0, 0], [60, 0, 14], [60, 12, 14], [60, 12, 0], [0, 12, 0]];
  const v: number[] = [];
  const margin: number[] = [];
  for (let k = 0; k < corners.length; k += 1) {
    const a = corners[k], b = corners[(k + 1) % corners.length];
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.1);
    // The cut face is scanned densely (the edge climbs over a tooth): ten times the points per mm.
    const dense = a[0] === 60 && b[0] === 60 ? 10 : 1;
    for (let s = 0; s < steps * dense; s += 1) {
      const t = s / (steps * dense);
      margin.push(v.length / 3);
      v.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
  }
  // The teeth stand above the margin.
  v.push(30, 6, 20);
  return { m: { v, f: [] as number[] }, margin };
}
const tilt = (n: number[]) => (Math.acos(Math.abs(n[2]) / Math.hypot(n[0], n[1], n[2])) * 180) / Math.PI;

describe("the scan's up on an arch cut across (build 77)", () => {
  it("leans less than the margin's plane where the margin climbs the cut face, and still points to the teeth", () => {
    const { m, margin } = cutMargin();
    const plane = planeNormal(margin.map((i) => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]]));
    const up = marginUp(m, margin);
    expect(tilt(up)).toBeLessThanOrEqual(tilt(plane) + 0.5);
    expect(up[2]).toBeGreaterThan(0);
  });
  it("keeps the margin's plane for a margin that runs round near one height (a full arch)", () => {
    const v: number[] = [], margin: number[] = [];
    for (let k = 0; k < 400; k += 1) { const a = (k / 400) * Math.PI * 2; margin.push(k); v.push(25 * Math.cos(a), 20 * Math.sin(a), 0.6 * Math.sin(5 * a)); }
    v.push(0, 0, 10);
    const up = marginUp({ v, f: [] }, margin);
    const plane = planeNormal(margin.map((i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]));
    expect(Math.abs(up[0] * plane[0] + up[1] * plane[1] + up[2] * plane[2])).toBeCloseTo(1, 6);
    expect(up[2]).toBeGreaterThan(0.99);
  });
});
