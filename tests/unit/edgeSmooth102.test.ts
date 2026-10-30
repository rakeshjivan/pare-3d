import { describe, expect, it } from "vitest";
import { smoothOpenEdges, EDGE_SMOOTH_MOVE_MAX } from "@/lib/edgeSmooth";
import { boundaryLoops, weld } from "@/lib/dentalMesh";

/* Build 102: the edge a trim leaves is smoothed, not left as a sawtooth. */

/** A flat sheet 20 x 10 mm in 0.5 mm squares, its top edge cut away square by square in a sawtooth. */
function sawtoothSheet() {
  const h = 0.5, out: number[] = [];
  for (let i = 0; i < 40; i += 1) {
    const rows = 16 + (i % 2) * 3 + (i % 5 === 0 ? 1 : 0);
    for (let j = 0; j < rows; j += 1) {
      const x0 = i * h, y0 = j * h;
      out.push(x0, y0, 0, x0 + h, y0, 0, x0 + h, y0 + h, 0, x0, y0, 0, x0 + h, y0 + h, 0, x0, y0 + h, 0);
    }
  }
  // A spike: one triangle hanging off the top edge by a corner.
  out.push(5, 9.5, 0, 5.5, 9.5, 0, 5.25, 11, 0);
  return Float32Array.from(out);
}
/** How far the top edge's corners stand from a straight line through them, on average (mm). */
function edgeRoughness(positions: Float32Array) {
  const m = weld(positions, 1e-5);
  const loop = boundaryLoops(m)[0];
  const top = loop.filter((i) => m.v[i * 3 + 1] > 7 && m.v[i * 3] > 1 && m.v[i * 3] < 19);
  const ys = top.map((i) => m.v[i * 3 + 1]);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  return ys.reduce((a, b) => a + Math.abs(b - mean), 0) / ys.length;
}

describe("smoothing a trimmed edge", () => {
  it("takes the sawtooth out of the edge and the spike off it", () => {
    const sheet = sawtoothSheet();
    const before = edgeRoughness(sheet);
    const { positions, spikes } = smoothOpenEdges(sheet);
    expect(spikes).toBeGreaterThan(0);
    expect(edgeRoughness(positions)).toBeLessThan(before * 0.5);
  });
  it("moves no corner far and leaves the inside of the surface alone", () => {
    const sheet = sawtoothSheet();
    const { positions } = smoothOpenEdges(sheet);
    const before = weld(sheet, 1e-5), after = weld(positions, 1e-5);
    // The middle of the sheet: every corner still where it was.
    const inner = (v: number[]) => { const out: string[] = []; for (let i = 0; i < v.length; i += 3) if (v[i + 1] > 1 && v[i + 1] < 6 && v[i] > 1 && v[i] < 19) out.push(`${v[i].toFixed(3)},${v[i + 1].toFixed(3)}`); return out.sort().join(";"); };
    expect(inner(after.v)).toBe(inner(before.v));
    for (let i = 0; i < positions.length; i += 1) expect(Number.isFinite(positions[i])).toBe(true);
    expect(EDGE_SMOOTH_MOVE_MAX).toBeLessThan(1);
  });
});
