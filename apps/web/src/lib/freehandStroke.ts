import { createLocalId } from "@/lib/localIds";
import { withSmoothSketchHandles } from "@/lib/sketchSmoothHandles";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/layerling";

/*
 * Fork: Scribble - freehand drawing in the Sketch tab, as in Tinkercad. The pointer's path is
 * thinned to the few points that carry its shape (Ramer-Douglas-Peucker), and those become an
 * ordinary smooth curve: its points can be dragged, deleted or refined like any other.
 *
 * A stroke that ends near where it began closes into a shape. One that does not closes too - the
 * way Tinkercad's Scribble makes a shape - unless the sketch is drawn as a stroke (then an open line
 * is a line of that width), as construction lines (a path for a sweep), or closing it would make
 * the outline cross itself (then it stays a line, built once Stroke is on).
 */

type Vec = { x: number; z: number };

function distanceToSegment(point: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-12) return Math.hypot(point.x - a.x, point.z - a.z);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}

/** The fewest points that stay within `tolerance` of the drawn path. */
export function simplifyStroke(points: readonly Vec[], tolerance: number): Vec[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distance = distanceToSegment(points[index], points[first], points[last]);
      if (distance > farthestDistance) {
        farthest = index;
        farthestDistance = distance;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]).map((point) => ({ ...point }));
}

function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec) {
  const side = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Whether the outline through these points, closed back to the first, crosses itself. */
export function closedOutlineCrossesItself(points: readonly Vec[]) {
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) continue; // neighbours across the closing side
      if (segmentsCross(a, b, points[j], points[(j + 1) % count])) return true;
    }
  }
  return false;
}

/** Points at an even spacing along the path, its two ends kept. */
export function resampleStroke(points: readonly Vec[], spacing: number): Vec[] {
  if (points.length < 2 || spacing <= 0) return points.map((point) => ({ ...point }));
  const out: Vec[] = [{ ...points[0] }];
  let carried = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    let along = spacing - carried;
    while (along <= length) {
      const t = along / length;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      along += spacing;
    }
    carried = length - (along - spacing);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) < spacing * 0.35 && out.length > 1) out[out.length - 1] = { ...last };
  else out.push({ ...last });
  return out;
}

function pathLength(points: readonly Vec[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z);
  return length;
}

export type FreehandOptions = {
  /** How far, in mm, the curve may stray from the pointer's path; about a pixel or two on screen. */
  tolerance: number;
  /** The sketch is built as a stroke: an open line stays open. */
  stroked: boolean;
  /** Drawn as construction lines (a sweep's path): stays open, never part of the body. */
  construction: boolean;
};

export type FreehandResult = { profile: SketchProfile; closed: boolean; pointIds: string[] };

/** The sketch with the scribble added as a smooth curve, or null when it was too short to keep. */
export function addFreehandStroke(profile: SketchProfile, raw: readonly Vec[], options: FreehandOptions): FreehandResult | null {
  const tolerance = Math.max(1e-4, options.tolerance);
  // Points closer than the tolerance add nothing but jitter.
  const cleaned: Vec[] = [];
  raw.forEach((point) => {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.z - last.z) >= tolerance * 0.5) cleaned.push(point);
  });
  const length = pathLength(cleaned);
  if (cleaned.length < 2 || length < tolerance * 6) return null;

  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  const gap = Math.hypot(last.x - first.x, last.z - first.z);
  const endsMeet = gap <= Math.max(tolerance * 8, length * 0.06);
  // Evenly spaced first: thinned straight from the raw path the points bunch up in every bend and
  // leave long gaps between, and a smooth curve through them comes out with sharp turns.
  const spacing = Math.max(tolerance * 4, length / 48);
  let simplified = simplifyStroke(resampleStroke(cleaned, spacing), tolerance * 1.5);
  // An open scribble closes into a shape only where that makes a proper outline: a C becomes a
  // filled D, but an S closed back to its start would cross itself, so it stays a line.
  const closed = !options.construction && (endsMeet || (!options.stroked && !closedOutlineCrossesItself(simplified)));

  if (closed) {
    // The closing side joins the last point to the first; a last point on top of the first goes.
    if (simplified.length > 2 && Math.hypot(simplified[simplified.length - 1].x - first.x, simplified[simplified.length - 1].z - first.z) <= tolerance * 8) simplified = simplified.slice(0, -1);
    // A closed shape needs three corners; a stroke along a line gets a middle point back.
    if (simplified.length < 3) {
      const middle = cleaned[Math.floor(cleaned.length / 2)];
      simplified = [simplified[0], middle, simplified[simplified.length - 1]];
    }
    if (simplified.length < 3) return null;
  }

  const points: SketchPoint[] = simplified.map((point) => ({ id: createLocalId("sketch-point"), x: point.x, z: point.z, mode: "smooth" }));
  const segment = (from: SketchPoint, to: SketchPoint): SketchSegment => ({
    id: createLocalId("sketch-segment"),
    startId: from.id,
    endId: to.id,
    kind: "smooth",
    ...(options.construction ? { construction: true } : {}),
  });
  const segments: SketchSegment[] = [];
  for (let index = 1; index < points.length; index += 1) segments.push(segment(points[index - 1], points[index]));
  if (closed) segments.push(segment(points[points.length - 1], points[0]));
  // Open ends are corners: a smooth end would bend nothing.
  if (!closed) {
    points[0].mode = "corner";
    points[points.length - 1].mode = "corner";
  }
  const pointIds = points.map((point) => point.id);
  const next: SketchProfile = { ...profile, points: [...profile.points, ...points], segments: [...profile.segments, ...segments] };
  return { profile: withSmoothSketchHandles(next, new Set(pointIds.filter((_, index) => closed || (index > 0 && index < pointIds.length - 1)))), closed, pointIds };
}
