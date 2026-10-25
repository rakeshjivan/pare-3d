import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { buildReadyPart } from "@/lib/readyPartsBuild";
import { hingeFitTestParts } from "@/lib/hingeFitTest";
import { HINGE_TEST_FITS as HINGE_FITS } from "@/lib/dentalBase";
import { loadTextFonts } from "@/lib/textFonts";
import type { WorkplaneShape } from "@/types/layerling";

/** Vertices of a built part (Pare's frame: y up). */
function vertices(shape: WorkplaneShape) {
  const p = shape.importedMesh!.positions;
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < p.length; i += 3) out.push([p[i], p[i + 1], p[i + 2]]);
  return out;
}
/** Where the part's surface crosses the plane x = `at`: points (y, z). */
function section(shape: WorkplaneShape, at: number) {
  const p = shape.importedMesh!.positions;
  const out: Array<[number, number]> = [];
  for (let t = 0; t + 8 < p.length; t += 9) {
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
      const xa = p[t + a] - at, xb = p[t + b] - at;
      if ((xa < 0) === (xb < 0)) continue;
      const s = xa / (xa - xb);
      out.push([p[t + a + 1] + s * (p[t + b + 1] - p[t + a + 1]), p[t + a + 2] + s * (p[t + b + 2] - p[t + a + 2])]);
    }
  }
  return out;
}
function bounds(shape: WorkplaneShape) {
  const v = vertices(shape);
  const min = [0, 1, 2].map((k) => Math.min(...v.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...v.map((p) => p[k])));
  return { min, max };
}

describe("hinge fit test (build 60)", () => {
  beforeAll(async () => {
    await loadTextFonts();
  });

  it("builds a strip of five axles and a clip for each fit", async () => {
    const parts = hingeFitTestParts({ strip: "Hinge test", clip: "Clip" });
    expect(parts).toHaveLength(1 + HINGE_FITS.length);
    const [strip, ...clips] = await Promise.all(parts.map((part) => buildReadyPart(part, 250_000)));
    const b = bounds(strip);
    // The posts stand 4.5 mm over the axle, whose centre is 9 mm up.
    expect(b.max[1] - b.min[1]).toBeCloseTo(13.5, 1);
    // The axles lie along x between the posts: across each clip's place the strip is the plate
    // and a 2 mm round axle 9 mm up, nothing else.
    for (let index = 0; index < HINGE_FITS.length; index += 1) {
      const cut = section(strip, b.min[0] + 14 + index * 26).map(([y, z]) => [y - b.min[1], z] as const).filter(([y]) => y > 3.2);
      expect(cut.length).toBeGreaterThan(20);
      const zs = cut.map(([, z]) => z);
      const middle = (Math.min(...zs) + Math.max(...zs)) / 2;
      for (const [y, z] of cut) expect(Math.hypot(y - 9, z - middle)).toBeCloseTo(2, 1);
    }
    // Each clip: a bore round its axle, wider with the fit, opening upwards; 14 mm long, its posts the fit clear of it.
    for (const [index, clip] of clips.entries()) {
      const fit = HINGE_FITS[index];
      const c = bounds(clip);
      // Across the clip's middle: the bore, a circle 2 mm + the fit round the axle's place, open at the top.
      const cut = section(clip, (c.min[0] + c.max[0]) / 2).map(([y, z]) => [y - c.min[1], z] as const).filter(([y]) => y > 3.5 && y < 9 + 2 + fit - 0.01);
      expect(cut.length).toBeGreaterThan(10);
      const zs = cut.map(([, z]) => z);
      const middle = (Math.min(...zs) + Math.max(...zs)) / 2;
      const radius = Math.min(...cut.map(([y, z]) => Math.hypot(y - 9, z - middle)));
      expect(radius).toBeGreaterThan(2 + fit - 0.05);
      expect(radius).toBeLessThan(2 + fit + 0.05);
      // Tall enough to hold the axle: 1.8 mm over the bore.
      expect(c.max[1] - c.min[1]).toBeCloseTo(9 + 2 + fit + 1.8, 1);
    }
  });
});
