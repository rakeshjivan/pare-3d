/**
 * Fork (build 32): a fillet whose radius changes along the edge, from one size at its start to
 * another at its end (Fusion's "variable radius"). The kernel takes one edge at a time, so several
 * edges are rounded in turn: each later edge is found again on the new body by its middle point,
 * which stays where it was unless a rounded neighbour trimmed its end.
 */
import type { OcctKernel, ShapeHandle } from "occt-wasm";

type Vec = { x: number; y: number; z: number };

function polylineMiddle(points: ArrayLike<number>): Vec | null {
  const count = Math.floor(points.length / 3);
  if (count < 2) return null;
  let total = 0;
  const lengths: number[] = [];
  for (let index = 1; index < count; index += 1) {
    const length = Math.hypot(points[index * 3] - points[index * 3 - 3], points[index * 3 + 1] - points[index * 3 - 2], points[index * 3 + 2] - points[index * 3 - 1]);
    lengths.push(length);
    total += length;
  }
  let walked = 0;
  for (let index = 1; index < count; index += 1) {
    const length = lengths[index - 1];
    if (walked + length >= total / 2 && length > 0) {
      const t = (total / 2 - walked) / length;
      return {
        x: points[index * 3 - 3] + (points[index * 3] - points[index * 3 - 3]) * t,
        y: points[index * 3 - 2] + (points[index * 3 + 1] - points[index * 3 - 2]) * t,
        z: points[index * 3 - 1] + (points[index * 3 + 2] - points[index * 3 - 1]) * t,
      };
    }
    walked += length;
  }
  return { x: points[0], y: points[1], z: points[2] };
}

export function edgeMiddle(cad: OcctKernel, edge: ShapeHandle): Vec | null {
  try {
    return polylineMiddle(cad.wireframe(edge, 0.05).points);
  } catch {
    return null;
  }
}

function release(cad: OcctKernel, handles: ShapeHandle[]) {
  handles.forEach((handle) => {
    try {
      cad.release(handle);
    } catch {
      // already gone
    }
  });
}

/** Rounds `edges` of `solid` from `start` to `end`; the caller releases the result. Throws when the kernel refuses. */
export function filletVariableEdges(cad: OcctKernel, solid: ShapeHandle, edges: ShapeHandle[], start: number, end: number): ShapeHandle {
  if (edges.length === 0) return cad.copy(solid);
  if (edges.length === 1) return cad.filletVariable(solid, edges[0], start, end);
  const middles = edges.map((edge) => edgeMiddle(cad, edge));
  if (middles.some((middle) => middle === null)) throw new Error("An edge to round could not be measured");
  const reach = Math.max(start, end) + 1e-3;
  let current = cad.filletVariable(solid, edges[0], start, end);
  for (let index = 1; index < edges.length; index += 1) {
    const target = middles[index] as Vec;
    const candidates = cad.getSubShapes(current, "edge");
    let best: ShapeHandle | null = null;
    let bestDistance = Infinity;
    try {
      for (const candidate of candidates) {
        const middle = edgeMiddle(cad, candidate);
        if (!middle) continue;
        const distance = Math.hypot(middle.x - target.x, middle.y - target.y, middle.z - target.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
      if (!best || bestDistance > reach) throw new Error("An edge to round was lost while rounding its neighbour; pick fewer edges at a time");
      const next = cad.filletVariable(current, best, start, end);
      release(cad, [current]);
      current = next;
    } catch (error) {
      release(cad, [current]);
      throw error;
    } finally {
      release(cad, candidates);
    }
  }
  return current;
}
