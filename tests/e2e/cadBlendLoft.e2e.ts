import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { OcctKernel } from "occt-wasm";
import { blendLoftInput, blendPositions, DEFAULT_BLEND, facingFaces, normalizeBlend } from "@/lib/blend";
import { blendLoftSolid } from "@/lib/cadBlendLoft";
import type { WorkplaneShape } from "@/types/layerling";

function cylinder(id: string, diameter: number, height: number, elevation: number, x = 0): WorkplaneShape {
  return { id, name: id, kind: "cylinder", color: "#d41721", x, z: 0, elevation, size: diameter, width: diameter, depth: diameter, height, rotation: 0, sides: 64 } as unknown as WorkplaneShape;
}
function box(id: string, size: number, height: number, elevation: number, x = 0): WorkplaneShape {
  return { id, name: id, kind: "box", color: "#d41721", x, z: 0, elevation, size, width: size, depth: size, height, rotation: 0 } as unknown as WorkplaneShape;
}
const tube = (id: string, diameter: number, wall: number, height: number, elevation: number, x = 0) =>
  ({ ...cylinder(id, diameter, height, elevation, x), kind: "tube", bevel: wall }) as unknown as WorkplaneShape;
function meshVolume(positions: number[]) {
  let volume = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

describe("the Blend piece as an exact CAD loft (build 29)", () => {
  let cad: OcctKernel;
  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    cad = await OcctKernel.init({ wasm });
  });

  it("lofts two cylinders into one valid solid with the mesh piece's volume", () => {
    const pair = facingFaces(cylinder("big", 30, 10, 0), cylinder("small", 12, 10, 30, 8))!;
    for (const smoothness of [0, 70, 100]) {
      const settings = normalizeBlend({ smoothness });
      const solid = blendLoftSolid(cad, blendLoftInput(pair.a, pair.b, settings)!);
      expect(cad.isValid(solid)).toBe(true);
      const mesh = meshVolume(blendPositions(pair.a, pair.b, settings)!);
      expect(cad.getVolume(solid) / mesh).toBeGreaterThan(0.97);
      expect(cad.getVolume(solid) / mesh).toBeLessThan(1.03);
    }
  });

  it("can be filleted and chamfered at its rims - the reason it is exact", () => {
    const pair = facingFaces(cylinder("big", 30, 10, 0), cylinder("small", 12, 10, 30))!;
    const solid = blendLoftSolid(cad, blendLoftInput(pair.a, pair.b, DEFAULT_BLEND)!);
    const edges = cad.getSubShapes(solid, "edge");
    expect(edges.length).toBeLessThan(12);
    const rims = edges.filter((edge) => { const b = cad.getBoundingBox(edge, false); return Math.abs(b.ymax - b.ymin) < 1e-3; });
    expect(rims.length).toBeGreaterThanOrEqual(2);
    const rounded = cad.fillet(solid, [rims[0]], 1);
    expect(cad.isValid(rounded)).toBe(true);
  });

  it("lofts a square into a round, and a sleeve between two tubes", () => {
    const square = facingFaces(box("block", 20, 10, 0), cylinder("pin", 10, 10, 35, 6))!;
    expect(cad.isValid(blendLoftSolid(cad, blendLoftInput(square.a, square.b, DEFAULT_BLEND)!))).toBe(true);
    const tubes = facingFaces(tube("wide", 30, 3, 10, 0), tube("narrow", 16, 2, 10, 30))!;
    const input = blendLoftInput(tubes.a, tubes.b, DEFAULT_BLEND)!;
    expect(input.innerRings).toBeTruthy();
    const sleeve = blendLoftSolid(cad, input);
    expect(cad.isValid(sleeve)).toBe(true);
    const solidPiece = blendLoftSolid(cad, blendLoftInput(tubes.a, tubes.b, normalizeBlend({ hollow: false }))!);
    expect(cad.getVolume(sleeve)).toBeLessThan(cad.getVolume(solidPiece) * 0.8);
  });
});
