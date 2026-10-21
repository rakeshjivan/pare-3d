/*
 * Fork: spacing parts out - the part of arranging Tinkercad never had.
 *
 * - Space evenly: the two outer parts stay where they are; the ones between move so every gap is equal.
 * - Exact gap: the first part stays; each next one follows the one before at that gap, edge to edge.
 * - Arrange on plate: all of them in rows (largest first) at a gap, the block centred on the plate.
 *
 * Works on footprints (each part's box as seen from above), whatever their sizes. Axis "x" runs
 * right, "y" to the back (the scene's -z). Locked parts are not moved but still take their place.
 */

export type Footprint = { id: string; minX: number; maxX: number; minZ: number; maxZ: number; locked?: boolean };
export type Move = { dx: number; dz: number };
export type DistributeAxis = "x" | "y";

function along(footprint: Footprint, axis: DistributeAxis) {
  // Y runs to the back, which is -z: its "start" is the largest z.
  return axis === "x"
    ? { start: footprint.minX, end: footprint.maxX }
    : { start: -footprint.maxZ, end: -footprint.minZ };
}

function moveAlong(axis: DistributeAxis, delta: number): Move {
  return axis === "x" ? { dx: delta, dz: 0 } : { dx: 0, dz: -delta };
}

function ordered(parts: readonly Footprint[], axis: DistributeAxis) {
  return [...parts].sort((a, b) => along(a, axis).start - along(b, axis).start || along(a, axis).end - along(b, axis).end);
}

/** Equal gaps between neighbours, the outer two kept; null when there are fewer than three parts. */
export function spaceEvenly(parts: readonly Footprint[], axis: DistributeAxis): Map<string, Move> | null {
  if (parts.length < 3) return null;
  const sorted = ordered(parts, axis);
  const first = along(sorted[0], axis);
  const last = along(sorted[sorted.length - 1], axis);
  const sizes = sorted.reduce((sum, part) => sum + (along(part, axis).end - along(part, axis).start), 0);
  const gap = (last.end - first.start - sizes) / (sorted.length - 1);
  const moves = new Map<string, Move>();
  let cursor = first.start;
  sorted.forEach((part, index) => {
    const { start, end } = along(part, axis);
    const target = index === sorted.length - 1 ? start : cursor;
    if (!part.locked && Math.abs(target - start) > 1e-9) moves.set(part.id, moveAlong(axis, target - start));
    cursor = target + (end - start) + gap;
  });
  return moves;
}

/** The first part kept; each next one placed `gap` after the one before (edge to edge). */
export function spaceWithGap(parts: readonly Footprint[], axis: DistributeAxis, gap: number): Map<string, Move> | null {
  if (parts.length < 2) return null;
  const sorted = ordered(parts, axis);
  const moves = new Map<string, Move>();
  let cursor = along(sorted[0], axis).end + gap;
  sorted.slice(1).forEach((part) => {
    const { start, end } = along(part, axis);
    const target = part.locked ? start : cursor;
    if (!part.locked && Math.abs(target - start) > 1e-9) moves.set(part.id, moveAlong(axis, target - start));
    cursor = target + (end - start) + gap;
  });
  return moves;
}

/**
 * Rows across the plate: largest first, left to right at `gap`, a new row (towards the front) when
 * the next would pass the plate's width; the whole block centred on `centre` (scene x, z).
 */
export function arrangeOnPlate(parts: readonly Footprint[], gap: number, plateWidth: number, centre = { x: 0, z: 0 }): Map<string, Move> | null {
  const movable = parts.filter((part) => !part.locked);
  if (!movable.length) return null;
  const sorted = [...movable].sort((a, b) => (b.maxZ - b.minZ) - (a.maxZ - a.minZ) || (b.maxX - b.minX) - (a.maxX - a.minX));
  const rows: Footprint[][] = [];
  let row: Footprint[] = [];
  let rowWidth = 0;
  sorted.forEach((part) => {
    const width = part.maxX - part.minX;
    const next = row.length ? rowWidth + gap + width : width;
    if (row.length && next > plateWidth) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    rowWidth = row.length ? rowWidth + gap + width : width;
    row.push(part);
  });
  if (row.length) rows.push(row);
  const rowWidths = rows.map((entries) => entries.reduce((sum, part) => sum + (part.maxX - part.minX), 0) + gap * (entries.length - 1));
  const rowDepths = rows.map((entries) => Math.max(...entries.map((part) => part.maxZ - part.minZ)));
  const totalDepth = rowDepths.reduce((sum, depth) => sum + depth, 0) + gap * (rows.length - 1);
  const moves = new Map<string, Move>();
  // The first row at the back (smallest z), each next one in front of it.
  let z = centre.z - totalDepth / 2;
  rows.forEach((entries, rowIndex) => {
    let x = centre.x - rowWidths[rowIndex] / 2;
    entries.forEach((part) => {
      const width = part.maxX - part.minX;
      const depth = part.maxZ - part.minZ;
      // Each part sits in the middle of its row's depth.
      const targetMinZ = z + (rowDepths[rowIndex] - depth) / 2;
      moves.set(part.id, { dx: x - part.minX, dz: targetMinZ - part.minZ });
      x += width + gap;
    });
    z += rowDepths[rowIndex] + gap;
  });
  return moves;
}
