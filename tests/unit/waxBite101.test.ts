import { describe, expect, it } from "vitest";
import { occlusionWork } from "@/lib/waxOcclusion";

/* Build 101: the wax-up complies with the bite - at the patient's own bite unless it is opened on purpose. */

/** A flat plate at height z, its triangles facing up (+1) or down (-1). */
function plate(z: number, facing: 1 | -1, step = 0.5) {
  const out: number[] = [];
  for (let x = -30; x < 30; x += step) for (let y = -30; y < 10; y += step) {
    const a = [x, y, z], b = [x + step, y, z], c = [x + step, y + step, z], d = [x, y + step, z];
    if (facing > 0) out.push(...a, ...b, ...c, ...a, ...c, ...d);
    else out.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  return Float32Array.from(out);
}
/** A box from z0 to z1 (corners every `step` on its faces), outward-facing. */
function box(cx: number, cy: number, half: number, z0: number, z1: number, step = 0.25) {
  const out: number[] = [];
  const quad = (p: (u: number, v: number) => number[], nu: number, nv: number) => {
    for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) {
      const a = p(i / nu, j / nv), b = p((i + 1) / nu, j / nv), c = p((i + 1) / nu, (j + 1) / nv), d = p(i / nu, (j + 1) / nv);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  };
  const n = Math.round((2 * half) / step), m = Math.max(1, Math.round((z1 - z0) / step));
  const x0 = cx - half, x1 = cx + half, y0 = cy - half, y1 = cy + half;
  quad((u, v) => [x0 + (x1 - x0) * v, y0 + (y1 - y0) * u, z0], n, n); // bottom (facing -z)
  quad((u, v) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, z1], n, n); // top
  quad((u, v) => [x0 + (x1 - x0) * u, y0, z0 + (z1 - z0) * v], n, m);
  quad((u, v) => [x1, y0 + (y1 - y0) * u, z0 + (z1 - z0) * v], n, m);
  quad((u, v) => [x0 + (x1 - x0) * v, y1, z0 + (z1 - z0) * u], n, m);
  quad((u, v) => [x0, y0 + (y1 - y0) * v, z0 + (z1 - z0) * u], n, m);
  return Float32Array.from(out);
}
const minZ = (p: Float32Array) => { let m = Infinity; for (let i = 2; i < p.length; i += 3) m = Math.min(m, p[i]); return m; };

describe("wax-up fits the bite", () => {
  // The lower's teeth meet the plane z = 0; the upper's at z = 0 too (in contact).
  const lowerScan = plate(0, 1), upperScan = plate(0.02, -1);
  it("trims upper front wax that would sit inside the lower teeth back to touch them, at the bite as scanned", () => {
    const wax = box(0, -20, 3, -0.5, 1.5);
    const result = occlusionWork({ upperScan, upperFdi: null, lowerScan, lowerFdi: null, upperWax: [{ fdi: 11, positions: wax }], lowerWax: [], raise: 0 });
    const fitted = result.fitted.find((f) => f.fdi === 11);
    expect(fitted?.mm ?? 0).toBeGreaterThan(0.4);
    // Nothing left inside the lower teeth (to the tolerance).
    expect(minZ(result.upperWax[0].positions)).toBeGreaterThan(-0.03);
    // Not opened: the lower stays where it was.
    expect(result.openings.find((o) => o.fdi === 0)?.mm).toBe(0);
  }, 60_000);
  it("trims lower wax back below the upper teeth too", () => {
    const wax = box(0, -20, 3, -1.5, 0.6);
    const result = occlusionWork({ upperScan, upperFdi: null, lowerScan, lowerFdi: null, upperWax: [], lowerWax: [{ fdi: 41, positions: wax }], raise: 0 });
    let top = -Infinity;
    const p = result.lowerWax[0].positions;
    for (let i = 2; i < p.length; i += 3) top = Math.max(top, p[i]);
    expect(top).toBeLessThan(0.05);
    // Every lower tooth's closest approach is read as touching or clear, not inside.
    for (const r of result.rest) expect(r.gap).toBeGreaterThan(-0.03);
  }, 60_000);
  it("leaves wax that clears the bite alone", () => {
    const wax = box(0, -20, 3, 0.3, 1.5);
    const result = occlusionWork({ upperScan, upperFdi: null, lowerScan, lowerFdi: null, upperWax: [{ fdi: 11, positions: wax }], lowerWax: [], raise: 0 });
    expect(result.fitted.length).toBe(0);
    expect(minZ(result.upperWax[0].positions)).toBeCloseTo(0.3, 5);
  }, 60_000);
});
