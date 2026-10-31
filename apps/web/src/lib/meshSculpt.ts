/**
 * Build 69: Sculpt - brushes that move the surface of a mesh (smooth, flatten, inflate, deflate),
 * and a brush that selects triangles so a patch can be deleted, smoothed or flattened in one go.
 *
 * Everything works on a welded copy of the part (shared corners), so a stroke moves the surface
 * without tearing it. A stroke is a path in page pixels; each corner in sight of the camera within the
 * brush of the path is moved, by less towards the edge of the brush.
 */
import { weldTriangles } from "@/lib/meshRepair";

export type SculptBrush = "smooth" | "flatten" | "inflate" | "deflate";
export type ScreenPoint = [number, number];

import { regionSmooth } from "@/lib/regionSmooth";

export type SculptMesh = {
  /** Corner positions, x y z each. */
  points: Float64Array;
  /** Corner numbers, three a triangle. */
  triangles: Uint32Array;
  /** Neighbouring corners: those of corner i are `around[aroundStart[i] .. aroundStart[i + 1])`. */
  aroundStart: Int32Array;
  around: Int32Array;
  /** The triangles at each corner: those of corner i are `fan[fanStart[i] .. fanStart[i + 1])`. */
  fanStart: Int32Array;
  fan: Int32Array;
};

/** The welded copy of a triangle soup (world positions, 9 numbers a triangle). */
export function sculptMeshOf(positions: ArrayLike<number>): SculptMesh {
  const welded = weldTriangles(positions);
  const points = new Float64Array(welded.points.length * 3);
  welded.points.forEach((p, i) => { points[i * 3] = p[0]; points[i * 3 + 1] = p[1]; points[i * 3 + 2] = p[2]; });
  const triangles = new Uint32Array(welded.triangles.length * 3);
  welded.triangles.forEach((tri, i) => { triangles[i * 3] = tri[0]; triangles[i * 3 + 1] = tri[1]; triangles[i * 3 + 2] = tri[2]; });
  const n = welded.points.length;
  // Each triangle links its three corners both ways; duplicates removed per corner.
  const count = new Int32Array(n + 1);
  for (let k = 0; k < triangles.length; k += 1) count[triangles[k] + 1] += 2;
  for (let i = 0; i < n; i += 1) count[i + 1] += count[i];
  const raw = new Int32Array(count[n]);
  const fill = count.slice(0, n);
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = triangles[t + k], b = triangles[t + ((k + 1) % 3)], c = triangles[t + ((k + 2) % 3)];
      raw[fill[a]++] = b;
      raw[fill[a]++] = c;
    }
  }
  const aroundStart = new Int32Array(n + 1);
  const around: number[] = [];
  for (let i = 0; i < n; i += 1) {
    aroundStart[i] = around.length;
    const seen = new Set<number>();
    for (let k = count[i]; k < count[i + 1]; k += 1) if (!seen.has(raw[k])) { seen.add(raw[k]); around.push(raw[k]); }
  }
  aroundStart[n] = around.length;
  const fanStart = new Int32Array(n + 1);
  for (let k = 0; k < triangles.length; k += 1) fanStart[triangles[k] + 1] += 1;
  for (let i = 0; i < n; i += 1) fanStart[i + 1] += fanStart[i];
  const fan = new Int32Array(triangles.length);
  const at = fanStart.slice(0, n);
  for (let k = 0; k < triangles.length; k += 1) fan[at[triangles[k]]++] = Math.floor(k / 3);
  return { points, triangles, aroundStart, around: Int32Array.from(around), fanStart, fan };
}

/** The mesh back as a triangle soup. */
export function soupOf(mesh: SculptMesh): number[] {
  const out = new Array<number>(mesh.triangles.length * 3);
  for (let k = 0; k < mesh.triangles.length; k += 1) {
    const p = mesh.triangles[k] * 3;
    out[k * 3] = mesh.points[p];
    out[k * 3 + 1] = mesh.points[p + 1];
    out[k * 3 + 2] = mesh.points[p + 2];
  }
  return out;
}

/** The mesh as a triangle soup in a typed array (reusing `out` when it is the right size), for drawing. */
export function soupFloat32(mesh: SculptMesh, out?: Float32Array): Float32Array {
  const target = out && out.length === mesh.triangles.length * 3 ? out : new Float32Array(mesh.triangles.length * 3);
  for (let k = 0; k < mesh.triangles.length; k += 1) {
    const p = mesh.triangles[k] * 3;
    target[k * 3] = mesh.points[p];
    target[k * 3 + 1] = mesh.points[p + 1];
    target[k * 3 + 2] = mesh.points[p + 2];
  }
  return target;
}

/**
 * What the camera at `eye` sees under the brush: a small depth buffer (a cell every `cell` px) over the
 * box, filled with the distance to the nearest surface, from every triangle that reaches into the box.
 * Anything farther than that, by more than a little, is hidden behind it. This, not which way a
 * triangle faces, decides what a brush touches - an open scan is drawn from both sides, so its inside
 * is as much "the surface you see" as its outside.
 */
export function viewDepth(mesh: SculptMesh, projected: ArrayLike<number>, eye: [number, number, number], box: { minX: number; minY: number; maxX: number; maxY: number }, cell = 2) {
  const { points, triangles } = mesh;
  const n = points.length / 3;
  const width = Math.max(1, Math.ceil((box.maxX - box.minX) / cell) + 1);
  const height = Math.max(1, Math.ceil((box.maxY - box.minY) / cell) + 1);
  const grid = new Float32Array(width * height).fill(Infinity);
  // Distances worked out only for the corners of triangles that reach the box.
  const distance = new Float32Array(n).fill(-1);
  const far = (i: number) => {
    if (distance[i] < 0) distance[i] = Math.hypot(points[i * 3] - eye[0], points[i * 3 + 1] - eye[1], points[i * 3 + 2] - eye[2]);
    return distance[i];
  };
  let world = 0, screen = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    const ax = projected[a * 2], ay = projected[a * 2 + 1], bx = projected[b * 2], by = projected[b * 2 + 1], cx = projected[c * 2], cy = projected[c * 2 + 1];
    const lo = Math.min(ax, bx, cx), hi = Math.max(ax, bx, cx), top = Math.min(ay, by, cy), bottom = Math.max(ay, by, cy);
    if (hi < box.minX || lo > box.maxX || bottom < box.minY || top > box.maxY) continue;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue;
    world += Math.hypot(points[a * 3] - points[b * 3], points[a * 3 + 1] - points[b * 3 + 1], points[a * 3 + 2] - points[b * 3 + 2]);
    screen += Math.hypot(ax - bx, ay - by);
    const x0 = Math.max(0, Math.floor((lo - box.minX) / cell)), x1 = Math.min(width - 1, Math.ceil((hi - box.minX) / cell));
    const y0 = Math.max(0, Math.floor((top - box.minY) / cell)), y1 = Math.min(height - 1, Math.ceil((bottom - box.minY) / cell));
    const da = far(a), db = far(b), dc = far(c);
    for (let gy = y0; gy <= y1; gy += 1) {
      const py = box.minY + gy * cell;
      for (let gx = x0; gx <= x1; gx += 1) {
        const px = box.minX + gx * cell;
        const u = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const v = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        const w = 1 - u - v;
        if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
        const d = u * da + v * db + w * dc;
        const k = gy * width + gx;
        if (d < grid[k]) grid[k] = d;
      }
    }
  }
  // A surface a few cells deep at the steepest still counts as the one in front.
  const tolerance = (screen > 0 ? world / screen : 0) * cell * 4 + 1e-3;
  /** The nearest surface round (x, y): the least of the cell and its neighbours. */
  const nearest = (x: number, y: number) => {
    const gx = Math.round((x - box.minX) / cell), gy = Math.round((y - box.minY) / cell);
    let best = Infinity;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const qx = gx + ox, qy = gy + oy;
      if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
      if (grid[qy * width + qx] < best) best = grid[qy * width + qx];
    }
    return best;
  };
  return {
    distance: far,
    /** Whether a point at screen (x, y), `d` from the eye, is on the surface in front. */
    seen: (x: number, y: number, d: number) => d <= nearest(x, y) + tolerance,
  };
}

/** The box (page pixels) a brush of `radius` px along `path` covers. */
function pathBox(path: ScreenPoint[], radius: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of path) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minX: minX - radius, minY: minY - radius, maxX: maxX + radius, maxY: maxY + radius };
}

/**
 * The Select brush: chooses (`add`) or lets go of the triangles the camera at `eye` sees whose middle
 * on screen is within `radius` px of the path. `projected` is x/y page pixels per corner.
 */
/**
 * Build 71: which surface the Select brush reaches, as Meshmixer offers - "front" the surface you see
 * (the default), "back" the side facing away from you at any depth (the underside of a scan, the far
 * wall of a tooth), "through" every layer under the brush.
 */
export type SelectReach = "front" | "back" | "through";

export function brushChoice(mesh: SculptMesh, projected: ArrayLike<number>, eye: [number, number, number], path: ScreenPoint[], radius: number, chosen: Uint8Array, add: boolean, reach: SelectReach = "front"): number {
  const { triangles, points } = mesh;
  if (!path.length) return 0;
  const box = pathBox(path, radius);
  const { minX, minY, maxX, maxY } = box;
  const view = reach === "front" ? viewDepth(mesh, projected, eye, box) : null;
  const r2 = radius * radius;
  let changed = 0;
  for (let t = 0; t < chosen.length; t += 1) {
    if (Boolean(chosen[t]) === add) continue;
    const a = triangles[t * 3], b = triangles[t * 3 + 1], c = triangles[t * 3 + 2];
    const x = (projected[a * 2] + projected[b * 2] + projected[c * 2]) / 3;
    const y = (projected[a * 2 + 1] + projected[b * 2 + 1] + projected[c * 2 + 1]) / 3;
    if (!(x >= minX && x <= maxX && y >= minY && y <= maxY)) continue;
    if (pathDistance2(x, y, path) > r2) continue;
    if (view && !view.seen(x, y, (view.distance(a) + view.distance(b) + view.distance(c)) / 3)) continue;
    if (reach === "back") {
      const ax = points[a * 3], ay = points[a * 3 + 1], az = points[a * 3 + 2];
      const ux = points[b * 3] - ax, uy = points[b * 3 + 1] - ay, uz = points[b * 3 + 2] - az;
      const vx = points[c * 3] - ax, vy = points[c * 3 + 1] - ay, vz = points[c * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * (eye[0] - ax) + ny * (eye[1] - ay) + nz * (eye[2] - az) >= 0) continue;
    }
    chosen[t] = add ? 1 : 0;
    changed += 1;
  }
  return changed;
}

/**
 * Build 82: whether points fall inside a closed screen loop (page pixels), the loop filled once into a
 * one-pixel mask by scanlines (even-odd), so each point is a lookup - quick for a 300,000-triangle scan.
 */
export function loopMask(loop: ScreenPoint[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of loop) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const x0 = Math.floor(minX), y0 = Math.floor(minY);
  const width = Math.max(1, Math.ceil(maxX) - x0 + 1), height = Math.max(1, Math.ceil(maxY) - y0 + 1);
  const mask = new Uint8Array(width * height);
  const n = loop.length;
  if (n >= 3) {
    const crossings: number[] = [];
    for (let row = 0; row < height; row += 1) {
      const y = y0 + row + 0.5;
      crossings.length = 0;
      for (let k = 0; k < n; k += 1) {
        const [ax, ay] = loop[k], [bx, by] = loop[(k + 1) % n];
        if ((ay <= y) !== (by <= y)) crossings.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil(crossings[k] - x0 - 0.5)), to = Math.min(width - 1, Math.floor(crossings[k + 1] - x0 - 0.5));
        for (let col = from; col <= to; col += 1) mask[row * width + col] = 1;
      }
    }
  }
  return {
    box: { minX, minY, maxX, maxY },
    inside: (x: number, y: number) => {
      const col = Math.floor(x) - x0, row = Math.floor(y) - y0;
      return col >= 0 && row >= 0 && col < width && row < height && mask[row * width + col] === 1;
    },
  };
}

/** Build 82: what a lasso does to the selection - Meshmixer's: a new lasso replaces it, Shift adds, Ctrl takes away. */
export type LassoMode = "replace" | "add" | "remove";

/**
 * Build 82: Meshmixer's screen-space lasso. The triangles whose three corners all fall inside the
 * closed `loop` (page pixels; `projected` is x/y per corner) are chosen or let go, as `mode` says;
 * `reach` decides which surface counts, as for the Select brush. Returns how many changed.
 */
export function lassoChoice(mesh: SculptMesh, projected: ArrayLike<number>, eye: [number, number, number], loop: ScreenPoint[], chosen: Uint8Array, mode: LassoMode, reach: SelectReach = "front"): number {
  const { triangles, points } = mesh;
  let changed = 0;
  if (mode === "replace") for (let t = 0; t < chosen.length; t += 1) if (chosen[t]) { chosen[t] = 0; changed += 1; }
  if (loop.length < 3) return changed;
  const lasso = loopMask(loop);
  const n = points.length / 3;
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) if (lasso.inside(projected[i * 2], projected[i * 2 + 1])) inside[i] = 1;
  const view = reach === "front" ? viewDepth(mesh, projected, eye, lasso.box) : null;
  const add = mode !== "remove";
  for (let t = 0; t < chosen.length; t += 1) {
    if (Boolean(chosen[t]) === add) continue;
    const a = triangles[t * 3], b = triangles[t * 3 + 1], c = triangles[t * 3 + 2];
    if (!inside[a] || !inside[b] || !inside[c]) continue;
    if (view) {
      const x = (projected[a * 2] + projected[b * 2] + projected[c * 2]) / 3;
      const y = (projected[a * 2 + 1] + projected[b * 2 + 1] + projected[c * 2 + 1]) / 3;
      if (!view.seen(x, y, (view.distance(a) + view.distance(b) + view.distance(c)) / 3)) continue;
    }
    if (reach === "back") {
      const ax = points[a * 3], ay = points[a * 3 + 1], az = points[a * 3 + 2];
      const ux = points[b * 3] - ax, uy = points[b * 3 + 1] - ay, uz = points[b * 3 + 2] - az;
      const vx = points[c * 3] - ax, vy = points[c * 3 + 1] - ay, vz = points[c * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * (eye[0] - ax) + ny * (eye[1] - ay) + nz * (eye[2] - az) >= 0) continue;
    }
    chosen[t] = add ? 1 : 0;
    changed += 1;
  }
  return changed;
}

/** Area-weighted normal at every corner, of unit length. */
export function cornerNormals(mesh: SculptMesh): Float64Array {
  const { points, triangles } = mesh;
  const normals = new Float64Array(points.length);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
    const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2];
    const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const p of [a, b, c]) { normals[p] += nx; normals[p + 1] += ny; normals[p + 2] += nz; }
  }
  for (let p = 0; p < normals.length; p += 3) {
    const length = Math.hypot(normals[p], normals[p + 1], normals[p + 2]) || 1;
    normals[p] /= length; normals[p + 1] /= length; normals[p + 2] /= length;
  }
  return normals;
}

/** Unit normals at the weighted corners only (zero elsewhere): the fast way for a brush on a big mesh. */
function weightedNormals(mesh: SculptMesh, weights: Float32Array): Float64Array {
  const { points, triangles, fanStart, fan } = mesh;
  const normals = new Float64Array(points.length);
  for (let i = 0; i < weights.length; i += 1) {
    if (!weights[i]) continue;
    let x = 0, y = 0, z = 0;
    for (let k = fanStart[i]; k < fanStart[i + 1]; k += 1) {
      const t = fan[k] * 3;
      const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
      const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2];
      const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2];
      x += uy * vz - uz * vy; y += uz * vx - ux * vz; z += ux * vy - uy * vx;
    }
    const length = Math.hypot(x, y, z) || 1;
    normals[i * 3] = x / length; normals[i * 3 + 1] = y / length; normals[i * 3 + 2] = z / length;
  }
  return normals;
}

/** Points flat (x y z each) for projecting the corners onto the screen. */
export function cornerPositions(mesh: SculptMesh): Float32Array {
  return Float32Array.from(mesh.points);
}

/** Squared distance from (x, y) to the path, in pixels. */
function pathDistance2(x: number, y: number, path: ScreenPoint[]) {
  let best = Infinity;
  for (let k = 0; k < path.length; k += 1) {
    const [ax, ay] = path[k], [bx, by] = path[Math.min(path.length - 1, k + 1)];
    const dx = bx - ax, dy = by - ay;
    const s = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const ex = x - ax - dx * s, ey = y - ay - dy * s;
    const d2 = ex * ex + ey * ey;
    if (d2 < best) best = d2;
  }
  return best;
}

/**
 * How much each corner is moved by a stroke (0 to `strength`): the corners the camera at `eye` sees
 * (viewDepth) within `radius` px of the path, falling off smoothly to nothing at the edge of the brush.
 * `projected` is x/y page pixels per corner.
 */
export function strokeWeights(mesh: SculptMesh, projected: ArrayLike<number>, eye: [number, number, number], path: ScreenPoint[], radius: number, strength: number): Float32Array {
  const n = mesh.points.length / 3;
  const weights = new Float32Array(n);
  if (!path.length || radius <= 0) return weights;
  const box = pathBox(path, radius);
  const view = viewDepth(mesh, projected, eye, box);
  const r2 = radius * radius;
  for (let i = 0; i < n; i += 1) {
    const x = projected[i * 2], y = projected[i * 2 + 1];
    if (!(x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY)) continue;
    const d2 = pathDistance2(x, y, path);
    if (d2 >= r2) continue;
    if (!view.seen(x, y, view.distance(i))) continue;
    const s = 1 - d2 / r2;
    weights[i] = strength * s * s;
  }
  // Two rings round the corners in sight get a share too, falling off, so a brush that reaches the
  // edge of what is seen (a tooth's side, the rim of a scan) fades out there instead of tearing a step.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = weights.slice();
    for (let i = 0; i < n; i += 1) {
      const start = mesh.aroundStart[i], end = mesh.aroundStart[i + 1];
      if (end === start) continue;
      let sum = 0;
      for (let k = start; k < end; k += 1) sum += weights[mesh.around[k]];
      const share = (sum / (end - start)) * 0.5;
      if (share > next[i]) next[i] = share;
    }
    weights.set(next);
  }
  return weights;
}

/** Millimetres per screen pixel round the moved corners: their edges' length in the world over on screen. */
export function millimetresPerPixel(mesh: SculptMesh, projected: ArrayLike<number>, weights: Float32Array): number {
  let world = 0, screen = 0;
  for (let i = 0; i < weights.length; i += 1) {
    if (!weights[i]) continue;
    for (let k = mesh.aroundStart[i]; k < mesh.aroundStart[i + 1]; k += 1) {
      const j = mesh.around[k];
      world += Math.hypot(mesh.points[i * 3] - mesh.points[j * 3], mesh.points[i * 3 + 1] - mesh.points[j * 3 + 1], mesh.points[i * 3 + 2] - mesh.points[j * 3 + 2]);
      screen += Math.hypot(projected[i * 2] - projected[j * 2], projected[i * 2 + 1] - projected[j * 2 + 1]);
    }
  }
  return screen > 0 ? world / screen : 0;
}

/** Laplacian smoothing of the weighted corners, a few passes. */
function smooth(mesh: SculptMesh, weights: Float32Array, passes: number) {
  const { points, aroundStart, around } = mesh;
  const moving: number[] = [];
  for (let i = 0; i < weights.length; i += 1) if (weights[i] > 0) moving.push(i);
  const next = new Float64Array(moving.length * 3);
  for (let pass = 0; pass < passes; pass += 1) {
    moving.forEach((i, m) => {
      const start = aroundStart[i], end = aroundStart[i + 1];
      if (end === start) { next[m * 3] = points[i * 3]; next[m * 3 + 1] = points[i * 3 + 1]; next[m * 3 + 2] = points[i * 3 + 2]; return; }
      let x = 0, y = 0, z = 0;
      for (let k = start; k < end; k += 1) { const j = around[k] * 3; x += points[j]; y += points[j + 1]; z += points[j + 2]; }
      const count = end - start, w = Math.min(1, weights[i]);
      next[m * 3] = points[i * 3] + (x / count - points[i * 3]) * w;
      next[m * 3 + 1] = points[i * 3 + 1] + (y / count - points[i * 3 + 1]) * w;
      next[m * 3 + 2] = points[i * 3 + 2] + (z / count - points[i * 3 + 2]) * w;
    });
    moving.forEach((i, m) => { points[i * 3] = next[m * 3]; points[i * 3 + 1] = next[m * 3 + 1]; points[i * 3 + 2] = next[m * 3 + 2]; });
  }
  return moving.length;
}

/** Pulls the weighted corners onto the plane that best fits them. */
function flatten(mesh: SculptMesh, weights: Float32Array) {
  const { points } = mesh;
  const normals = weightedNormals(mesh, weights);
  let total = 0, cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0, moved = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const w = weights[i];
    if (!w) continue;
    total += w;
    cx += points[i * 3] * w; cy += points[i * 3 + 1] * w; cz += points[i * 3 + 2] * w;
    nx += normals[i * 3] * w; ny += normals[i * 3 + 1] * w; nz += normals[i * 3 + 2] * w;
  }
  const length = Math.hypot(nx, ny, nz);
  if (!total || !length) return 0;
  cx /= total; cy /= total; cz /= total; nx /= length; ny /= length; nz /= length;
  for (let i = 0; i < weights.length; i += 1) {
    const w = Math.min(1, weights[i]);
    if (!w) continue;
    const d = (points[i * 3] - cx) * nx + (points[i * 3 + 1] - cy) * ny + (points[i * 3 + 2] - cz) * nz;
    points[i * 3] -= d * nx * w; points[i * 3 + 1] -= d * ny * w; points[i * 3 + 2] -= d * nz * w;
    moved += 1;
  }
  return moved;
}

/** Moves the weighted corners along their normals, out (`step` > 0) or in, by up to `step` mm. */
function push(mesh: SculptMesh, weights: Float32Array, step: number) {
  const { points } = mesh;
  const normals = weightedNormals(mesh, weights);
  let moved = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const w = weights[i];
    if (!w) continue;
    points[i * 3] += normals[i * 3] * step * w;
    points[i * 3 + 1] += normals[i * 3 + 1] * step * w;
    points[i * 3 + 2] += normals[i * 3 + 2] * step * w;
    moved += 1;
  }
  // A smooth after, so the bump has no spikes or ridges where the triangles are uneven.
  smooth(mesh, weights.map((w) => Math.min(1, w * 0.6)), 2);
  return moved;
}

/** The average length of the edges round the weighted corners, in mm. */
export function averageEdge(mesh: SculptMesh, weights: Float32Array): number {
  let total = 0, count = 0;
  for (let i = 0; i < weights.length; i += 1) {
    if (!weights[i]) continue;
    for (let k = mesh.aroundStart[i]; k < mesh.aroundStart[i + 1]; k += 1) {
      const j = mesh.around[k];
      total += Math.hypot(mesh.points[i * 3] - mesh.points[j * 3], mesh.points[i * 3 + 1] - mesh.points[j * 3 + 1], mesh.points[i * 3 + 2] - mesh.points[j * 3 + 2]);
      count += 1;
    }
  }
  return count ? total / count : 0;
}

/**
 * How many smoothing passes even out bumps the size of the brush: smoothing spreads about one edge
 * further each pass and as the square root of the passes, so a brush `radius` mm wide on edges `edge`
 * mm long needs about (radius / edge)² of them at full strength.
 */
export function smoothingPasses(radius: number, edge: number, strength: number): number {
  if (!(edge > 0) || !(radius > 0)) return 3;
  return Math.max(3, Math.min(400, Math.round(strength * 0.5 * (radius / edge) ** 2)));
}

/**
 * One brush on the weighted corners (changes `mesh`). `step` is how far Inflate and Deflate move at
 * full weight, in mm; `passes` how many times Smooth evens the surface out. Returns how many corners moved.
 */
export function applyBrush(mesh: SculptMesh, brush: SculptBrush, weights: Float32Array, step: number, passes = 3): number {
  if (brush === "smooth") {
    // Every pass at full weight inside the brush, falling off towards its edge.
    const w = weights.map((value) => (value > 0 ? Math.min(1, value * 2) : 0));
    return smooth(mesh, w, passes);
  }
  if (brush === "flatten") return flatten(mesh, weights);
  return push(mesh, weights, brush === "inflate" ? step : -step);
}

/** Full weight on every corner of the chosen triangles (soup order is the mesh's triangle order). */
export function selectedCornerWeights(mesh: SculptMesh, chosen: Uint8Array): Float32Array {
  const weights = new Float32Array(mesh.points.length / 3);
  for (let t = 0; t < chosen.length; t += 1) if (chosen[t]) for (let k = 0; k < 3; k += 1) weights[mesh.triangles[t * 3 + k]] = 1;
  return weights;
}

/** Smooths or flattens the chosen triangles as a whole. */
export function applyToSelection(mesh: SculptMesh, chosen: Uint8Array, action: "smooth" | "flatten"): number {
  const weights = selectedCornerWeights(mesh, chosen);
  // Corners on the edge of the patch keep it joined to the rest: they move half as far.
  for (let t = 0; t < chosen.length; t += 1) {
    if (chosen[t]) continue;
    for (let k = 0; k < 3; k += 1) { const i = mesh.triangles[t * 3 + k]; if (weights[i] === 1) weights[i] = 0.5; }
  }
  // Build 105: Smooth as a shape-preserving region smooth (geometry3Sharp's RegionSmooth): the border
  // stays exactly where it is and two rings inside it ease the join, the inside becomes the smoothest
  // surface spanning it - a bumpy patch evens out, a base rounds off - instead of 8 shrinking passes.
  if (action === "smooth") { const moved = regionSmooth(mesh.points, mesh.triangles, chosen, { rings: 2 }); return moved || smooth(mesh, weights, 8); }
  return flatten(mesh, weights);
}

/** The soup without the chosen triangles. */
export function withoutTriangles(positions: ArrayLike<number>, chosen: Uint8Array): number[] {
  const out: number[] = [];
  for (let t = 0; t * 9 < positions.length; t += 1) if (!chosen[t]) for (let k = 0; k < 9; k += 1) out.push(positions[t * 9 + k]);
  return out;
}

/** Every triangle not chosen is chosen, and the other way round. */
export function invertChoice(chosen: Uint8Array): Uint8Array {
  return chosen.map((value) => (value ? 0 : 1));
}

/** Grows the choice by one ring of neighbouring triangles (those sharing a corner). */
export function growChoice(mesh: SculptMesh, chosen: Uint8Array): Uint8Array {
  const corner = selectedCornerWeights(mesh, chosen);
  const out = chosen.slice();
  for (let t = 0; t < chosen.length; t += 1) {
    if (out[t]) continue;
    if (corner[mesh.triangles[t * 3]] || corner[mesh.triangles[t * 3 + 1]] || corner[mesh.triangles[t * 3 + 2]]) out[t] = 1;
  }
  return out;
}
