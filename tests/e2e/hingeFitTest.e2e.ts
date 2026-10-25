import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { buildReadyPart } from "@/lib/readyPartsBuild";
import { ballFitTestParts, hingeFitTestParts } from "@/lib/hingeFitTest";
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
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of vertices(shape)) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
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

  it("builds five balls on necks and a cup for each fit, held by tongues (build 63)", async () => {
    const parts = ballFitTestParts({ strip: "Ball test", clip: "Cup" });
    expect(parts).toHaveLength(1 + HINGE_FITS.length);
    const [strip, ...cups] = await Promise.all(parts.map((part) => buildReadyPart(part, 400_000)));
    const b = bounds(strip);
    // The ball's top: the plate, R + 4 to its centre, R more.
    expect(b.max[1] - b.min[1]).toBeCloseTo(3 + 5 + 4 + 5, 1);
    for (const [index, cup] of cups.entries()) {
      const fit = HINGE_FITS[index];
      const c = bounds(cup);
      const cx = (c.min[0] + c.max[0]) / 2;
      const cupY = 3 + 5 + 3;
      // Across the cup's middle (along x through its centre), the cup's wall below the centre is R + fit out.
      const cut = section(cup, cx).map(([y, z]) => [y - c.min[1], z] as const).filter(([y]) => y > 3.5 && y < cupY - 0.5);
      expect(cut.length).toBeGreaterThan(10);
      // Tongues rise past the centre by the lip, reaching in to 0.4 mm inside the ball's radius.
      const lip = Math.sqrt((5 + fit) ** 2 - (5 - 0.4) ** 2);
      expect(c.max[1] - c.min[1]).toBeCloseTo(cupY + lip, 1);
    }
  });

  it("cuts the drop-in cup's channel up and back out of the seat (build 63)", async () => {
    const manifoldModule = (await import("manifold-3d")).default;
    const runtime = await manifoldModule(); runtime.setup();
    const parts = ballFitTestParts({ strip: "Ball test", clip: "Cup" }, "dropin");
    const cup = await buildReadyPart(parts[3], 400_000);
    const p = cup.importedMesh!.positions;
    const n = p.length / 3;
    const tri = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) tri[i] = i;
    const mesh = new runtime.Mesh({ numProp: 3, vertProperties: Float32Array.from(p), triVerts: tri });
    mesh.merge();
    const solid = new runtime.Manifold(mesh);
    const c = bounds(cup);
    const cx = (c.min[0] + c.max[0]) / 2, seatY = c.min[1] + 3 + 5 + 3;
    // The seat's centre (y up, z along the plate): found as the cup's middle along z.
    const zs: number[] = [];
    for (let i = 0; i < n; i += 1) if (p[i * 3 + 1] - c.min[1] > 3.5 && Math.abs(p[i * 3] - cx) < 0.5) zs.push(p[i * 3 + 2]);
    const empty = (y: number, z: number, x = cx) => {
      const probe = runtime.Manifold.cube([0.3, 0.3, 0.3], true).translate([x, y, z]);
      const v = runtime.Manifold.intersection(solid, probe).volume();
      return v < 0.01;
    };
    const tilt = (35 * Math.PI) / 180;
    // Somewhere along z the channel leaves the seat up and to one side, at 35 degrees from upright;
    // straight up from the seat (through the block's top) there is material on the other side.
    const middle = (Math.min(...zs) + Math.max(...zs)) / 2;
    // 1.5 mm over the seat's centre, 5.5 mm to one side and 3.3 mm off the middle - beyond the seat,
    // clear of the neck room, inside the block: open only where the channel runs.
    expect(Math.hypot(5.5 * Math.cos(tilt) - 1.5 * Math.sin(tilt), 3.3)).toBeLessThan(5);
    const along = [1, -1].map((sign) => empty(seatY + 1.5, middle + sign * 5.5, cx + 3.3));
    // Out the back, the side the neck room is on (+z), as on the models.
    expect(along).toEqual([true, false]);
    expect(empty(seatY - 2, middle)).toBe(true);
  });
});
