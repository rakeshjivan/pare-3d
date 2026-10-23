/**
 * Fork (build 40): what text on a surface needs to know about the part it sits on - its triangles,
 * its middle, its anchor points and a grid to find the triangles near a spot - worked out once per
 * version of the part and kept while that version lives. Parts are never changed in place (every
 * edit makes a new shape object), so the shape object itself is the key; a dense part (a sphere at
 * the highest step count has over 250,000 triangles) then costs nothing on every drag update.
 */
import { surfaceAnchors, type SurfaceAnchor } from "@/lib/surfaceTextFollow";

export type Vec = { x: number; y: number; z: number };

export type PartGeometry = {
  triangles: Float32Array;
  center: Vec;
  anchors: SurfaceAnchor[] | undefined;
  cell: number;
  min: Vec;
  dims: [number, number, number];
  bins: Map<number, number[]>;
};

const cache = new WeakMap<object, PartGeometry>();

/** The part's geometry, built from `mesh` the first time a version of the part is asked about. */
export function partGeometry(part: object, mesh: () => { vertices: ReadonlyArray<readonly number[]>; faces: ReadonlyArray<readonly number[]> }): PartGeometry {
  const known = cache.get(part);
  if (known) return known;
  const { vertices, faces } = mesh();
  let count = 0;
  for (const face of faces) count += Math.max(0, face.length - 2);
  const triangles = new Float32Array(count * 9);
  let o = 0;
  for (const face of faces) {
    for (let k = 1; k + 1 < face.length; k += 1) {
      for (const index of [face[0], face[k], face[k + 1]]) {
        const v = vertices[index];
        triangles[o] = v[0];
        triangles[o + 1] = v[1];
        triangles[o + 2] = v[2];
        o += 3;
      }
    }
  }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < triangles.length; i += 3) {
    if (triangles[i] < min.x) min.x = triangles[i];
    if (triangles[i] > max.x) max.x = triangles[i];
    if (triangles[i + 1] < min.y) min.y = triangles[i + 1];
    if (triangles[i + 1] > max.y) max.y = triangles[i + 1];
    if (triangles[i + 2] < min.z) min.z = triangles[i + 2];
    if (triangles[i + 2] > max.z) max.z = triangles[i + 2];
  }
  const extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1e-6);
  const cell = Math.max(extent / 40, 0.5);
  const dims: [number, number, number] = [
    Math.floor((max.x - min.x) / cell) + 1,
    Math.floor((max.y - min.y) / cell) + 1,
    Math.floor((max.z - min.z) / cell) + 1,
  ];
  const bins = new Map<number, number[]>();
  for (let t = 0; t < count; t += 1) {
    const b = t * 9;
    const lo = (axis: number) => Math.floor((Math.min(triangles[b + axis], triangles[b + 3 + axis], triangles[b + 6 + axis]) - [min.x, min.y, min.z][axis]) / cell);
    const hi = (axis: number) => Math.floor((Math.max(triangles[b + axis], triangles[b + 3 + axis], triangles[b + 6 + axis]) - [min.x, min.y, min.z][axis]) / cell);
    for (let i = lo(0); i <= hi(0); i += 1) for (let j = lo(1); j <= hi(1); j += 1) for (let k = lo(2); k <= hi(2); k += 1) {
      const key = i + dims[0] * (j + dims[1] * k);
      const list = bins.get(key);
      if (list) list.push(t);
      else bins.set(key, [t]);
    }
  }
  const geometry: PartGeometry = {
    triangles,
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    anchors: surfaceAnchors(vertices),
    cell,
    min,
    dims,
    bins,
  };
  cache.set(part, geometry);
  return geometry;
}

/** The part's triangles that come within `radius` of `p` (a box test, so a few more), as a triangle list. */
export function trianglesNear(geometry: PartGeometry, p: Vec, radius: number): Float32Array {
  const { cell, min, dims, bins, triangles } = geometry;
  const range = (value: number, base: number, size: number): [number, number] => [
    Math.max(0, Math.floor((value - radius - base) / cell)),
    Math.min(size - 1, Math.floor((value + radius - base) / cell)),
  ];
  const [i0, i1] = range(p.x, min.x, dims[0]);
  const [j0, j1] = range(p.y, min.y, dims[1]);
  const [k0, k1] = range(p.z, min.z, dims[2]);
  const picked = new Set<number>();
  for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) for (let k = k0; k <= k1; k += 1) {
    for (const t of bins.get(i + dims[0] * (j + dims[1] * k)) ?? []) picked.add(t);
  }
  // Nearly the whole part: no point copying.
  if (picked.size * 9 > triangles.length * 0.8) return triangles;
  const out = new Float32Array(picked.size * 9);
  let o = 0;
  for (const t of picked) {
    out.set(triangles.subarray(t * 9, t * 9 + 9), o);
    o += 9;
  }
  return out;
}
