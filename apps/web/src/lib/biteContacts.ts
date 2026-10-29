/**
 * Build 84: the bite contacts & clearance map - for every point of one arch, its signed distance to
 * the other arch's surface in the scanned bite. Negative is overlap (the scans run into each other:
 * the printed models would hold each other open there), positive is clearance. It is a distance, not
 * a pressure: a scan has no force in it (see the guide).
 *
 * Build 96: coloured the way the intraoral scanner programs show it (Medit's occlusion analysis,
 * 3Shape's occlusal map), so what is seen here can be held up against the scanner's screen: a smooth
 * scale from green 2 mm away through yellow and orange to red at contact, blue going to purple where
 * the scans overlap, and the scan's own colour beyond 2 mm. "Contact only" keeps just the contacts
 * (closer than 0.10 mm) and the overlaps.
 */

/** The colour scale's stops: distance (mm) and colour, overlap below 0. */
export const CONTACT_STOPS: Array<{ at: number; color: string }> = [
  { at: -0.2, color: "#7a1fd6" },
  { at: -0.0001, color: "#2f6bff" },
  { at: 0, color: "#e0201b" },
  { at: 0.5, color: "#f5821f" },
  { at: 1.0, color: "#f2df1b" },
  { at: 1.4, color: "#a5d62a" },
  { at: 2.0, color: "#17b51c" },
];
/** How far from the other arch a point is still coloured (mm). */
export const CONTACT_REACH = 2;
/** Closer than this counts as a contact ("Contact only"). */
export const CONTACT_ONLY = 0.1;
/** Within this the distance is measured to the nearest point of a triangle; further out to the nearest corner. */
const EXACT_REACH = 0.25;
/** The scale's marks for its key (mm). */
export const CONTACT_TICKS = [2, 1.5, 1, 0.5, 0, -0.2];

const hexRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const STOP_RGB = CONTACT_STOPS.map((stop) => hexRgb(stop.color));

/** The scale's colour at a distance (r, g, b in 0..1), or null where it is not coloured. */
export function contactColor(distance: number, contactOnly = false): [number, number, number] | null {
  if (!Number.isFinite(distance) || distance > CONTACT_REACH) return null;
  if (contactOnly && distance >= CONTACT_ONLY) return null;
  if (distance <= CONTACT_STOPS[0].at) return STOP_RGB[0];
  for (let i = 1; i < CONTACT_STOPS.length; i += 1) {
    const lo = CONTACT_STOPS[i - 1], hi = CONTACT_STOPS[i];
    if (distance <= hi.at) {
      // Overlap and clearance do not blend across 0: the sign changes the colour family.
      if (lo.at < 0 && hi.at >= 0) return STOP_RGB[i];
      const k = (distance - lo.at) / (hi.at - lo.at);
      return [0, 1, 2].map((j) => STOP_RGB[i - 1][j] + (STOP_RGB[i][j] - STOP_RGB[i - 1][j]) * k) as [number, number, number];
    }
  }
  return STOP_RGB[STOP_RGB.length - 1];
}

/** The scale as a CSS gradient, from `from` mm (top) to `to` mm (bottom). */
export function contactGradient(from = CONTACT_REACH, to = CONTACT_STOPS[0].at): string {
  const span = from - to;
  const stops = [...CONTACT_STOPS].reverse().map((stop) => `${stop.color} ${(((from - stop.at) / span) * 100).toFixed(1)}%`);
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

/** Squared distance from p to triangle abc, and the closest point's parameters (Ericson 5.1.5). */
function closestOnTriangle(px: number, py: number, pz: number, t: ArrayLike<number>, o: number, out: Float64Array): number {
  const ax = t[o], ay = t[o + 1], az = t[o + 2], bx = t[o + 3], by = t[o + 4], bz = t[o + 5], cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; }
      else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w; }
            else { const denom = 1 / (va + vb + vc); const v = vb * denom, w = vc * denom; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
          }
        }
      }
    }
  }
  out[0] = qx; out[1] = qy; out[2] = qz;
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/**
 * The signed distance from every corner of `from` (a triangle soup, 9 numbers a triangle) to the
 * surface of `to`, within `reach` mm; NaN where nothing of `to` is that near. The sign is the side of
 * `to`'s nearest triangle: positive on the side its normal points to. If most nearby points come out
 * negative, `to` is wound inside out (some scanners save it so) and the signs are turned round.
 */
export function signedDistances(from: ArrayLike<number>, to: ArrayLike<number>, reachAll = CONTACT_REACH): Float32Array {
  // Build 96: near the other arch (where contacts are read) the nearest triangle, exactly; further out
  // (the scale's broad colours) the nearest corner of the other scan, below.
  const reach = Math.min(reachAll, EXACT_REACH);
  const corners = from.length / 3;
  const out = new Float32Array(corners).fill(Number.NaN);
  const count = Math.floor(to.length / 9);
  if (!count || !corners) return out;
  // The target's triangles in a grid of cells `cell` mm across, each in every cell its box touches.
  const cell = Math.max(0.25, reach * 2);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < to.length; i += 3) {
    minX = Math.min(minX, to[i]); maxX = Math.max(maxX, to[i]);
    minY = Math.min(minY, to[i + 1]); maxY = Math.max(maxY, to[i + 1]);
    minZ = Math.min(minZ, to[i + 2]); maxZ = Math.max(maxZ, to[i + 2]);
  }
  const key = (ix: number, iy: number, iz: number) => (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
  const cells = new Map<number, number[]>();
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    const x0 = Math.floor((Math.min(to[o], to[o + 3], to[o + 6]) - reach) / cell), x1 = Math.floor((Math.max(to[o], to[o + 3], to[o + 6]) + reach) / cell);
    const y0 = Math.floor((Math.min(to[o + 1], to[o + 4], to[o + 7]) - reach) / cell), y1 = Math.floor((Math.max(to[o + 1], to[o + 4], to[o + 7]) + reach) / cell);
    const z0 = Math.floor((Math.min(to[o + 2], to[o + 5], to[o + 8]) - reach) / cell), z1 = Math.floor((Math.max(to[o + 2], to[o + 5], to[o + 8]) + reach) / cell);
    for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) for (let iz = z0; iz <= z1; iz += 1) {
      const k = key(ix, iy, iz);
      const list = cells.get(k);
      if (list) list.push(t); else cells.set(k, [t]);
    }
  }
  const q = new Float64Array(3);
  const r2 = reach * reach;
  let positive = 0, negative = 0;
  for (let c = 0; c < corners; c += 1) {
    const px = from[c * 3], py = from[c * 3 + 1], pz = from[c * 3 + 2];
    if (px < minX - reach || px > maxX + reach || py < minY - reach || py > maxY + reach || pz < minZ - reach || pz > maxZ + reach) continue;
    const list = cells.get(key(Math.floor(px / cell), Math.floor(py / cell), Math.floor(pz / cell)));
    if (!list) continue;
    let best = r2, bestT = -1, bx = 0, by = 0, bz = 0;
    for (const t of list) {
      const d2 = closestOnTriangle(px, py, pz, to, t * 9, q);
      if (d2 < best) { best = d2; bestT = t; bx = q[0]; by = q[1]; bz = q[2]; }
    }
    if (bestT < 0) continue;
    const o = bestT * 9;
    const ux = to[o + 3] - to[o], uy = to[o + 4] - to[o + 1], uz = to[o + 5] - to[o + 2];
    const vx = to[o + 6] - to[o], vy = to[o + 7] - to[o + 1], vz = to[o + 8] - to[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const side = (px - bx) * nx + (py - by) * ny + (pz - bz) * nz;
    const d = Math.sqrt(best);
    out[c] = side < 0 ? -d : d;
    if (d > 0.05) { if (side < 0) negative += 1; else positive += 1; }
  }
  const flip = negative > positive;
  if (flip) for (let c = 0; c < corners; c += 1) out[c] = -out[c];
  if (reachAll > reach) farDistances(from, to, reachAll, out, flip);
  return out;
}

/**
 * Build 96: the distance from each corner still unmeasured to the nearest corner of `to`, within
 * `reach` - on a scan (corners a few tenths of a millimetre apart) within about 0.1 mm of the surface
 * distance, which the broad colours of the scale do not show. The corners of `to` (one per point - the
 * soup repeats them) are kept in a k-d tree. The sign is the side of the corner's triangle (turned
 * round with `flip`); a point counts as overlap only when it lies well behind that surface and less
 * than 0.6 mm deep - deeper "overlap" this far out is a scan's edge or the far side of a tooth.
 */
function farDistances(from: ArrayLike<number>, to: ArrayLike<number>, reach: number, out: Float32Array, flip: boolean) {
  const count = Math.floor(to.length / 9);
  const index = new Map<number, number>();
  const pts: number[] = [];
  const nrm: number[] = [];
  const q = (v: number) => Math.round(v * 250) + 65536;
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    const ux = to[o + 3] - to[o], uy = to[o + 4] - to[o + 1], uz = to[o + 5] - to[o + 2];
    const vx = to[o + 6] - to[o], vy = to[o + 7] - to[o + 1], vz = to[o + 8] - to[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (!(Math.hypot(nx, ny, nz) > 0)) continue;
    for (let k = 0; k < 3; k += 1) {
      const x = to[o + k * 3], y = to[o + k * 3 + 1], z = to[o + k * 3 + 2];
      const id = (q(x) * 131072 + q(y)) * 131072 + q(z);
      const at = index.get(id);
      // The corner's normal: the sum of its triangles' (area-weighted).
      if (at !== undefined) { nrm[at * 3] += nx; nrm[at * 3 + 1] += ny; nrm[at * 3 + 2] += nz; continue; }
      index.set(id, pts.length / 3);
      pts.push(x, y, z);
      nrm.push(nx, ny, nz);
    }
  }
  const n = pts.length / 3;
  if (!n) return;
  const P = Float64Array.from(pts);
  const tree = new KdTree(P);
  const r2 = reach * reach;
  const found = { i: -1, d2: 0 };
  // The soup repeats each point at every triangle round it: each point is looked up once.
  const done = new Map<number, number>();
  for (let c = 0; c < out.length; c += 1) {
    if (Number.isFinite(out[c])) continue;
    const px = from[c * 3], py = from[c * 3 + 1], pz = from[c * 3 + 2];
    const id = (q(px) * 131072 + q(py)) * 131072 + q(pz);
    const known = done.get(id);
    if (known !== undefined) { out[c] = known; continue; }
    tree.nearest(px, py, pz, r2, found);
    if (found.i < 0) { done.set(id, Number.NaN); continue; }
    const i = found.i;
    const d = Math.sqrt(found.d2);
    const nl = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    const cos = ((px - P[i * 3]) * nrm[i * 3] + (py - P[i * 3 + 1]) * nrm[i * 3 + 1] + (pz - P[i * 3 + 2]) * nrm[i * 3 + 2]) / (nl * (d || 1));
    const behind = (flip ? -cos : cos) < -0.7 && d < 0.6;
    out[c] = behind ? -d : d;
    done.set(id, out[c]);
  }
}

/** A static k-d tree over points (x, y, z, ...), for the nearest point within a distance. */
class KdTree {
  private readonly order: Int32Array;
  private readonly axis: Uint8Array;
  private stack = new Int32Array(256);
  constructor(private readonly p: Float64Array) {
    const n = p.length / 3;
    this.order = new Int32Array(n);
    for (let i = 0; i < n; i += 1) this.order[i] = i;
    this.axis = new Uint8Array(n);
    // Built without recursion: each range split at its median along its widest side.
    const stack: number[] = [0, n];
    while (stack.length) {
      const hi = stack.pop()!, lo = stack.pop()!;
      if (hi - lo <= 1) continue;
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let k = lo; k < hi; k += 1) {
        const o = this.order[k] * 3;
        if (p[o] < minX) minX = p[o]; if (p[o] > maxX) maxX = p[o];
        if (p[o + 1] < minY) minY = p[o + 1]; if (p[o + 1] > maxY) maxY = p[o + 1];
        if (p[o + 2] < minZ) minZ = p[o + 2]; if (p[o + 2] > maxZ) maxZ = p[o + 2];
      }
      const ex = maxX - minX, ey = maxY - minY, ez = maxZ - minZ;
      const ax = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
      const mid = (lo + hi) >> 1;
      this.select(lo, hi - 1, mid, ax);
      this.axis[mid] = ax;
      stack.push(lo, mid, mid + 1, hi);
    }
  }
  private select(left: number, right: number, k: number, ax: number) {
    const o = this.order, p = this.p;
    while (right > left) {
      const pivot = p[o[(left + right) >> 1] * 3 + ax];
      let i = left, j = right;
      while (i <= j) {
        while (p[o[i] * 3 + ax] < pivot) i += 1;
        while (p[o[j] * 3 + ax] > pivot) j -= 1;
        if (i <= j) { const t = o[i]; o[i] = o[j]; o[j] = t; i += 1; j -= 1; }
      }
      if (k <= j) right = j; else if (k >= i) left = i; else return;
    }
  }
  /** The nearest point closer than sqrt(limit2): its number in `found.i` (-1 if none), squared distance in `found.d2`. */
  nearest(x: number, y: number, z: number, limit2: number, found: { i: number; d2: number }) {
    const o = this.order, p = this.p;
    let best = limit2, bestI = -1;
    let stack = this.stack;
    let top = 0;
    stack[top++] = 0; stack[top++] = o.length;
    while (top) {
      const hi = stack[--top], lo = stack[--top];
      if (hi <= lo) continue;
      const mid = (lo + hi) >> 1;
      const i = o[mid] * 3;
      const d2 = (x - p[i]) ** 2 + (y - p[i + 1]) ** 2 + (z - p[i + 2]) ** 2;
      if (d2 < best) { best = d2; bestI = o[mid]; }
      if (hi - lo === 1) continue;
      if (top + 4 > stack.length) { const grown = new Int32Array(stack.length * 2); grown.set(stack); stack = this.stack = grown; }
      const ax = this.axis[mid];
      const diff = (ax === 0 ? x : ax === 1 ? y : z) - p[i + ax];
      // The far side only if it can hold something nearer; it is searched after the near side.
      if (diff * diff < best) {
        if (diff < 0) { stack[top++] = mid + 1; stack[top++] = hi; stack[top++] = lo; stack[top++] = mid; }
        else { stack[top++] = lo; stack[top++] = mid; stack[top++] = mid + 1; stack[top++] = hi; }
      } else if (diff < 0) { stack[top++] = lo; stack[top++] = mid; } else { stack[top++] = mid + 1; stack[top++] = hi; }
    }
    found.i = bestI; found.d2 = best;
  }
}

export type BiteContactStats = {
  /** The deepest overlap (mm, positive), 0 if none. */
  maxOverlap: number;
  /** The area of this arch's surface in overlap, and within 0.05 mm (touching), mm². */
  overlapArea: number;
  contactArea: number;
};

/** Area of the triangles whose three corners pass `test`. */
function areaWhere(soup: ArrayLike<number>, distances: Float32Array, test: (d: number) => boolean) {
  let area = 0;
  for (let t = 0; t * 9 < soup.length; t += 1) {
    if (!test(distances[t * 3]) || !test(distances[t * 3 + 1]) || !test(distances[t * 3 + 2])) continue;
    const o = t * 9;
    const ux = soup[o + 3] - soup[o], uy = soup[o + 4] - soup[o + 1], uz = soup[o + 5] - soup[o + 2];
    const vx = soup[o + 6] - soup[o], vy = soup[o + 7] - soup[o + 1], vz = soup[o + 8] - soup[o + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return area;
}

export function contactStats(soup: ArrayLike<number>, distances: Float32Array): BiteContactStats {
  let deepest = 0;
  for (const d of distances) if (Number.isFinite(d) && d < deepest) deepest = d;
  return {
    maxOverlap: -deepest,
    overlapArea: areaWhere(soup, distances, (d) => Number.isFinite(d) && d < 0),
    contactArea: areaWhere(soup, distances, (d) => Number.isFinite(d) && d < 0.05),
  };
}

/** Per-corner colours (r, g, b in 0..1) for a soup: the scale's colours, `base` where uncoloured. */
export function contactColors(distances: Float32Array, base: string, contactOnly = false): Float32Array {
  const fallback = hexRgb(base);
  const out = new Float32Array(distances.length * 3);
  for (let c = 0; c < distances.length; c += 1) {
    const color = contactColor(distances[c], contactOnly) ?? fallback;
    out[c * 3] = color[0]; out[c * 3 + 1] = color[1]; out[c * 3 + 2] = color[2];
  }
  return out;
}

export type BiteContactMap = { upper: Float32Array; lower: Float32Array; upperStats: BiteContactStats; lowerStats: BiteContactStats };

/** Both arches against each other. */
export function biteContactMap(upper: ArrayLike<number>, lower: ArrayLike<number>, reach = CONTACT_REACH): BiteContactMap {
  const up = signedDistances(upper, lower, reach);
  const low = signedDistances(lower, upper, reach);
  return { upper: up, lower: low, upperStats: contactStats(upper, up), lowerStats: contactStats(lower, low) };
}
