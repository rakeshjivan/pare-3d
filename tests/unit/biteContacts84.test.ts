import { describe, expect, it } from "vitest";
import { bandOf, biteContactMap, contactColors, signedDistances } from "@/lib/biteContacts";

/** A flat sheet at height z (n x n squares over [-10, 10]), facing up or down. */
function sheet(z: number, up: boolean, n = 40, bump?: (x: number, y: number) => number) {
  const out: number[] = [];
  const s = 20 / n;
  const at = (i: number, j: number) => { const x = -10 + i * s, y = -10 + j * s; return [x, y, z + (bump ? bump(x, y) : 0)]; };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    if (up) out.push(...a, ...b, ...c, ...a, ...c, ...d); else out.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  return out;
}

describe("bite contacts & clearance (build 84)", () => {
  it("measures clearance above a lower arch facing up", () => {
    const lower = sheet(0, true);
    const upper = sheet(0.08, false);
    const d = signedDistances(upper, lower);
    const inside = Array.from(d).filter((v) => Number.isFinite(v));
    expect(inside.length).toBeGreaterThan(1000);
    for (const v of inside) expect(v).toBeCloseTo(0.08, 4);
  });

  it("an overlap reads negative, and a lower saved inside out is turned round", () => {
    const lower = sheet(0, true);
    // The upper's middle reaches 0.12 mm into the lower; the rest stands 0.15 mm clear.
    const upper = sheet(0.15, false, 40, (x, y) => -0.27 * Math.exp(-(x * x + y * y) / 4));
    const flipped = sheet(0, false);
    for (const target of [lower, flipped]) {
      const d = signedDistances(upper, target);
      let min = Infinity;
      for (const v of d) if (Number.isFinite(v)) min = Math.min(min, v);
      expect(min).toBeCloseTo(-0.12, 2);
    }
  });

  it("bands, colours and the summary", () => {
    expect(bandOf(-0.2)?.key).toBe("overlapDeep");
    expect(bandOf(-0.07)?.key).toBe("overlap");
    expect(bandOf(-0.01)?.key).toBe("touch");
    expect(bandOf(0.02)?.key).toBe("close");
    expect(bandOf(0.07)?.key).toBe("near");
    expect(bandOf(0.15)?.key).toBe("clear");
    expect(bandOf(0.3)).toBeNull();
    expect(bandOf(Number.NaN)).toBeNull();
    const lower = sheet(0, true);
    const upper = sheet(0.15, false, 40, (x, y) => -0.27 * Math.exp(-(x * x + y * y) / 4));
    const map = biteContactMap(upper, lower);
    expect(map.upperStats.maxOverlap).toBeCloseTo(0.12, 2);
    expect(map.upperStats.overlapArea).toBeGreaterThan(1);
    expect(map.upperStats.contactArea).toBeGreaterThan(map.upperStats.overlapArea);
    const colors = contactColors(map.upper, "#919191");
    expect(colors.length).toBe(map.upper.length * 3);
    // A far corner keeps the scan's grey.
    const far = Array.from(map.upper).findIndex((v) => !Number.isFinite(v) || v > 0.2);
    if (far >= 0) expect(colors[far * 3]).toBeCloseTo(0x91 / 255, 3);
  });

  it("is quick on a scan-sized pair", () => {
    const lower = sheet(0, true, 250);
    const upper = sheet(0.05, false, 250, (x, y) => 0.3 * Math.sin(x) * Math.cos(y));
    const start = performance.now();
    biteContactMap(upper, lower);
    // 125,000 triangles each; a few seconds at most even in a slow container.
    expect(performance.now() - start).toBeLessThan(15000);
  }, 30000);
});
