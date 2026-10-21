import { describe, expect, it } from "vitest";
import { checkForPrinting, overhangArea } from "@/lib/printCheck";
import { meshForShape } from "@/lib/editorMeshCore";
import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import type { WorkplaneShape } from "@/types/layerling";

const box = (x: number, z: number, elevation: number, width = 20, depth = 20, height = 20): WorkplaneShape =>
  makeShapeFromAsset(libraryShapeAssets.find((entry) => entry.id === "box")!, { x, z, elevation }, { width, depth, height });
const check = (shapes: WorkplaneShape[]) => checkForPrinting(shapes, { bed: { width: 180, depth: 180, height: 180 }, overhangAngle: 45, meshFor: meshForShape });
const kinds = (shapes: WorkplaneShape[]) => check(shapes).map((issue) => issue.kind);

describe("ready to print", () => {
  it("finds nothing wrong with a box on the plate", () => {
    expect(kinds([box(0, 0, 0)])).toEqual([]);
  });

  it("says when there is nothing to print", () => {
    expect(kinds([{ ...box(0, 0, 0), hole: true }])[0]).toBe("nothing");
  });

  it("finds a part past the plate edge", () => {
    expect(kinds([box(85, 0, 0)])).toContain("outside");
  });

  it("finds a part floating in the air, but not one standing on another", () => {
    expect(kinds([box(0, 0, 0), box(60, 0, 15)])).toContain("floating");
    expect(kinds([box(0, 0, 0), box(0, 0, 20, 10, 10, 10)])).not.toContain("floating");
  });

  it("finds a hole that is not grouped with anything", () => {
    expect(kinds([box(0, 0, 0), { ...box(0, 0, 0, 5, 5, 30), hole: true }])).toContain("looseHole");
  });

  it("finds a wall thinner than two nozzle widths", () => {
    expect(kinds([box(0, 0, 0, 0.5, 20, 20)])).toContain("thin");
  });

  it("finds a wide overhang: a shelf sticking out of a post", () => {
    const issues = check([box(0, 0, 0, 10, 10, 30), box(15, 0, 30, 40, 10, 4)]);
    expect(issues.map((issue) => issue.kind)).toContain("overhang");
  });

  it("does not count a part's own bottom on the plate as an overhang", () => {
    expect(overhangArea(meshForShape(box(0, 0, 0)), 0, 45)).toBe(0);
  });

  it("mentions hidden parts, which are not exported", () => {
    expect(kinds([box(0, 0, 0), { ...box(40, 0, 0), hidden: true }])).toContain("hidden");
  });
});
