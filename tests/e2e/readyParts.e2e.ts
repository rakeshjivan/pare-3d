import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import { exportSolidVolume } from "@/lib/editorBooleans";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { boxWithLidParts, insertHolePart, nutTrapPart, paraboloidPart, LID_LIP_HEIGHT, LID_LIP_WALL, LID_THICKNESS } from "@/lib/readyParts";
import { buildReadyPart } from "@/lib/readyPartsBuild";

/** Fork: ready-made parts, measured by volume once built the way the editor builds them. */
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

const LIMIT = 2_000_000;

describe("ready-made parts", () => {
  it("paraboloid: a closed solid of half its cylinder's volume", async () => {
    const part = await buildReadyPart(paraboloidPart("Paraboloid", "#888888", 20, 20, 96, 64), LIMIT);
    const { volumeMm3, unionFailed } = await exportSolidVolume([part]);
    expect(unionFailed).toBeFalsy();
    expect(volumeMm3).toBeCloseTo((Math.PI * 10 * 10 * 20) / 2, -1.3);
  });

  it("heat-set insert hole: M3 is 4.0 mm across and 6.7 mm deep, as a hole", async () => {
    const part = await buildReadyPart(insertHolePart("M3", "Insert"), LIMIT);
    expect(part.hole).toBe(true);
    expect(part.width).toBeCloseTo(4, 5);
    expect(part.height).toBeCloseTo(6.7, 5);
  });

  it("nut trap: one hole group, the hex pocket 5.8 mm across flats for an M3 nut", async () => {
    const part = await buildReadyPart(nutTrapPart("M3", "Nut trap"), LIMIT);
    expect(part.hole).toBe(true);
    expect(part.groupedShapes).toHaveLength(2);
    const pocket = part.groupedShapes!.find((shape) => shape.kind === "polygon")!;
    expect(pocket.width).toBeCloseTo(5.8, 5);
    expect(pocket.depth).toBeCloseTo(5.8 * 2 / Math.sqrt(3), 1);
  });

  it("box with lid: even walls and a lip that clears the inside by the fit all round", async () => {
    const [boxPart, lidPart] = boxWithLidParts({ width: 60, depth: 40, height: 30, wall: 2, clearance: 0.2 }, { box: "Box", lid: "Lid" });
    const box = await buildReadyPart(boxPart, LIMIT);
    const lid = await buildReadyPart(lidPart, LIMIT);
    expect(box.width).toBeCloseTo(64, 5);
    expect(box.height).toBeCloseTo(32, 5);
    // Within 1%: the Group tool's cut takes a few hundredths of a mm off each cut face.
    const near = (actual: number, expected: number) => expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01);
    near((await exportSolidVolume([box])).volumeMm3, 64 * 44 * 32 - 60 * 40 * 30);
    const lip = (59.6 * 39.6 - (59.6 - 2 * LID_LIP_WALL) * (39.6 - 2 * LID_LIP_WALL)) * LID_LIP_HEIGHT;
    near((await exportSolidVolume([lid])).volumeMm3, 64 * 44 * LID_THICKNESS + lip);
    // They stand apart on the plate.
    expect(lid.x - box.x).toBeGreaterThan(64);
  });
});
