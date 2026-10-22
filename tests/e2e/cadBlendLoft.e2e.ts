import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { OcctKernel } from "occt-wasm";
import { blendLoftInput, blendPositions, DEFAULT_BLEND, facingFaces, normalizeBlend } from "@/lib/blend";
import { blendLoftSolid, surfaceVolume } from "@/lib/cadBlendLoft";
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
      expect(surfaceVolume(cad, solid) / mesh).toBeGreaterThan(0.97);
      expect(surfaceVolume(cad, solid) / mesh).toBeLessThan(1.03);
    }
  });

  it("can be filleted at its rim - the reason it is exact", () => {
    const pair = facingFaces(cylinder("big", 30, 10, 0), cylinder("small", 12, 10, 30))!;
    const solid = blendLoftSolid(cad, blendLoftInput(pair.a, pair.b, DEFAULT_BLEND)!);
    const top = cad.getBoundingBox(solid, false).ymax;
    const rim = cad.getSubShapes(solid, "edge").filter((edge) => { const b = cad.getBoundingBox(edge, false); return Math.abs(b.ymax - b.ymin) < 1e-3 && Math.abs(b.ymax - top) < 1e-3; });
    expect(rim.length).toBeGreaterThan(10);
    const rounded = cad.fillet(solid, rim, 0.5);
    expect(cad.isValid(rounded)).toBe(true);
  });

  it("fuses with the two parts it joins into one solid (the edge tool needs that)", () => {
    const boxA = cad.translate(cad.makeBox(20, 20, 20), -10, 0, -10);
    const boxB = cad.translate(cad.makeBox(20, 20, 20), 28.5, 0, -10);
    const pair = facingFaces(box("a", 20, 20, 0, 0), box("b", 20, 20, 0, 38.5))!;
    const piece = blendLoftSolid(cad, blendLoftInput(pair.a, pair.b, DEFAULT_BLEND)!);
    const fused = cad.fuse(cad.fuse(piece, boxA), boxB);
    expect(cad.getSubShapes(fused, "solid").length).toBe(1);
    expect(cad.isValid(fused)).toBe(true);
    expect(cad.getVolume(fused)).toBeCloseTo(16000 + 400 * 18.5, -1);
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
    expect(surfaceVolume(cad, sleeve)).toBeLessThan(surfaceVolume(cad, solidPiece) * 0.8);
  });

  it("stays valid and true to the preview when the parts are offset sideways (build 29 browser case)", () => {
    const offsetBox = (id: string, x: number, z: number) => ({ ...box(id, 20, 20, 0, x), z }) as WorkplaneShape;
    for (const [gap, dz] of [[10, 5], [26, 12], [40, 0]]) {
      const pair = facingFaces(offsetBox("a", 0, 0), offsetBox("b", 20 + gap, dz))!;
      for (const smoothness of [0, 70, 100]) {
        const settings = normalizeBlend({ smoothness });
        const solid = blendLoftSolid(cad, blendLoftInput(pair.a, pair.b, settings)!);
        expect(cad.isValid(solid)).toBe(true);
        const ratio = surfaceVolume(cad, solid) / meshVolume(blendPositions(pair.a, pair.b, settings)!);
        expect(ratio).toBeGreaterThan(0.97);
        expect(ratio).toBeLessThan(1.03);
      }
    }
  });

  it("refuses an exact piece that would not match the preview, so the mesh piece is used", () => {
    const offsetBox = (id: string, x: number, z: number) => ({ ...box(id, 20, 20, 0, x), z }) as WorkplaneShape;
    const pair = facingFaces(offsetBox("a", 0, 0), offsetBox("b", 26, 18))!;
    for (const smoothness of [0, 100]) {
      const settings = normalizeBlend({ smoothness });
      const expectedVolume = meshVolume(blendPositions(pair.a, pair.b, settings)!);
      try {
        const solid = blendLoftSolid(cad, { ...blendLoftInput(pair.a, pair.b, settings)!, expectedVolume });
        const ratio = surfaceVolume(cad, solid) / expectedVolume;
        expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.03);
      } catch (error) {
        expect(String(error)).toMatch(/differs from the preview|not a valid solid|one solid/);
      }
    }
  });

  it("makes an exact piece with straight slices between facing faces offset far sideways", () => {
    const offsetBox = (id: string, x: number, z: number) => ({ ...box(id, 20, 20, 0, x), z }) as WorkplaneShape;
    for (const [gap, dz] of [[12, 15], [20, 18]]) {
      const pair = facingFaces(offsetBox("a", 0, 0), offsetBox("b", 20 + gap, dz))!;
      expect(pair.a.normal.x * pair.b.normal.x + pair.a.normal.z * pair.b.normal.z).toBeLessThan(-0.9);
      for (const smoothness of [0, 70, 100]) {
        const settings = normalizeBlend({ smoothness });
        const expectedVolume = meshVolume(blendPositions(pair.a, pair.b, settings, true)!);
        const solid = blendLoftSolid(cad, { ...blendLoftInput(pair.a, pair.b, settings, true)!, expectedVolume });
        expect(cad.isValid(solid)).toBe(true);
      }
    }
  });
});
