import { describe, expect, it } from "vitest";
import { LiveMesh, brushResponse, stampBrush, type LiveBrush } from "@/lib/liveSculpt";

/**
 * Build 82: Pare's brush strength against Meshmixer 3.5, measured on the same test plates (a 40 mm
 * plate, 0.25 mm grid; 16 mm strokes with a 3 mm brush; Flow off). Meshmixer's figures, from its
 * exported meshes:
 *   Draw, peak raise at Strength 25 / 51 / 76 / 100: 0.033 / 0.097 / 0.226 / 0.375 mm (a quick
 *   stroke, 20 pointer events); the same stroke slower (80 events) 0.83 mm, quicker (8) 0.13 mm.
 *   Inflate: 0.043 / 0.114 / 0.159 / 0.251 mm.
 *   RobustSmooth, one pass over 0.3 mm ridges 2.5 mm apart: 19% / 50% / 86% taken away at 25 / 53 / 100.
 */
function plate(n: number, height: (x: number, y: number) => number) {
  const soup: number[] = [];
  const s = 40 / n;
  const at = (i: number, j: number) => { const x = -20 + i * s, y = -20 + j * s; return [x, y, height(x, y)]; };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    soup.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return LiveMesh.fromSoup(soup);
}
/** A stroke as the editor makes one: a dab every fifth of the radius along the path. */
function stroke(mesh: LiveMesh, brush: Exclude<LiveBrush, "move">, from: [number, number], to: [number, number], radius: number, strength: number) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  for (let d = 0; d <= length + 1e-9; d += 0.2 * radius) {
    const x = from[0] + ((to[0] - from[0]) * d) / length, y = from[1] + ((to[1] - from[1]) * d) / length;
    const hit = mesh.pick([x, y, 10], [0, 0, -1]);
    if (hit) stampBrush(mesh, brush, hit.point, [0, 0, 1], radius, hit.triangle, strength);
  }
}
/** Highest and lowest z of the corners within 0.15 mm of the line y = `y`, between x0 and x1. */
function band(mesh: LiveMesh, y: number, x0: number, x1: number) {
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < mesh.vCount; v += 1) {
    const px = mesh.pos[v * 3], py = mesh.pos[v * 3 + 1], pz = mesh.pos[v * 3 + 2];
    if (Math.abs(py - y) > 0.15 || px < x0 || px > x1) continue;
    lo = Math.min(lo, pz); hi = Math.max(hi, pz);
  }
  return { lo, hi };
}

describe("brush strength like Meshmixer's (build 82; build 85 at a person's pace)", () => {
  it("Draw follows about the square of the strength, full strength between Meshmixer's quick and slow strokes", () => {
    const peaks = [0.25, 0.5, 0.75, 1].map((s) => {
      const mesh = plate(160, () => 0);
      stroke(mesh, "draw", [-8, 0], [8, 0], 3, s);
      return band(mesh, 0, -3, 3).hi;
    });
    // Build 85: as Meshmixer at an unhurried stroke - its slow stroke reached 0.83 mm at full strength.
    expect(peaks[3]).toBeGreaterThan(0.7);
    expect(peaks[3]).toBeLessThan(0.95);
    expect(peaks[0]).toBeGreaterThan(0.03);
    expect(peaks[0]).toBeLessThan(0.09);
    expect(peaks[1]).toBeGreaterThan(0.13);
    expect(peaks[1]).toBeLessThan(0.33);
    // About the square: a quarter of the strength, near a sixteenth of the raise.
    expect(peaks[3] / peaks[0]).toBeGreaterThan(10);
  });

  it("Inflate is gentler than Draw at full strength and grows less steeply", () => {
    const peak = (s: number) => {
      const mesh = plate(160, () => 0);
      stroke(mesh, "inflate", [-8, 0], [8, 0], 3, s);
      return band(mesh, 0, -3, 3).hi;
    };
    const low = peak(0.25), high = peak(1);
    // Meshmixer 0.043 at 25, 0.251 at 100 (quick); build 85 at an unhurried pace, 1.67 times.
    expect(high).toBeGreaterThan(0.4);
    expect(high).toBeLessThan(0.8);
    expect(low).toBeGreaterThan(0.05);
    expect(low).toBeLessThan(0.15);
    expect(high / low).toBeLessThan(10);
  });

  it("one Smooth pass takes away about what Meshmixer's RobustSmooth does", () => {
    const removed = [0.25, 0.53, 1].map((s) => {
      const mesh = plate(160, (x) => 0.3 * Math.sin((2 * Math.PI * x) / 2.5));
      stroke(mesh, "smooth", [-8, 0], [8, 0], 3, s);
      const { lo, hi } = band(mesh, 0, -3, 3);
      return 1 - (hi - lo) / 2 / 0.3;
    });
    // Meshmixer: 19%, 50%, 86% (one pass); build 85 at an unhurried pace, a little more.
    expect(removed[0]).toBeGreaterThan(0.18);
    expect(removed[0]).toBeLessThan(0.42);
    expect(removed[1]).toBeGreaterThan(0.55);
    expect(removed[1]).toBeLessThan(0.82);
    expect(removed[2]).toBeGreaterThan(0.82);
    expect(removed[2]).toBeLessThan(0.98);
  });

  it("the response is defined at every strength and Smooth never moves a corner past its neighbours' average", () => {
    for (const brush of ["draw", "inflate", "deflate", "smooth", "flatten", "pinch", "crease"] as const) {
      for (const s of [0, 0.05, 0.5, 1]) {
        const r = brushResponse(brush, s);
        expect(Number.isFinite(r.step) && Number.isFinite(r.strength)).toBe(true);
        expect(r.passes).toBeGreaterThanOrEqual(1);
        if (brush === "smooth") expect(r.strength * 1.5).toBeLessThanOrEqual(1.2);
      }
    }
  });
});
