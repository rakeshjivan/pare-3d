import { describe, expect, it } from "vitest";
import { biteContactMap, contactColor, contactColors, contactStats, signedDistances } from "@/lib/biteContacts";

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
    // Build 96: the scanner programs' scale - red at contact, yellow at 1 mm, green at 2 mm, blue to
    // purple in overlap, nothing beyond 2 mm; Contact only keeps under 0.10 mm and the overlaps.
    const red = contactColor(0.01)!, yellow = contactColor(1)!, green = contactColor(2)!, blue = contactColor(-0.01)!, purple = contactColor(-0.5)!;
    expect(red[0]).toBeGreaterThan(0.8); expect(red[1]).toBeLessThan(0.25);
    expect(yellow[0]).toBeGreaterThan(0.9); expect(yellow[1]).toBeGreaterThan(0.8);
    expect(green[1]).toBeGreaterThan(0.6); expect(green[0]).toBeLessThan(0.2);
    expect(blue[2]).toBeGreaterThan(0.9); expect(blue[0]).toBeLessThan(0.3);
    expect(purple[0]).toBeGreaterThan(0.4); expect(purple[2]).toBeGreaterThan(0.8);
    expect(contactColor(2.5)).toBeNull();
    expect(contactColor(Number.NaN)).toBeNull();
    expect(contactColor(0.5, true)).toBeNull();
    expect(contactColor(0.05, true)).not.toBeNull();
    expect(contactColor(-0.1, true)).not.toBeNull();
    const lower = sheet(0, true);
    const upper = sheet(0.15, false, 40, (x, y) => -0.27 * Math.exp(-(x * x + y * y) / 4));
    const map = biteContactMap(upper, lower);
    // Build 97: the deepest over half a square millimetre - a little under the very tip.
    expect(map.upperStats.maxOverlap).toBeGreaterThan(0.09);
    expect(map.upperStats.maxOverlap).toBeLessThanOrEqual(0.121);
    expect(map.upperStats.overlapArea).toBeGreaterThan(1);
    expect(map.upperStats.contactArea).toBeGreaterThan(map.upperStats.overlapArea);
    const colors = contactColors(map.upper, "#919191");
    expect(colors.length).toBe(map.upper.length * 3);
    // A far corner keeps the scan's grey.
    const far = Array.from(map.upper).findIndex((v) => !Number.isFinite(v) || v > 2);
    if (far >= 0) expect(colors[far * 3]).toBeCloseTo(0x91 / 255, 3);
  });

  it("measures out to 2 mm, the far part to the nearest corner (build 96)", () => {
    const lower = sheet(0, true, 80);
    const upper = sheet(1.2, false, 80);
    const d = Array.from(signedDistances(upper, lower)).filter((v) => Number.isFinite(v));
    expect(d.length).toBeGreaterThan(1000);
    for (const v of d) expect(Math.abs(v - 1.2)).toBeLessThan(0.15);
    expect(Array.from(signedDistances(sheet(2.5, false, 20), lower)).every((v) => !Number.isFinite(v))).toBe(true);
  });

  it("a narrower range stretches the scale; beside the other scan's edge is never overlap (build 97)", () => {
    expect(contactColor(0.8, false, 0.5)).toBeNull();
    // 0.25 mm in a 0.5 mm range takes the colour 1 mm has in the 2 mm range.
    expect(contactColor(0.25, false, 0.5)).toEqual(contactColor(1, false, 2));
    // A sheet ending at x = 10; points just past its edge, a little below its plane, sit beside it.
    const lower = sheet(0, true, 40);
    const beside: number[] = [];
    for (let i = 0; i < 20; i += 1) beside.push(10.2, -5 + i * 0.5, -0.05, 10.3, -5 + i * 0.5, -0.05, 10.25, -4.8 + i * 0.5, -0.05);
    for (const v of signedDistances(beside, lower)) if (Number.isFinite(v)) expect(v).toBeGreaterThan(0);
  });

  it("reports the overlap over half a square millimetre, not a lone spike (build 97)", () => {
    const lower = sheet(0, true);
    // A broad 0.1 mm overlap and one sharp 0.5 mm spike.
    const upper = sheet(0.15, false, 40, (x, y) => -0.25 * Math.exp(-(x * x + y * y) / 8) - 0.55 * Math.exp(-((x - 6) ** 2 + (y - 6) ** 2) / 0.02));
    const d = signedDistances(upper, lower);
    const stats = contactStats(upper, d);
    expect(stats.maxOverlap).toBeGreaterThan(0.07);
    expect(stats.maxOverlap).toBeLessThan(0.2);
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
