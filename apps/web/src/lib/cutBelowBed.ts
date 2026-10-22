/**
 * Fork (build 30): Cut below the bed - a part sunk partly below the plate (moved down on purpose to
 * flatten its base, or imported that way) is trimmed at the plate. The Pare 3D way: the part is grouped
 * with a hole box filling everything under the plate beneath it, so it stays editable and Ungroup
 * takes the cut back.
 */
import { meshForShape } from "@/lib/editorMeshCore";
import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import { createLocalId } from "@/lib/localIds";
import type { WorkplaneShape } from "@/types/layerling";

/** Deeper than this below the plate counts as sunk; less is rounding. */
export const BELOW_BED_TOLERANCE = 0.01;

/** The part's lowest point and its footprint, from its own mesh (not its turned box). */
export function shapeBelowBed(shape: WorkplaneShape): { minY: number; minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (shape.hole) return null;
  const vertices = meshForShape(shape).vertices;
  if (!vertices.length) return null;
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, y, z] of vertices) {
    if (y < minY) minY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return minY < -BELOW_BED_TOLERANCE ? { minY, minX, maxX, minZ, maxZ } : null;
}

/** The hole box that takes away everything of the part below the plate. */
export function belowBedCutter(shape: WorkplaneShape): WorkplaneShape | null {
  const below = shapeBelowBed(shape);
  if (!below) return null;
  const box = libraryShapeAssets.find((entry) => entry.id === "box");
  if (!box) return null;
  const margin = 1;
  const width = below.maxX - below.minX + 2 * margin;
  const depth = below.maxZ - below.minZ + 2 * margin;
  const height = -below.minY + margin;
  const cutter = makeShapeFromAsset(
    box,
    { x: (below.minX + below.maxX) / 2, z: (below.minZ + below.maxZ) / 2, elevation: below.minY - margin },
    { width, depth, height },
  );
  return { ...cutter, id: createLocalId("below-bed"), name: "Below the bed", hole: true };
}
