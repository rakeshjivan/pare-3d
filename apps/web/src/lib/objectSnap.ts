/**
 * Fangen beim Verschieben: der gezogene Umriss rastet mit Kante oder Mitte an
 * Kante oder Mitte einer anderen Form ein, getrennt fuer X und Z.
 *
 * Alles in Weltkoordinaten auf der Grundebene; die Umrisse sind achsparallele
 * Huellrechtecke, so wie Ausrichten sie auch nimmt.
 */

export type SnapBox = { minX: number; maxX: number; minZ: number; maxZ: number };

/** A guide line at `value` on `axis`, drawn across the other axis from `from` to `to`. */
export type ObjectSnapGuide = { axis: "x" | "z"; value: number; from: number; to: number };

export type ObjectSnapResult = { dx: number | null; dz: number | null; guides: ObjectSnapGuide[] };

const SAME_LINE = 1e-6;

function lines(min: number, max: number) {
  return [min, (min + max) / 2, max];
}

function bestOffset(moving: number[], targets: SnapBox[], pick: (box: SnapBox) => number[], threshold: number) {
  let best: number | null = null;
  targets.forEach((target) => {
    pick(target).forEach((line) => {
      moving.forEach((own) => {
        const offset = line - own;
        if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best) - SAME_LINE)) best = offset;
      });
    });
  });
  return best;
}

export function shiftSnapBox(box: SnapBox, dx: number, dz: number): SnapBox {
  return { minX: box.minX + dx, maxX: box.maxX + dx, minZ: box.minZ + dz, maxZ: box.maxZ + dz };
}

/**
 * Finds the smallest shift (each axis on its own, at most `threshold`) that lays
 * an edge or the centre of `moving` onto an edge or centre of a target, plus the
 * guide lines that show every alignment the shifted box then has.
 */
export function objectSnapOffset(moving: SnapBox, targets: SnapBox[], threshold: number): ObjectSnapResult {
  if (targets.length === 0 || !(threshold > 0)) return { dx: null, dz: null, guides: [] };
  const dx = bestOffset(lines(moving.minX, moving.maxX), targets, (box) => lines(box.minX, box.maxX), threshold);
  const dz = bestOffset(lines(moving.minZ, moving.maxZ), targets, (box) => lines(box.minZ, box.maxZ), threshold);
  const snapped = shiftSnapBox(moving, dx ?? 0, dz ?? 0);
  const guides: ObjectSnapGuide[] = [];
  const addGuides = (axis: "x" | "z") => {
    const own = axis === "x" ? lines(snapped.minX, snapped.maxX) : lines(snapped.minZ, snapped.maxZ);
    targets.forEach((target) => {
      const theirs = axis === "x" ? lines(target.minX, target.maxX) : lines(target.minZ, target.maxZ);
      theirs.forEach((line) => {
        if (!own.some((value) => Math.abs(value - line) < SAME_LINE)) return;
        const from = axis === "x" ? Math.min(snapped.minZ, target.minZ) : Math.min(snapped.minX, target.minX);
        const to = axis === "x" ? Math.max(snapped.maxZ, target.maxZ) : Math.max(snapped.maxX, target.maxX);
        const existing = guides.find((guide) => guide.axis === axis && Math.abs(guide.value - line) < SAME_LINE);
        if (existing) {
          existing.from = Math.min(existing.from, from);
          existing.to = Math.max(existing.to, to);
        } else {
          guides.push({ axis, value: line, from, to });
        }
      });
    });
  };
  if (dx !== null) addGuides("x");
  if (dz !== null) addGuides("z");
  return { dx, dz, guides };
}

/** The gap from the moving box to its nearest neighbour beside it, as a line on the plate. */
export type ObjectGap = { axis: "x" | "z"; from: number; to: number; at: number; distance: number };

/**
 * Fork (build 20): the nearest gap between `moving` and a target it lines up with across the
 * other axis (so the two face each other), up to `maxDistance` - shown as "12.0 mm" while dragging.
 */
export function nearestObjectGap(moving: SnapBox, targets: SnapBox[], maxDistance = 60): ObjectGap | null {
  let best: ObjectGap | null = null;
  const consider = (gap: ObjectGap) => {
    if (gap.distance <= 1e-3 || gap.distance > maxDistance) return;
    if (!best || gap.distance < best.distance) best = gap;
  };
  targets.forEach((target) => {
    const overlapZ = Math.min(moving.maxZ, target.maxZ) - Math.max(moving.minZ, target.minZ);
    const overlapX = Math.min(moving.maxX, target.maxX) - Math.max(moving.minX, target.minX);
    if (overlapZ > 0) {
      const at = (Math.max(moving.minZ, target.minZ) + Math.min(moving.maxZ, target.maxZ)) / 2;
      if (target.minX >= moving.maxX) consider({ axis: "x", from: moving.maxX, to: target.minX, at, distance: target.minX - moving.maxX });
      if (target.maxX <= moving.minX) consider({ axis: "x", from: target.maxX, to: moving.minX, at, distance: moving.minX - target.maxX });
    }
    if (overlapX > 0) {
      const at = (Math.max(moving.minX, target.minX) + Math.min(moving.maxX, target.maxX)) / 2;
      if (target.minZ >= moving.maxZ) consider({ axis: "z", from: moving.maxZ, to: target.minZ, at, distance: target.minZ - moving.maxZ });
      if (target.maxZ <= moving.minZ) consider({ axis: "z", from: target.maxZ, to: moving.minZ, at, distance: moving.minZ - target.maxZ });
    }
  });
  return best;
}
