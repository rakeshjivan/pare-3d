import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import { exportSolidVolume } from "@/lib/editorBooleans";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { faceTextPart, livingHingePart, mouseEarCorners, mouseEarsPart, snapFitParts, snapFitSafeBend, ENGRAVE_OVERSHOOT, MOUSE_EAR_THICKNESS } from "@/lib/readyParts";
import { buildReadyPart } from "@/lib/readyPartsBuild";

/** Fork: snap-fit clip, living hinge, text on a face and mouse ears. */
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
const near = (actual: number, expected: number, share = 0.01) => expect(Math.abs(actual - expected) / expected).toBeLessThan(share);

describe("snap-fit clip", () => {
  it("a closed hook of the profile's area times its width, and a slot that clears it", async () => {
    const [hookPart, slotPart] = snapFitParts({ length: 12, thickness: 2, width: 6, catchDepth: 1, clearance: 0.2 }, { hook: "Hook", slot: "Slot" });
    const hook = await buildReadyPart(hookPart, LIMIT);
    const lead = 3;
    const area = 2 * 12 + (1 * lead) / 2;
    const result = await exportSolidVolume([hook]);
    expect(result.unionFailed).toBeFalsy();
    near(result.volumeMm3, area * 6);
    expect(hook.height).toBeCloseTo(12, 3);
    const slot = await buildReadyPart(slotPart, LIMIT);
    expect(slot.hole).toBe(true);
    expect(slot.width).toBeCloseTo(2 + 1 + 0.4, 3);
    expect(slot.depth).toBeCloseTo(6.4, 3);
  });

  it("says how far the arm may bend in PLA", () => {
    expect(snapFitSafeBend({ length: 12, thickness: 2, width: 6, catchDepth: 1, clearance: 0.2 })).toBeCloseTo(0.96, 2);
  });
});

describe("living hinge", () => {
  it("two leaves joined by a thin web", async () => {
    const part = await buildReadyPart(livingHingePart({ leaf: 20, width: 20, thickness: 3, gap: 3, web: 0.4 }, "Hinge"), LIMIT);
    const result = await exportSolidVolume([part]);
    expect(result.unionFailed).toBeFalsy();
    near(result.volumeMm3, (2 * 20 * 3 + 3 * 0.4) * 20);
    expect(part.width).toBeCloseTo(43, 3);
  });
});

describe("text on a face", () => {
  it("cut-in text is a hole reaching the depth into the face and a little out of it", () => {
    const part = faceTextPart({ text: "HELLO", letterHeight: 8, depth: 1.5, mode: "engraved" }, "Text");
    expect(part.shapes[0].hole).toBe(true);
    expect(part.shapes[0].height).toBeCloseTo(1.5 + ENGRAVE_OVERSHOOT, 5);
    expect(part.sink).toBeCloseTo(1.5, 5);
    const raised = faceTextPart({ text: "HELLO", letterHeight: 8, depth: 1.5, mode: "raised" }, "Text");
    expect(raised.shapes[0].hole).toBeFalsy();
    expect(raised.sink).toBe(0);
  });
});

describe("mouse ears", () => {
  it("finds the four corners of a rectangle, none on a circle", () => {
    const rectangle: [number, number][] = [[0, 0], [10, 0], [10, 5], [0, 5], [5, 0], [5, 5]];
    expect(mouseEarCorners(rectangle)).toHaveLength(4);
    const circle = Array.from({ length: 64 }, (_, i) => [Math.cos(i / 64 * Math.PI * 2) * 10, Math.sin(i / 64 * Math.PI * 2) * 10] as [number, number]);
    expect(mouseEarCorners(circle)).toHaveLength(0);
    // A triangle's three corners are all sharp.
    expect(mouseEarCorners([[0, 0], [10, 0], [5, 8]])).toHaveLength(3);
  });

  it("builds one group of thin discs centred on the corners", async () => {
    const part = mouseEarsPart([[0, 0], [40, 0], [40, 20], [0, 20]], 0, 12, "Mouse ears")!;
    const built = await buildReadyPart(part, LIMIT);
    expect(built.groupedShapes).toHaveLength(4);
    expect(built.height).toBeCloseTo(MOUSE_EAR_THICKNESS, 5);
    expect(built.width).toBeCloseTo(52, 3);
    expect(mouseEarsPart(Array.from({ length: 64 }, (_, i) => [Math.cos(i / 10) * 10, Math.sin(i / 10) * 10] as [number, number]), 0, 12, "x")).toBeNull();
  });
});
