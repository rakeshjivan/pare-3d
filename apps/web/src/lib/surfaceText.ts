/**
 * Fork (build 34): text on any surface, the way Bambu Studio's text tool works. The letters are
 * laid out flat on the spot that was clicked, cut into small pieces, and every point is dropped
 * onto the model along the face's direction - so the letters hug a dome, a curved body or a scan,
 * standing out of it (raised) or reaching into it (cut in) by the depth.
 *
 * The surface is followed only where it carries on smoothly from the clicked spot (build 35), so
 * letters past an edge stay whole at the edge's height instead of dropping onto another part or
 * cutting through the model.
 *
 * The frame at the spot: W out of the surface (the clicked face's normal), V "up" along the
 * surface (the world's up, or the depth direction on a face that looks up), U to the right.
 */
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { weldTriangles } from "@/lib/meshRepair";
import { foldMesh, triangleAt, walkOnSurface, type FoldMesh } from "@/lib/surfaceFold";

export type Vec = { x: number; y: number; z: number };

export type SurfaceTextPlacement = {
  /** The clicked point and the surface's direction there, in the world. */
  origin: Vec;
  normal: Vec;
  /** Which way the top of the letters points, roughly; projected onto the surface. */
  up?: Vec;
  /** Turns the letters about the normal, in degrees. */
  rotation?: number;
};

export type SurfaceTextMode = "raised" | "engraved";

/** How far raised letters reach into the surface, so they join it where it curves away. */
export const SURFACE_TEXT_SINK = 0.3;
/** How far cut-in letters reach out past the surface, so no skin is left over them. */
export const SURFACE_TEXT_OVERSHOOT = 0.5;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const norm = (a: Vec): Vec => scale(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));

/** U (right), V (up) and W (out) at the spot. */
export function surfaceTextFrame(placement: SurfaceTextPlacement) {
  const w = norm(placement.normal);
  // On a face that looks up or down the letters' top points to the back of the plate (-z), as text on the plate does.
  const wantedUp = placement.up && Math.abs(dot(norm(placement.up), w)) < 0.95
    ? norm(placement.up)
    : Math.abs(w.y) > 0.95 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  let v = norm(sub(wantedUp, scale(w, dot(wantedUp, w))));
  let u = norm(cross(v, w));
  const angle = ((placement.rotation ?? 0) * Math.PI) / 180;
  if (angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ru = { x: u.x * cos + v.x * sin, y: u.y * cos + v.y * sin, z: u.z * cos + v.z * sin };
    const rv = { x: v.x * cos - u.x * sin, y: v.y * cos - u.y * sin, z: v.z * cos - u.z * sin };
    u = ru;
    v = rv;
  }
  return { u, v, w };
}

type Projected = { u: number[]; v: number[]; w: number[] };

/** The target's triangles in the frame, binned on a grid over the area the letters cover. */
function surfaceGrid(target: ArrayLike<number>, origin: Vec, frame: ReturnType<typeof surfaceTextFrame>, area: { minU: number; maxU: number; minV: number; maxV: number }, cell: number) {
  const nu = Math.max(1, Math.ceil((area.maxU - area.minU) / cell));
  const nv = Math.max(1, Math.ceil((area.maxV - area.minV) / cell));
  const bins: number[][] = Array.from({ length: nu * nv }, () => []);
  const tris: Projected = { u: [], v: [], w: [] };
  for (let t = 0; t + 8 < target.length; t += 9) {
    const pu: number[] = [];
    const pv: number[] = [];
    const pw: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const p = { x: target[t + 3 * k] - origin.x, y: target[t + 3 * k + 1] - origin.y, z: target[t + 3 * k + 2] - origin.z };
      pu.push(dot(p, frame.u));
      pv.push(dot(p, frame.v));
      pw.push(dot(p, frame.w));
    }
    const minU = Math.min(...pu), maxU = Math.max(...pu), minV = Math.min(...pv), maxV = Math.max(...pv);
    if (maxU < area.minU || minU > area.maxU || maxV < area.minV || minV > area.maxV) continue;
    // Seen edge-on along the projection: no point falls inside it.
    const det = (pu[1] - pu[0]) * (pv[2] - pv[0]) - (pu[2] - pu[0]) * (pv[1] - pv[0]);
    if (Math.abs(det) < 1e-12) continue;
    const index = tris.u.length / 3;
    tris.u.push(...pu);
    tris.v.push(...pv);
    tris.w.push(...pw);
    const i0 = Math.max(0, Math.floor((minU - area.minU) / cell));
    const i1 = Math.min(nu - 1, Math.floor((maxU - area.minU) / cell));
    const j0 = Math.max(0, Math.floor((minV - area.minV) / cell));
    const j1 = Math.min(nv - 1, Math.floor((maxV - area.minV) / cell));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) bins[j * nu + i].push(index);
  }
  /** Every surface met at (u, v) along W within `reach` of the spot, as heights along W. */
  const heightsAt = (u: number, v: number, reach: number): number[] => {
    const i = Math.floor((u - area.minU) / cell);
    const j = Math.floor((v - area.minV) / cell);
    if (i < 0 || j < 0 || i >= nu || j >= nv) return [];
    const found: number[] = [];
    for (const index of bins[j * nu + i]) {
      const b = index * 3;
      const u0 = tris.u[b], u1 = tris.u[b + 1], u2 = tris.u[b + 2];
      const v0 = tris.v[b], v1 = tris.v[b + 1], v2 = tris.v[b + 2];
      const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
      const l1 = ((u - u0) * (v2 - v0) - (u2 - u0) * (v - v0)) / det;
      const l2 = ((u1 - u0) * (v - v0) - (u - u0) * (v1 - v0)) / det;
      const l0 = 1 - l1 - l2;
      if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
      const w = l0 * tris.w[b] + l1 * tris.w[b + 1] + l2 * tris.w[b + 2];
      if (Math.abs(w) <= reach) found.push(w);
    }
    return found;
  };
  return { heightsAt };
}

/**
 * The surface under the letters as a height field on a fine grid, grown out from the clicked spot:
 * a grid point follows the surface only where it carries on smoothly from a neighbour (no steeper
 * than about 65 degrees), so the letters never drop onto another part of the model or into a gap.
 * Where the surface ends (past an edge, off the part) the height of the nearest point on it is
 * carried on, so the letters stay whole; those points count as off the surface.
 */
function surfaceHeightField(target: ArrayLike<number>, origin: Vec, frame: ReturnType<typeof surfaceTextFrame>, half: { u: number; v: number }, spacing: number) {
  let step = spacing;
  // Not more than about 400k grid points, however long the text.
  while (((2 * half.u) / step + 1) * ((2 * half.v) / step + 1) > 400_000) step *= 1.25;
  const nu = Math.ceil((2 * half.u) / step) + 1;
  const nv = Math.ceil((2 * half.v) / step) + 1;
  const minU = -half.u;
  const minV = -half.v;
  const grid = surfaceGrid(target, origin, frame, { minU: minU - step, maxU: minU + nu * step, minV: minV - step, maxV: minV + nv * step }, Math.max(0.5, step * 2));
  const reach = Math.max(half.u, half.v) * 2 + 2;
  const tolerance = Math.max(0.3, step * 2.2);
  const height = new Float64Array(nu * nv);
  const state = new Uint8Array(nu * nv); // 0 not reached, 1 on the surface, 2 carried on
  const candidates = (index: number) => grid.heightsAt(minU + (index % nu) * step, minV + Math.floor(index / nu) * step, reach);
  // The start: the grid point nearest the spot, on the surface nearest the spot.
  const start = Math.round(half.v / step) * nu + Math.round(half.u / step);
  const first = candidates(start);
  const queue: number[] = [];
  if (first.length) {
    height[start] = first.reduce((best, w) => (Math.abs(w) < Math.abs(best) ? w : best));
    state[start] = 1;
    queue.push(start);
  }
  for (let q = 0; q < queue.length; q += 1) {
    const index = queue[q];
    const i = index % nu;
    const j = Math.floor(index / nu);
    const neighbours = [i > 0 ? index - 1 : -1, i < nu - 1 ? index + 1 : -1, j > 0 ? index - nu : -1, j < nv - 1 ? index + nu : -1];
    for (const next of neighbours) {
      if (next < 0 || state[next]) continue;
      let best: number | null = null;
      for (const w of candidates(next)) if (Math.abs(w - height[index]) <= tolerance && (best === null || Math.abs(w - height[index]) < Math.abs(best - height[index]))) best = w;
      if (best === null) continue;
      height[next] = best;
      state[next] = 1;
      queue.push(next);
    }
  }
  // Past the surface's edge: the nearest point on it carries its height on.
  const fill = queue.slice();
  for (let q = 0; q < fill.length; q += 1) {
    const index = fill[q];
    const i = index % nu;
    const j = Math.floor(index / nu);
    for (const next of [i > 0 ? index - 1 : -1, i < nu - 1 ? index + 1 : -1, j > 0 ? index - nu : -1, j < nv - 1 ? index + nu : -1]) {
      if (next < 0 || state[next]) continue;
      height[next] = height[index];
      state[next] = 2;
      fill.push(next);
    }
  }
  const found = queue.length > 0;
  /** The height at (u, v), smoothly between the grid points, and whether it is on the surface. */
  const at = (u: number, v: number): { w: number; on: boolean } => {
    if (!found) return { w: 0, on: false };
    const fu = Math.max(0, Math.min(nu - 1 - 1e-9, (u - minU) / step));
    const fv = Math.max(0, Math.min(nv - 1 - 1e-9, (v - minV) / step));
    const i = Math.floor(fu);
    const j = Math.floor(fv);
    const i1 = Math.min(nu - 1, i + 1);
    const j1 = Math.min(nv - 1, j + 1);
    const tu = fu - i;
    const tv = fv - j;
    const a = j * nu + i, b = j * nu + i1, c = j1 * nu + i, d = j1 * nu + i1;
    const w = (height[a] * (1 - tu) + height[b] * tu) * (1 - tv) + (height[c] * (1 - tu) + height[d] * tu) * tv;
    return { w, on: state[a] === 1 && state[b] === 1 && state[c] === 1 && state[d] === 1 };
  };
  return { at };
}

export type SurfaceTextResult = {
  positions: number[];
  /** Share of the letters' points that found no surface under them (they run off the part). */
  offSurface: number;
};

/**
 * How the letters meet the part (build 35, as Bambu Studio's text tool offers): "surface" hugs it
 * where it was clicked, "flat" stands on the plane touching the part there, "wrap" runs the line of
 * text right round a closed part - a mug, a bottle, a ring - however far it goes.
 */
export type SurfaceTextShape = "surface" | "flat" | "wrap";

export type SurfaceTextOptions = {
  depth: number;
  mode: SurfaceTextMode;
  letterHeight: number;
  shape?: SurfaceTextShape;
  /**
   * Bends the line of text into an arc, -100 to 100: at 100 the text spans half a circle with its
   * middle highest (a rainbow), at -100 the other way (a smile). 0 is straight.
   */
  curve?: number;
  /** Fork (build 40): a quicker, coarser lay for the preview while the text is dragged. */
  draft?: boolean;
};

/** (u, v) of the letters bent into an arc spanning `curve`% of half a circle; `length` is the text's length along u. */
export function curveLetterPoint(u: number, v: number, curve: number, length: number): [number, number] {
  const span = (Math.max(-100, Math.min(100, curve)) / 100) * Math.PI;
  if (Math.abs(span) < 1e-4 || length <= 0) return [u, v];
  const radius = length / span; // signed: the circle's middle is at (0, -radius)
  const angle = u / radius;
  const rho = radius + v;
  return [rho * Math.sin(angle), rho * Math.cos(angle) - radius];
}

type Contour = { points: Array<[number, number]>; normals: Array<[number, number]>; lengths: number[]; perimeter: number };

/**
 * The part's outline in the plane through the spot across the text (U, W), at height `level` along
 * V, as a closed path starting at the point nearest the spot's line and walked towards +U, with the
 * outward normal at each point.
 */
function wrapContour(polygons: Array<Array<[number, number]>>): Contour | null {
  let best: { polygon: number; edge: number; t: number; d: number } | null = null;
  polygons.forEach((polygon, pi) => {
    for (let k = 0; k < polygon.length; k += 1) {
      const [ax, ay] = polygon[k];
      const [bx, by] = polygon[(k + 1) % polygon.length];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      // Nearest to the spot (0, 0), and on its outer side (not the far wall behind it).
      const d = Math.hypot(px, py);
      if (!best || d < best.d) best = { polygon: pi, edge: k, t, d };
    }
  });
  if (!best) return null;
  const found = best as { polygon: number; edge: number; t: number; d: number };
  const polygon = polygons[found.polygon];
  const n = polygon.length;
  const [ax, ay] = polygon[found.edge];
  const [bx, by] = polygon[(found.edge + 1) % n];
  const start: [number, number] = [ax + found.t * (bx - ax), ay + found.t * (by - ay)];
  // Walk towards +U at the start.
  const forward = bx - ax >= 0;
  const points: Array<[number, number]> = [start];
  for (let k = 1; k <= n; k += 1) {
    const index = forward ? (found.edge + k) % n : (found.edge + 1 - k + n * 2) % n;
    points.push(polygon[index]);
  }
  points.push(start);
  const lengths = [0];
  for (let k = 1; k < points.length; k += 1) lengths.push(lengths[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
  const perimeter = lengths[lengths.length - 1];
  if (perimeter <= 1e-6) return null;
  // Edge normals turned the same way all round, outward (+W) at the start; a point's normal is its edges' mean.
  const edgeNormals: Array<[number, number]> = [];
  for (let k = 0; k + 1 < points.length; k += 1) {
    const dx = points[k + 1][0] - points[k][0], dy = points[k + 1][1] - points[k][1];
    const len = Math.hypot(dx, dy) || 1;
    edgeNormals.push([-dy / len, dx / len]);
  }
  const flip = edgeNormals[0][1] < 0 ? -1 : 1;
  const normals: Array<[number, number]> = points.map((_, k) => {
    const before = edgeNormals[(k - 1 + edgeNormals.length) % edgeNormals.length];
    const after = edgeNormals[Math.min(k, edgeNormals.length - 1)];
    const x = (before[0] + after[0]) * flip, y = (before[1] + after[1]) * flip;
    const len = Math.hypot(x, y) || 1;
    return [x / len, y / len];
  });
  return { points, normals, lengths, perimeter };
}

/** The point and normal `s` along the contour from its start (negative: backwards). */
function alongContour(contour: Contour, s: number): { p: [number, number]; n: [number, number] } {
  const { lengths, perimeter, points, normals } = contour;
  let t = ((s % perimeter) + perimeter) % perimeter;
  let lo = 0, hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = lengths[hi] - lengths[lo] || 1e-12;
  t = (t - lengths[lo]) / span;
  const lerp = (a: [number, number], b: [number, number]): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const n = lerp(normals[lo], normals[hi]);
  const len = Math.hypot(n[0], n[1]) || 1;
  return { p: lerp(points[lo], points[hi]), n: [n[0] / len, n[1] / len] };
}

/**
 * The letters on the surface. `letters` is the flat text as the editor builds it: x to the right,
 * y the thickness (0 at the bottom), z towards the front (the top of the letters at -z); its
 * thickness must be `depth` for raised text and `depth + SURFACE_TEXT_OVERSHOOT` for cut-in text.
 * `target` is the part's surface in the world. Both are triangle lists, 9 numbers a triangle.
 */
export async function surfaceTextPositions(letters: ArrayLike<number>, target: ArrayLike<number>, placement: SurfaceTextPlacement, options: SurfaceTextOptions): Promise<SurfaceTextResult> {
  const frame = surfaceTextFrame(placement);
  const shape = options.shape ?? "surface";
  // The letters cut into small pieces, so they can bend with the surface.
  const runtime = await getManifoldRuntime();
  const welded = weldTriangles(letters);
  // While dragging (draft) the pieces are about twice as long - a quarter as many, as quick to lay.
  const pieceLength = options.draft ? Math.max(0.3, Math.min(1.6, options.letterHeight / 7)) : Math.max(0.15, Math.min(0.8, options.letterHeight / 14));
  let refined: number[] = [];
  const made: Array<{ delete(): void }> = [];
  try {
    const solid = new runtime.Manifold(new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(welded.points.flat()), triVerts: new Uint32Array(welded.triangles.flat()) }));
    made.push(solid);
    if (solid.status() !== "NoError" || solid.isEmpty()) throw new Error("The letters do not make a closed body");
    const fine = solid.refineToLength(pieceLength);
    made.push(fine);
    const mesh = fine.getMesh();
    refined = new Array(mesh.triVerts.length * 3);
    for (let i = 0; i < mesh.triVerts.length; i += 1) {
      const base = mesh.triVerts[i] * mesh.numProp;
      refined[i * 3] = mesh.vertProperties[base];
      refined[i * 3 + 1] = mesh.vertProperties[base + 1];
      refined[i * 3 + 2] = mesh.vertProperties[base + 2];
    }
  } finally {
    made.forEach((item) => item.delete());
  }
  // The letters' middle on the spot.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i + 2 < refined.length; i += 3) {
    minX = Math.min(minX, refined[i]); maxX = Math.max(maxX, refined[i]);
    minY = Math.min(minY, refined[i + 1]); maxY = Math.max(maxY, refined[i + 1]);
    minZ = Math.min(minZ, refined[i + 2]); maxZ = Math.max(maxZ, refined[i + 2]);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const thickness = Math.max(1e-6, maxY - minY);
  const curve = options.curve ?? 0;
  // Each point's place on the plane (u, v) after the arc, and how far up the letter it is (h, 0 to 1).
  const uv = new Float64Array((refined.length / 3) * 2);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0, k = 0; i + 2 < refined.length; i += 3, k += 2) {
    const [u, v] = curveLetterPoint(refined[i] - cx, -(refined[i + 2] - cz), curve, maxX - minX);
    uv[k] = u;
    uv[k + 1] = v;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const along = (h: number) => (options.mode === "raised"
    // Raised: from just under the surface to the depth over it. Cut in: from the depth under it to just over it.
    ? -SURFACE_TEXT_SINK + h * (options.depth + SURFACE_TEXT_SINK)
    : -options.depth + h * (options.depth + SURFACE_TEXT_OVERSHOOT));
  const out = new Array<number>(refined.length);
  const put = (i: number, u: number, v: number, w: number) => {
    out[i] = placement.origin.x + frame.u.x * u + frame.v.x * v + frame.w.x * w;
    out[i + 1] = placement.origin.y + frame.u.y * u + frame.v.y * v + frame.w.y * w;
    out[i + 2] = placement.origin.z + frame.u.z * u + frame.v.z * v + frame.w.z * w;
  };

  if (shape === "flat") {
    for (let i = 0, k = 0; i + 2 < refined.length; i += 3, k += 2) put(i, uv[k], uv[k + 1], along((refined[i + 1] - minY) / thickness));
    return { positions: out, offSurface: 0 };
  }

  if (shape === "wrap") {
    // The part cut across at heights up the letters; each slice's outline, walked from the spot.
    // Coordinates for the slicing: x = U, y = W, z = -V (so the axes keep their handedness).
    const moved = new Float32Array(target.length);
    for (let t = 0; t + 2 < target.length; t += 3) {
      const p = { x: target[t] - placement.origin.x, y: target[t + 1] - placement.origin.y, z: target[t + 2] - placement.origin.z };
      moved[t] = dot(p, frame.u);
      moved[t + 1] = dot(p, frame.w);
      moved[t + 2] = -dot(p, frame.v);
    }
    const body = weldTriangles(moved);
    let part: InstanceType<typeof runtime.Manifold>;
    try {
      part = new runtime.Manifold(new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(body.points.flat()), triVerts: new Uint32Array(body.triangles.flat()) }));
    } catch {
      throw new Error("Wrap around needs a closed part - use Make solid first, or choose Follow surface");
    }
    const levels: number[] = [];
    const contours: Array<Contour | null> = [];
    try {
      const count = Math.max(2, Math.min(80, Math.ceil((maxV - minV) / pieceLength) + 1));
      for (let j = 0; j < count; j += 1) {
        const level = minV + ((maxV - minV) * j) / (count - 1);
        const section = part.slice(-level);
        try {
          contours.push(wrapContour(section.toPolygons() as Array<Array<[number, number]>>));
        } finally {
          section.delete();
        }
        levels.push(level);
      }
    } finally {
      part.delete();
    }
    if (contours.every((contour) => !contour)) throw new Error("The text does not cross this part here - click on its side");
    let off = 0;
    for (let i = 0, k = 0; i + 2 < refined.length; i += 3, k += 2) {
      const u = uv[k], v = uv[k + 1];
      const f = levels.length > 1 ? Math.max(0, Math.min(levels.length - 1, ((v - levels[0]) / (levels[levels.length - 1] - levels[0] || 1)) * (levels.length - 1))) : 0;
      const j0 = Math.floor(f), j1 = Math.min(levels.length - 1, j0 + 1), tj = f - j0;
      const a = contours[j0] ?? contours[j1], b = contours[j1] ?? contours[j0];
      if (!a || !b) {
        off += 1;
        put(i, u, v, along((refined[i + 1] - minY) / thickness));
        continue;
      }
      if (Math.abs(u) > Math.min(a.perimeter, b.perimeter) / 2) off += 1;
      const pa = alongContour(a, u), pb = alongContour(b, u);
      const px = pa.p[0] + (pb.p[0] - pa.p[0]) * tj, py = pa.p[1] + (pb.p[1] - pa.p[1]) * tj;
      let nx = pa.n[0] + (pb.n[0] - pa.n[0]) * tj, ny = pa.n[1] + (pb.n[1] - pa.n[1]) * tj;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      const reach = along((refined[i + 1] - minY) / thickness);
      // Back to the world: (x, y) are (U, W) and the height is V.
      put(i, px + nx * reach, v, py + ny * reach);
    }
    return { positions: out, offSurface: refined.length ? off / (refined.length / 3) : 0 };
  }

  const halfU = Math.max(Math.abs(minU), Math.abs(maxU)) + 1;
  const halfV = Math.max(Math.abs(minV), Math.abs(maxV)) + 1;
  const field = surfaceHeightField(target, placement.origin, frame, { u: halfU, v: halfV }, pieceLength);
  // Fork (build 40): past an edge the letters fold over onto the next face, as a sticker would.
  let fold: FoldMesh | null | undefined;
  const startsOn = field.at(0, 0).on;
  const folded = (u: number, v: number): { point: Vec; normal: Vec } | null => {
    if (!startsOn) return null;
    if (fold === undefined) fold = foldMesh(target);
    if (!fold) return null;
    // The last point on the way out from the spot where the letters still sat on the surface.
    let lo = 0, hi = 1;
    for (let n = 0; n < 16; n += 1) {
      const mid = (lo + hi) / 2;
      if (field.at(u * mid, v * mid).on) lo = mid;
      else hi = mid;
    }
    const bu = u * lo, bv = v * lo;
    const edge = field.at(bu, bv);
    const at = { x: placement.origin.x + frame.u.x * bu + frame.v.x * bv + frame.w.x * edge.w, y: placement.origin.y + frame.u.y * bu + frame.v.y * bv + frame.w.y * edge.w, z: placement.origin.z + frame.u.z * bu + frame.v.z * bv + frame.w.z * edge.w };
    const under = triangleAt(fold, at, frame.w);
    if (!under) return null;
    const heading = { x: frame.u.x * u + frame.v.x * v, y: frame.u.y * u + frame.v.y * v, z: frame.u.z * u + frame.v.z * v };
    return walkOnSurface(fold, under.triangle, under.point, heading, (1 - lo) * Math.hypot(u, v));
  };
  const heights = new Map<string, { w: number; on: boolean; fold?: { point: Vec; normal: Vec } | null }>();
  let missing = 0;
  let points = 0;
  for (let i = 0, k = 0; i + 2 < refined.length; i += 3, k += 2) {
    const u = uv[k];
    const v = uv[k + 1];
    const key = `${u.toFixed(5)}_${v.toFixed(5)}`;
    let surface = heights.get(key);
    if (surface === undefined) {
      surface = field.at(u, v);
      if (!surface.on) surface = { ...surface, fold: folded(u, v) };
      heights.set(key, surface);
      points += 1;
      if (!surface.on && !surface.fold) missing += 1;
    }
    const lift = along((refined[i + 1] - minY) / thickness);
    if (surface.fold) {
      const { point, normal } = surface.fold;
      out[i] = point.x + normal.x * lift;
      out[i + 1] = point.y + normal.y * lift;
      out[i + 2] = point.z + normal.z * lift;
    } else {
      put(i, u, v, surface.w + lift);
    }
  }
  return { positions: out, offSurface: points ? missing / points : 0 };
}

/** The point of a triangle nearest to p (Ericson, Real-Time Collision Detection 5.1.5). */
function closestOnTriangle(p: Vec, a: Vec, b: Vec, c: Vec): Vec {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return { x: a.x + ab.x * (d1 / (d1 - d3)), y: a.y + ab.y * (d1 / (d1 - d3)), z: a.z + ab.z * (d1 / (d1 - d3)) };
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { x: a.x + ac.x * w, y: a.y + ac.y * w, z: a.z + ac.z * w };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return { x: b.x + (c.x - b.x) * w, y: b.y + (c.y - b.y) * w, z: b.z + (c.z - b.z) * w };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return { x: a.x + ab.x * v + ac.x * w, y: a.y + ab.y * v + ac.y * w, z: a.z + ab.z * v + ac.z * w };
}

/**
 * Fork (build 38): the spot on a part's surface nearest to p, with the surface's outward direction
 * there - where text moved with the ordinary tools is laid again. The direction is the average of
 * the faces around the spot (within a small radius), so a faceted curve gives a smooth answer.
 */
export function nearestSurfaceSpot(triangles: ArrayLike<number>, p: Vec): { point: Vec; normal: Vec; distance: number } | null {
  let best: Vec | null = null;
  let bestDistance = Infinity;
  const count = Math.floor(triangles.length / 9);
  const vertex = (t: number, k: number): Vec => ({ x: triangles[t * 9 + k * 3], y: triangles[t * 9 + k * 3 + 1], z: triangles[t * 9 + k * 3 + 2] });
  for (let t = 0; t < count; t += 1) {
    const q = closestOnTriangle(p, vertex(t, 0), vertex(t, 1), vertex(t, 2));
    const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = q;
    }
  }
  if (!best) return null;
  // The faces touching a small ball round the spot, weighted by area.
  const near = Math.max(0.05, bestDistance * 1e-3) + 0.5;
  let normal: Vec = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < count; t += 1) {
    const a = vertex(t, 0), b = vertex(t, 1), c = vertex(t, 2);
    const q = closestOnTriangle(best, a, b, c);
    if (Math.hypot(q.x - best.x, q.y - best.y, q.z - best.z) > near) continue;
    const n = cross(sub(b, a), sub(c, a));
    normal = { x: normal.x + n.x, y: normal.y + n.y, z: normal.z + n.z };
  }
  if (Math.hypot(normal.x, normal.y, normal.z) < 1e-12) return null;
  return { point: best, normal: norm(normal), distance: bestDistance };
}
