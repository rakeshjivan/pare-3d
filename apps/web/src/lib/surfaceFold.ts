/**
 * Fork (build 40): letters folded over an edge onto the next face, the way a sticker is pressed
 * round a corner. From the last point where the letters still sat on the surface, a straight line
 * is walked on across the part's triangles for the rest of the distance: crossing an edge, the
 * line turns down onto the next face by the angle between the two, keeping its heading along the
 * edge. Distances along the surface are kept, so the letters are neither stretched nor squashed.
 */
import { weldTriangles } from "@/lib/meshRepair";

export type Vec = { x: number; y: number; z: number };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec): Vec => scale(a, 1 / (len(a) || 1));

export type FoldMesh = {
  points: Vec[];
  triangles: Array<[number, number, number]>;
  normals: Vec[];
  /** For each triangle, the triangle across each of its edges (ab, bc, ca), or -1. */
  across: Array<[number, number, number]>;
  /** Triangles binned on a 3D grid, for finding the one under a point. */
  cell: number;
  min: Vec;
  bins: Map<string, number[]>;
};

export function foldMesh(target: ArrayLike<number>): FoldMesh | null {
  const welded = weldTriangles(target);
  const points = welded.points.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
  const triangles = welded.triangles.filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) as Array<[number, number, number]>;
  if (!triangles.length) return null;
  const normals = triangles.map(([a, b, c]) => unit(cross(sub(points[b], points[a]), sub(points[c], points[a]))));
  const edges = new Map<string, Array<[number, number]>>();
  triangles.forEach((t, ti) => {
    for (let k = 0; k < 3; k += 1) {
      const a = t[k], b = t[(k + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = edges.get(key);
      if (list) list.push([ti, k]);
      else edges.set(key, [[ti, k]]);
    }
  });
  const across = triangles.map(() => [-1, -1, -1] as [number, number, number]);
  for (const list of edges.values()) {
    // Only an edge shared by exactly two triangles can be walked across.
    if (list.length !== 2) continue;
    across[list[0][0]][list[0][1]] = list[1][0];
    across[list[1][0]][list[1][1]] = list[0][0];
  }
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min = { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) };
    max = { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) };
  }
  const extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1e-6);
  const cell = Math.max(extent / 48, 0.5);
  const bins = new Map<string, number[]>();
  triangles.forEach(([a, b, c], ti) => {
    const pa = points[a], pb = points[b], pc = points[c];
    const lo = (k: "x" | "y" | "z") => Math.floor((Math.min(pa[k], pb[k], pc[k]) - min[k]) / cell);
    const hi = (k: "x" | "y" | "z") => Math.floor((Math.max(pa[k], pb[k], pc[k]) - min[k]) / cell);
    for (let i = lo("x"); i <= hi("x"); i += 1) for (let j = lo("y"); j <= hi("y"); j += 1) for (let k = lo("z"); k <= hi("z"); k += 1) {
      const key = `${i}_${j}_${k}`;
      const list = bins.get(key);
      if (list) list.push(ti);
      else bins.set(key, [ti]);
    }
  });
  return { points, triangles, normals, across, cell, min, bins };
}

function closestOnTriangle(p: Vec, a: Vec, b: Vec, c: Vec): Vec {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

/**
 * The triangle under p: among those within a small distance, the one facing most like `facing`
 * (at an edge both faces are as near; the one the letters came from is wanted).
 */
export function triangleAt(mesh: FoldMesh, p: Vec, facing: Vec): { triangle: number; point: Vec } | null {
  const i0 = Math.floor((p.x - mesh.min.x) / mesh.cell), j0 = Math.floor((p.y - mesh.min.y) / mesh.cell), k0 = Math.floor((p.z - mesh.min.z) / mesh.cell);
  let best: { triangle: number; point: Vec; d: number; f: number } | null = null;
  for (let ring = 1; ring <= 3 && !best; ring += 1) {
    for (let i = i0 - ring; i <= i0 + ring; i += 1) for (let j = j0 - ring; j <= j0 + ring; j += 1) for (let k = k0 - ring; k <= k0 + ring; k += 1) {
      for (const ti of mesh.bins.get(`${i}_${j}_${k}`) ?? []) {
        const [a, b, c] = mesh.triangles[ti];
        const q = closestOnTriangle(p, mesh.points[a], mesh.points[b], mesh.points[c]);
        const d = len(sub(q, p));
        const f = dot(mesh.normals[ti], facing);
        if (!best || d < best.d - 0.02 || (Math.abs(d - best.d) <= 0.02 && f > best.f)) best = { triangle: ti, point: q, d, f };
      }
    }
  }
  return best && best.d < mesh.cell * 2 ? { triangle: best.triangle, point: best.point } : null;
}

/**
 * Walks `distance` along the surface from `start` (on triangle `triangle`) heading `heading`
 * (turned into that triangle's plane). Returns where it ends and the surface's normal there, or
 * null when the walk runs off an open edge of the part.
 */
export function walkOnSurface(mesh: FoldMesh, triangle: number, start: Vec, heading: Vec, distance: number): { point: Vec; normal: Vec } | null {
  let t = triangle;
  let p = start;
  let n = mesh.normals[t];
  let d = unit(sub(heading, scale(n, dot(heading, n))));
  if (len(d) < 0.5) return null;
  let left = distance;
  let stuck = 0;
  for (let step = 0; step < 400 && left > 1e-9; step += 1) {
    const tri = mesh.triangles[t];
    // Where the line leaves this triangle: the nearest edge crossed ahead.
    let exitEdge = -1;
    let exitT = Infinity;
    for (let k = 0; k < 3; k += 1) {
      const a = mesh.points[tri[k]], b = mesh.points[tri[(k + 1) % 3]];
      const e = sub(b, a);
      // Solve p + s d = a + r e, in the triangle's plane.
      const m = cross(d, e);
      const mm = dot(m, m);
      if (mm < 1e-18) continue;
      const ap = sub(a, p);
      const s = dot(cross(ap, e), m) / mm;
      const r = dot(cross(ap, d), m) / mm;
      if (s > 1e-7 && r >= -1e-6 && r <= 1 + 1e-6 && s < exitT) {
        exitT = s;
        exitEdge = k;
      }
    }
    if (exitEdge < 0) {
      // On a corner or an edge exactly, no edge was found ahead: nudge in towards the triangle's
      // middle and look again; never shoot straight off the surface.
      if (stuck >= 2) return null;
      stuck += 1;
      const middle = scale(add(add(mesh.points[tri[0]], mesh.points[tri[1]]), mesh.points[tri[2]]), 1 / 3);
      p = add(p, scale(sub(middle, p), 1e-4));
      continue;
    }
    stuck = 0;
    if (exitT >= left) return { point: add(p, scale(d, left)), normal: n };
    p = add(p, scale(d, exitT));
    left -= exitT;
    const next = mesh.across[t][exitEdge];
    if (next < 0) return null;
    // Turn the heading down onto the next face about the shared edge.
    const a = mesh.points[tri[exitEdge]], b = mesh.points[tri[(exitEdge + 1) % 3]];
    const e = unit(sub(b, a));
    const along = dot(d, e);
    const n2 = mesh.normals[next];
    let into = unit(cross(n2, e));
    // `into` must point from the edge into the next triangle.
    const nt = mesh.triangles[next];
    const opposite = nt.find((index) => index !== tri[exitEdge] && index !== tri[(exitEdge + 1) % 3]);
    if (opposite !== undefined && dot(sub(mesh.points[opposite], a), into) < 0) into = scale(into, -1);
    const sideways = Math.sqrt(Math.max(0, 1 - along * along));
    d = unit(add(scale(e, along), scale(into, sideways)));
    t = next;
    n = n2;
    // Nudge off the edge so the next exit is not the edge just crossed.
    p = add(p, scale(d, 1e-6));
    left -= 1e-6;
  }
  return { point: p, normal: n };
}
