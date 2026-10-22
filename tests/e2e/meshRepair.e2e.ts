import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { fillHoleAt, isManifoldSolid, makeSolidPositions, meshHealth } from "@/lib/meshRepair";
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

const box = { id: "b", name: "Block", kind: "box", color: "#d41721", x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 20, rotation: 0 } as unknown as WorkplaneShape;
const bore = { id: "h", name: "Bore", kind: "cylinder", hole: true, color: "#888", x: 0, z: 0, elevation: -1, size: 6, width: 6, depth: 6, height: 22, rotation: 0, sides: 48 } as unknown as WorkplaneShape;
const soup = (shape: WorkplaneShape) => {
  const mesh = meshForShape(shape);
  return mesh.faces.flatMap((face) => face.flatMap((index) => mesh.vertices[index]));
};
const volume = (p: number[]) => {
  let v = 0;
  for (let i = 0; i < p.length; i += 9) v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
  return v;
};

describe("Mesh check and repair (build 30)", () => {
  it("calls a closed box watertight", () => {
    expect(meshHealth(soup(box))).toMatchObject({ watertight: true, openEdges: 0, openings: 0 });
  });

  it("finds an opening, and Make solid closes it into a solid", async () => {
    const all = soup(box);
    // Drop the two triangles of the top face (y = 20 at all three corners).
    const open: number[] = [];
    for (let i = 0; i < all.length; i += 9) {
      if (all[i + 1] === 20 && all[i + 4] === 20 && all[i + 7] === 20) continue;
      open.push(...all.slice(i, i + 9));
    }
    const health = meshHealth(open);
    expect(health.watertight).toBe(false);
    expect(health.openings).toBe(1);
    const repaired = makeSolidPositions(open);
    expect(repaired.capped).toBe(1);
    expect(meshHealth(repaired.positions).watertight).toBe(true);
    expect(await isManifoldSolid(repaired.positions)).toBe(true);
    expect(volume(repaired.positions)).toBeCloseTo(8000, 0);
  });

  it("turns triangles that face inward the right way round", async () => {
    const all = soup(box);
    const flipped = [...all];
    for (let i = 0; i < 18; i += 9) for (let k = 0; k < 3; k += 1) [flipped[i + 3 + k], flipped[i + 6 + k]] = [flipped[i + 6 + k], flipped[i + 3 + k]];
    const repaired = makeSolidPositions(flipped);
    expect(volume(repaired.positions)).toBeCloseTo(8000, 0);
    expect(await isManifoldSolid(repaired.positions)).toBe(true);
  });

  it("fills a through-hole with one click on its wall, flush with the faces", async () => {
    const drilled = (await buildGroupedShapeFromSelection([box, bore], 400000)).group!;
    const positions = soup(drilled);
    const before = volume(positions);
    expect(before).toBeLessThan(8000 - 500);
    // A point on the bore's wall, facing the axis (into the hole).
    const filled = await fillHoleAt(positions, { x: 3, y: 10, z: 0 }, { x: -1, y: 0, z: 0 });
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(volume(filled.positions)).toBeCloseTo(8000, -1);
    expect(meshHealth(filled.positions).watertight).toBe(true);
  });

  it("refuses a click on a flat outside face", async () => {
    const drilled = (await buildGroupedShapeFromSelection([box, bore], 400000)).group!;
    const result = await fillHoleAt(soup(drilled), { x: 10, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(result.ok).toBe(false);
  });

  it("fills a square hole and a hexagonal nut trap too", async () => {
    const square = { ...bore, kind: "box", size: 6, width: 6, depth: 6 } as WorkplaneShape;
    const hex = { ...bore, kind: "polygon", sides: 6, polygonSides: 6, height: 8, elevation: 12.01 } as unknown as WorkplaneShape;
    for (const cutter of [square, hex]) {
      const drilled = (await buildGroupedShapeFromSelection([box, cutter], 400000)).group!;
      const positions = soup(drilled);
      const before = volume(positions);
      // A point on a wall of the hole, facing into it (x = +side of a box or hexagon with circumradius 3).
      const wallX = cutter === square ? 3 : 3 * Math.cos(Math.PI / 6);
      const at = cutter === square ? { x: wallX, y: 10, z: 0.5 } : { x: wallX, y: 16, z: 0 };
      const filled = await fillHoleAt(positions, at, { x: -1, y: 0, z: 0 });
      expect(filled.ok).toBe(true);
      if (filled.ok) expect(volume(filled.positions)).toBeGreaterThan(before + 50);
    }
  });

  it("does not fill the inside corner of an L bracket", async () => {
    const block = { ...box, id: "l", width: 30, depth: 20, height: 30 } as WorkplaneShape;
    const notch = { ...box, id: "n", hole: true, x: 5, z: 0, elevation: 5, width: 25, depth: 22, height: 30 } as WorkplaneShape;
    const bracket = (await buildGroupedShapeFromSelection([block, notch], 400000)).group!;
    // The bracket's inner floor (y = 5), facing up.
    const result = await fillHoleAt(soup(bracket), { x: 5, y: 5, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(result.ok).toBe(false);
  });

  it("closes a removed face with a hole in it as a ring, leaving the hole open", async () => {
    const drilled = (await buildGroupedShapeFromSelection([box, bore], 400000)).group!;
    const all = soup(drilled);
    const full = volume(all);
    const open: number[] = [];
    for (let i = 0; i < all.length; i += 9) {
      if (all[i + 1] > 19.99 && all[i + 4] > 19.99 && all[i + 7] > 19.99) continue;
      open.push(...all.slice(i, i + 9));
    }
    expect(meshHealth(open).openings).toBe(2);
    const repaired = makeSolidPositions(open);
    expect(meshHealth(repaired.positions).watertight).toBe(true);
    expect(await isManifoldSolid(repaired.positions)).toBe(true);
    // The same volume as the drilled block: the bore is still open.
    expect(volume(repaired.positions)).toBeCloseTo(full, 0);
  });
});
