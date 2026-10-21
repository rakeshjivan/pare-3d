import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import { exportSolidVolume } from "@/lib/editorBooleans";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { adjustBrightness, lithophanePositions, lithophaneThicknessMap, meshShapeFromPositions, normalizeLithophane } from "@/lib/lithophane";

/** Fork: lithophanes are closed solids of the right volume, in every shape. */
const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));
beforeAll(async () => {
  kernel.runtime = manifoldModule().then((runtime) => {
    runtime.setup();
    rememberManifoldRuntime(runtime);
    return runtime;
  });
  await kernel.runtime;
});

const near = (actual: number, expected: number, share = 0.01) => expect(Math.abs(actual - expected) / expected).toBeLessThan(share);
const build = (options: Parameters<typeof normalizeLithophane>[0], sample: (u: number, v: number) => number, image = { w: 400, h: 300 }) => {
  const o = normalizeLithophane(options);
  const map = lithophaneThicknessMap(o, image.w, image.h, sample);
  return { o, map, shape: meshShapeFromPositions("Lithophane", "#eeeeee", lithophanePositions(map, o)) };
};

describe("lithophane", () => {
  it("dark is thick and light is thin", () => {
    const o = normalizeLithophane({ minThickness: 0.8, maxThickness: 3, border: 0 });
    const map = lithophaneThicknessMap(o, 10, 10, (u) => (u < 0.5 ? 0 : 1));
    expect(map.thickness[0]).toBeCloseTo(3, 5);
    expect(map.thickness[map.columns - 1]).toBeCloseTo(0.8, 5);
    expect(adjustBrightness(0.5, { brightness: 0, contrast: 0, gamma: 1, invert: true })).toBeCloseTo(0.5, 5);
    expect(adjustBrightness(0.2, { brightness: 0, contrast: 0, gamma: 1, invert: true })).toBeCloseTo(0.8, 5);
  });

  it("flat: a closed plate standing up, width x height x thickness", async () => {
    const { shape } = build({ shape: "flat", width: 80, border: 0, minThickness: 1, maxThickness: 3, resolution: 0.5 }, () => 0.5);
    const result = await exportSolidVolume([shape]);
    expect(result.unionFailed).toBeFalsy();
    expect(shape.width).toBeCloseTo(80, 1);
    expect(shape.height).toBeCloseTo(60, 1);
    expect(shape.depth).toBeCloseTo(2, 3);
    near(result.volumeMm3, 80 * 60 * 2);
  });

  it("the border frames the picture at full thickness", async () => {
    const { shape } = build({ shape: "flat", width: 80, border: 5, minThickness: 1, maxThickness: 3, resolution: 0.5 }, () => 1);
    expect(shape.width).toBeCloseTo(90, 1);
    const result = await exportSolidVolume([shape]);
    near(result.volumeMm3, 80 * 60 * 1 + (90 * 70 - 80 * 60) * 3, 0.02);
  });

  it("curved: bends round an arc and stays closed", async () => {
    const { shape } = build({ shape: "curved", width: 100, arcDegrees: 120, border: 0, minThickness: 2, maxThickness: 2.2, resolution: 0.5 }, () => 1);
    const result = await exportSolidVolume([shape]);
    expect(result.unionFailed).toBeFalsy();
    // Volume of a shell: arc length x height x thickness, a little less on the inside.
    near(result.volumeMm3, 100 * 75 * 2 * (1 - 2 / (2 * (100 / ((120 * Math.PI) / 180)))), 0.02);
    expect(shape.depth).toBeGreaterThan(20);
  });

  it("cylinder: a closed lamp shade with no seam", async () => {
    // Black everywhere: the whole shade is the thickest, 1.7 mm.
    const { shape } = build({ shape: "cylinder", width: 150, border: 3, minThickness: 1.5, maxThickness: 1.7, resolution: 0.6 }, () => 0, { w: 300, h: 200 });
    const result = await exportSolidVolume([shape]);
    expect(result.unionFailed).toBeFalsy();
    const radius = (150 + 0.6) / (2 * Math.PI);
    expect(shape.width).toBeCloseTo(radius * 2, 0);
    const height = shape.height;
    near(result.volumeMm3, Math.PI * (radius ** 2 - (radius - 1.7) ** 2) * height, 0.01);
  });
});
