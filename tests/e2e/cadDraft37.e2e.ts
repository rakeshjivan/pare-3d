import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel } from "occt-wasm";
import { draftFacesSolid, DRAFT_FACES_REFUSED } from "@/lib/cadDraft";

// The editor's up is y; OCCT's box grows along z, so it is turned upright first.
const ROTATE_Z_TO_Y = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0];

describe("draft angle (build 37)", () => {
  let cad: OcctKernel;
  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    cad = await OcctKernel.init({ wasm });
  });
  function standingBox(lift: number) {
    const box = cad.makeBox(20, 20, 20);
    const upright = cad.transform(box, ROTATE_Z_TO_Y);
    return cad.translate(upright, 0, lift, 0);
  }
  const sides = (solid: ReturnType<OcctKernel["makeBox"]>) => cad.getSubShapes(solid, "face").filter((face) => {
    const c = cad.getSurfaceCenterOfMass(face);
    const box = cad.getBoundingBox(solid, false);
    return Math.abs(c.y - (box.ymin + box.ymax) / 2) < 1e-6;
  });

  for (const lift of [0, 15]) {
    it(`leans the four sides in by 5 degrees, keeping the bottom (box standing at ${lift} mm)`, () => {
      const box = standingBox(lift);
      const drafted = draftFacesSolid(cad, box, sides(box), 5);
      expect(cad.isValid(drafted)).toBe(true);
      const bounds = cad.getBoundingBox(drafted, false);
      expect(bounds.ymin).toBeCloseTo(lift, 4);
      expect(bounds.ymax).toBeCloseTo(lift + 20, 4);
      expect(bounds.xmax - bounds.xmin).toBeCloseTo(20, 3);
      const top = cad.getSubShapes(drafted, "face").find((face) => Math.abs(cad.getSurfaceCenterOfMass(face).y - (lift + 20)) < 1e-4)!;
      const topBounds = cad.getBoundingBox(top, false);
      expect(topBounds.xmax - topBounds.xmin).toBeCloseTo(20 - 2 * 20 * Math.tan((5 * Math.PI) / 180), 3);
      expect(cad.getVolume(drafted)).toBeLessThan(8000);
    });
  }

  it("refuses the top face", () => {
    const box = standingBox(0);
    const top = cad.getSubShapes(box, "face").find((face) => Math.abs(cad.getSurfaceCenterOfMass(face).y - 20) < 1e-6)!;
    expect(() => draftFacesSolid(cad, box, [top], 5)).toThrow(DRAFT_FACES_REFUSED);
  });
});
