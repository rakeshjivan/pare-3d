/**
 * Fork (build 32): whether an edge sticks out (an outside edge, like a box's corner) or is tucked
 * in (an inside edge, where a wall meets the floor of a pocket). The fillet and chamfer tool's
 * "Outside edges" and "Inside edges" buttons pick by this.
 *
 * Both faces' normals point out of the solid. Step from the edge into face A, at right angles to
 * the edge: on an outside edge that step goes behind face B (against B's normal), on an inside
 * edge it goes in front of it. Which way along a x t leads into face A is asked of the face itself.
 */
import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { orientedFaceNormal } from "@/lib/cadShell";

type Vec = { x: number; y: number; z: number };
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const unit = (a: Vec): Vec => scale(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));

/** How far into face A the test steps: well inside the kernel's tolerance, well short of any feature. */
function stepFor(points: number[]) {
  let length = 0;
  for (let index = 3; index + 2 < points.length; index += 3) {
    length += Math.hypot(points[index] - points[index - 3], points[index + 1] - points[index - 2], points[index + 2] - points[index - 1]);
  }
  return Math.max(0.002, Math.min(0.05, length * 0.05));
}

function liesOnFace(cad: OcctKernel, face: ShapeHandle, point: Vec, step: number) {
  try {
    const uv = cad.uvFromPoint(face, point);
    const where = cad.classifyPointOnFace(face, uv.u, uv.v);
    if (where === "in") return true;
    if (where === "out") return false;
  } catch {
    // fall through to the projection
  }
  const projected = cad.projectPointOnFace(face, point);
  return Math.hypot(projected.x - point.x, projected.y - point.y, projected.z - point.z) < step * 0.3;
}

/**
 * True for an outside edge, false for an inside one, null when it cannot be told (a seam, a
 * tangent join, a degenerate edge). `points` is the edge's polyline.
 */
export function edgeIsConvex(cad: OcctKernel, points: number[], faceA: ShapeHandle, faceB: ShapeHandle): boolean | null {
  if (points.length < 6) return null;
  const middle = Math.floor(points.length / 6) * 3;
  const at = middle + 3 < points.length ? middle : middle - 3;
  const p: Vec = { x: points[at], y: points[at + 1], z: points[at + 2] };
  const q: Vec = { x: points[at + 3], y: points[at + 4], z: points[at + 5] };
  const tangent = unit(sub(q, p));
  const point = scale(add(p, q), 0.5);
  try {
    const a = orientedFaceNormal(cad, faceA, point);
    const b = orientedFaceNormal(cad, faceB, point);
    if (Math.abs(dot(a, b)) > 0.9999) return null;
    const step = stepFor(points);
    const across = unit(cross(a, tangent));
    const forward = liesOnFace(cad, faceA, add(point, scale(across, step)), step);
    const backward = liesOnFace(cad, faceA, add(point, scale(across, -step)), step);
    if (forward === backward) return null;
    const intoA = forward ? across : scale(across, -1);
    return dot(intoA, b) < 0;
  } catch {
    return null;
  }
}
