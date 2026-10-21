import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import { exportSolidVolume } from "@/lib/editorBooleans";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { boxWithLidParts, insertHolePart, nutTrapPart, paraboloidPart, DIVIDER_DROP, STACK_FOOT, LID_LIP_HEIGHT, LID_LIP_WALL, LID_THICKNESS } from "@/lib/readyParts";
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
    // They stand apart on the plate: 64 x 44 each, so one behind the other (98 mm) beats side by side (138).
    expect(lid.z - box.z).toBeGreaterThan(44);
    expect(lid.x).toBeCloseTo(box.x, 5);
  });

  describe("organiser (compartments, rounding, lid)", () => {
    const near = (actual: number, expected: number, share = 0.01) => expect(Math.abs(actual - expected) / expected).toBeLessThan(share);
    // Inside 60 x 40 x 30, wall 2: 3 columns and 2 rows of compartments, the dividers 2 mm thick.
    const dividers = (2 * 2 * 40 + 1 * 2 * 60 - 2 * 1 * 2 * 2);
    const cellsArea = 60 * 40 - dividers;

    it("without a lid the dividers run up to the rim", async () => {
      const [box, lid] = boxWithLidParts({ columns: 3, rows: 2, lid: false }, { box: "Box", lid: "Lid" });
      expect(lid).toBeUndefined();
      const built = await buildReadyPart(box, LIMIT);
      near((await exportSolidVolume([built])).volumeMm3, 64 * 44 * 32 - cellsArea * 30);
    });

    it("with a lid they stop below the rim so the lip fits over them", async () => {
      const [box] = boxWithLidParts({ columns: 3, rows: 2, lid: true }, { box: "Box", lid: "Lid" });
      const built = await buildReadyPart(box, LIMIT);
      const cavity = cellsArea * (30 - DIVIDER_DROP) + 60 * 40 * DIVIDER_DROP;
      near((await exportSolidVolume([built])).volumeMm3, 64 * 44 * 32 - cavity);
    });

    it("rounds the compartments: less is cut than with square corners, and it stays one closed body", async () => {
      const [square] = boxWithLidParts({ columns: 2, rows: 2, lid: false }, { box: "Box", lid: "Lid" });
      const [rounded] = boxWithLidParts({ columns: 2, rows: 2, lid: false, radius: 5 }, { box: "Box", lid: "Lid" });
      const squareVolume = (await exportSolidVolume([await buildReadyPart(square, LIMIT)])).volumeMm3;
      const roundedResult = await exportSolidVolume([await buildReadyPart(rounded, LIMIT)]);
      expect(roundedResult.unionFailed).toBeFalsy();
      // Rounded corners outside take some away; rounded insides and floors leave more in.
      expect(roundedResult.volumeMm3).toBeGreaterThan(squareVolume * 0.95);
      expect(roundedResult.volumeMm3).not.toBeCloseTo(squareVolume, 0);
    });

    it("lowers the dividers to the height asked for", async () => {
      const [box] = boxWithLidParts({ columns: 3, rows: 2, lid: false, dividerHeight: 10 }, { box: "Box", lid: "Lid" });
      const built = await buildReadyPart(box, LIMIT);
      near((await exportSolidVolume([built])).volumeMm3, 64 * 44 * 32 - (cellsArea * 10 + 60 * 40 * 20));
    });

    it("stackable: a foot that fits inside the rim below, and room for it over the dividers", async () => {
      const [box] = boxWithLidParts({ columns: 3, rows: 2, lid: false, stackable: true }, { box: "Box", lid: "Lid" });
      const built = await buildReadyPart(box, LIMIT);
      expect(built.height).toBeCloseTo(32 + STACK_FOOT, 1);
      const drop = STACK_FOOT + 0.5;
      const foot = 59.6 * 39.6 * STACK_FOOT;
      near((await exportSolidVolume([built])).volumeMm3, 64 * 44 * 32 + foot - (cellsArea * (30 - drop) + 60 * 40 * drop));
    });

    it("keeps compartments at least 5 mm wide", () => {
      const [box] = boxWithLidParts({ width: 20, columns: 12, lid: false }, { box: "Box", lid: "Lid" });
      expect(box.shapes.filter((shape) => shape.hole)).toHaveLength(1);
    });
  });
});
