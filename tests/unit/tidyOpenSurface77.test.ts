import { describe, expect, it } from "vitest";
import { meshHealth, tidyOpenSurface } from "@/lib/meshRepair";

/** A flat grid of squares (two triangles each), open all round like a scan. */
function sheet(n: number, at = [0, 0, 0]): number[] {
  const out: number[] = [];
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) {
    const a = [at[0] + i, at[1] + j, at[2]], b = [at[0] + i + 1, at[1] + j, at[2]], c = [at[0] + i + 1, at[1] + j + 1, at[2]], d = [at[0] + i, at[1] + j + 1, at[2]];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return out;
}

describe("tidying a trimmed scan (build 77)", () => {
  it("takes out what a slicer calls non-manifold and keeps the scan open", () => {
    const base = sheet(30);
    // A fin standing on one of the sheet's edges: that edge has three triangles.
    const fin = [5, 5, 0, 6, 5, 0, 5.5, 5, 3];
    // A bow-tie: a triangle touching the sheet's far corner at one point only.
    const tie = [30, 30, 0, 31, 30, 0, 31, 31, 0];
    // A speck cut loose.
    const speck = sheet(1, [50, 50, 0]);
    const before = meshHealth([...base, ...fin, ...tie, ...speck]);
    expect(before.brokenEdges).toBeGreaterThan(0);
    const tidy = tidyOpenSurface([...base, ...fin, ...tie, ...speck]);
    expect(tidy.broken).toBeGreaterThan(0);
    expect(tidy.pinched).toBe(1);
    expect(tidy.specks).toBe(2);
    const after = meshHealth(tidy.positions);
    expect(after.brokenEdges).toBe(0);
    // The sheet itself is all there - less the three triangles on the fin's edge - and still open.
    expect(tidy.positions.length / 9).toBeGreaterThan(base.length / 9 - 3);
    expect(after.openings).toBeGreaterThan(0);
  });
  it("leaves a sound open scan exactly as it was", () => {
    const base = sheet(20);
    const tidy = tidyOpenSurface(base);
    expect(tidy.broken + tidy.pinched + tidy.specks).toBe(0);
    expect(Array.from(tidy.positions)).toEqual(base);
  });
});
