import { beforeAll, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * A STEP file with several solids comes in as one body each, under its own name and in its place (#830), read through the
 * kernel's XCAF document; one solid, or a file it cannot take apart, stays one body. Against the real kernel.
 */
vi.mock("@/lib/brepKernel", async () => {
  const brep = await import("brepjs");
  const { OcctKernel } = await import("occt-wasm");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  let ready: Promise<typeof brep> | null = null;
  let raw: Awaited<ReturnType<typeof OcctKernel.init>> | null = null;
  return {
    occtKernel: () => raw,
    loadBrepWithOcct: () =>
      (ready ??= (async () => {
        const kernel = await OcctKernel.init({ wasm });
        raw = kernel;
        brep.registerKernel("occt-wasm", brep.OcctWasmAdapter.fromKernel(kernel));
        return brep;
      })()),
  };
});

let exportShapesToStep: typeof import("@/lib/stepExport").exportShapesToStep;
let importedShapesFromStepAssembly: typeof import("@/lib/stepAssemblyImport").importedShapesFromStepAssembly;
let importedShapeFromStep: typeof import("@/lib/stepImport").importedShapeFromStep;

beforeAll(async () => {
  ({ exportShapesToStep } = await import("@/lib/stepExport"));
  ({ importedShapesFromStepAssembly } = await import("@/lib/stepAssemblyImport"));
  ({ importedShapeFromStep } = await import("@/lib/stepImport"));
  await (await import("@/lib/brepKernel")).loadBrepWithOcct();
});

const shape = (overrides: Partial<WorkplaneShape>) => ({ id: Math.random().toString(36).slice(2), name: "Shape", kind: "box", color: "#0098c7", x: 0, z: 0, size: 10, width: 10, depth: 10, height: 10, rotation: 0, ...overrides }) as WorkplaneShape;

describe("a STEP file with several solids", () => {
  it("comes in as a body each, with the names of the file and their places to one another", async () => {
    const { blob } = await exportShapesToStep([
      shape({ kind: "box", name: "Left post", x: -30, width: 10, depth: 6, height: 4 }),
      shape({ kind: "cylinder", name: "Round rod", x: 0, width: 8, depth: 8, height: 12 }),
      shape({ kind: "box", name: "Right post", x: 30, z: 12, elevation: 5, width: 10, depth: 6, height: 4 }),
    ]);
    const result = await importedShapesFromStepAssembly("stand.step", await blob.arrayBuffer());
    expect(result).not.toBeNull();
    const parts = result!.shapes;
    expect(parts.map((part) => part.name).sort()).toEqual(["Left post", "Right post", "Round rod"]);
    const byName = Object.fromEntries(parts.map((part) => [part.name, part]));
    expect(byName["Left post"].width).toBeCloseTo(10, 3);
    expect(byName["Left post"].height).toBeCloseTo(4, 3);
    // Their places: 30 mm either side of the middle one, the right post 12 mm back and 5 mm up.
    expect(byName["Round rod"].x - byName["Left post"].x).toBeCloseTo(30, 2);
    expect(byName["Right post"].x - byName["Round rod"].x).toBeCloseTo(30, 2);
    expect(byName["Right post"].z - byName["Round rod"].z).toBeCloseTo(12, 2);
    expect(byName["Right post"].elevation! - byName["Left post"].elevation!).toBeCloseTo(5, 2);
    // Each part carries its mesh and its exact body, so a STEP export hands it back exactly.
    for (const part of parts) {
      expect(part.importedMesh?.sourceFormat).toBe("json");
      expect(part.importedMesh?.brepStep).toContain("MANIFOLD_SOLID_BREP");
    }
  }, 60000);

  it("stays one body when it holds one solid", async () => {
    const { blob } = await exportShapesToStep([shape({ kind: "box", name: "Only", width: 10, depth: 6, height: 4 })]);
    expect(await importedShapesFromStepAssembly("one.step", await blob.arrayBuffer())).toBeNull();
    expect((await importedShapeFromStep("one.step", await blob.arrayBuffer())).name).toBe("one");
  }, 60000);
});
