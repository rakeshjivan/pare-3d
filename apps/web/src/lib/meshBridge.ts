/**
 * Build 77: Bridge and Join - Meshmixer's Edit > Bridge and Edit > Join, as engines on triangle soups
 * (9 numbers a triangle, Y-up mm).
 *
 * Bridge joins two open-edge loops (rims) with a tube of triangles, the way Blender's bmo_bridge does
 * (source/blender/bmesh/operators/bmo_bridge.cc): the second loop is paired against the first in the
 * opposite direction, so the tube's triangles run each rim edge the other way round from the surface
 * beside it (the tube faces the same way as its neighbours); the starting corner is turned so the total
 * twist is least; the loop with fewer corners gets more, its longest edges split first (the triangle
 * beside a split edge is split with it, so there is no T-junction); and the quads between the loops,
 * and between any rings put in along the way, are cut along their shorter diagonal. The rings sit at
 * about the rims' own edge length apart, and are evened out by LiveMesh.refine with every corner of the
 * part fixed but theirs.
 *
 * Join zips open edges that lie on, or within a tolerance of, each other (two shells cut apart and put
 * back, a scan in two halves): rim corners nearest each other are merged, a rim corner with no partner
 * is put into the opposite rim edge (splitting it), and a shell found facing the wrong way to the one it
 * is joined to is turned over.
 */
import * as THREE from "three";
import { LiveMesh } from "@/lib/liveSculpt";

export type Vec3 = [number, number, number];

// -------------------------------------------------------------------------------------------------
// An indexed working copy: welded corners, triangles, and a map from each directed edge to its triangle.

const QUANT = 1e5;
const EDGE_KEY = 67108864; // 2^26 corners at most

class Indexed {
  points: number[] = [];
  tris: number[] = [];
  /** Directed edge a -> b (a * EDGE_KEY + b) to the triangle that runs it; -1 when two do. */
  edges = new Map<number, number>();

  static fromSoup(soup: ArrayLike<number>): Indexed {
    const out = new Indexed();
    // Corners welded within 1e-5 mm (as LiveMesh.fromSoup): an integer hash with chains.
    const heads = new Map<number, number>();
    const chain: number[] = [];
    const qs: number[] = [];
    const ids = [0, 0, 0];
    for (let i = 0; i + 8 < soup.length; i += 9) {
      for (let k = 0; k < 3; k += 1) {
        const x = soup[i + k * 3], y = soup[i + k * 3 + 1], z = soup[i + k * 3 + 2];
        const qx = Math.round(x * QUANT), qy = Math.round(y * QUANT), qz = Math.round(z * QUANT);
        const h = Math.imul(qx | 0, 73856093) ^ Math.imul(qy | 0, 19349663) ^ Math.imul(qz | 0, 83492791);
        let id = heads.get(h) ?? -1;
        while (id >= 0 && !(qs[id * 3] === qx && qs[id * 3 + 1] === qy && qs[id * 3 + 2] === qz)) id = chain[id];
        if (id < 0) {
          id = out.points.length / 3;
          out.points.push(x, y, z);
          qs.push(qx, qy, qz);
          chain.push(heads.get(h) ?? -1);
          heads.set(h, id);
        }
        ids[k] = id;
      }
      if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) out.tris.push(ids[0], ids[1], ids[2]);
    }
    for (let t = 0; t < out.tris.length / 3; t += 1) out.link(t);
    return out;
  }

  get pointCount() { return this.points.length / 3; }
  get triCount() { return this.tris.length / 3; }
  key(a: number, b: number) { return a * EDGE_KEY + b; }
  private link(t: number) {
    for (let k = 0; k < 3; k += 1) {
      const key = this.key(this.tris[t * 3 + k], this.tris[t * 3 + ((k + 1) % 3)]);
      this.edges.set(key, this.edges.has(key) ? -1 : t);
    }
  }
  private unlink(t: number) {
    for (let k = 0; k < 3; k += 1) {
      const key = this.key(this.tris[t * 3 + k], this.tris[t * 3 + ((k + 1) % 3)]);
      if (this.edges.get(key) === t) this.edges.delete(key);
    }
  }
  addPoint(x: number, y: number, z: number) { this.points.push(x, y, z); return this.pointCount - 1; }
  addTri(a: number, b: number, c: number) { const t = this.triCount; this.tris.push(a, b, c); this.link(t); return t; }
  setTri(t: number, a: number, b: number, c: number) { this.unlink(t); this.tris[t * 3] = a; this.tris[t * 3 + 1] = b; this.tris[t * 3 + 2] = c; this.link(t); }
  p(v: number): THREE.Vector3 { return new THREE.Vector3(this.points[v * 3], this.points[v * 3 + 1], this.points[v * 3 + 2]); }
  dist(a: number, b: number) { const p = this.points; return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]); }
  /** Whether a -> b is an open edge run by one triangle. */
  isRim(a: number, b: number) { const t = this.edges.get(this.key(a, b)); return t !== undefined && t >= 0 && !this.edges.has(this.key(b, a)); }

  /** The open edges chained into loops, each in the direction its triangles run it (a -> b is a triangle's edge). */
  rimLoops(): number[][] {
    const next = new Map<number, number>();
    for (const [key, t] of this.edges) {
      if (t < 0) continue;
      const a = Math.floor(key / EDGE_KEY), b = key - a * EDGE_KEY;
      if (!this.edges.has(this.key(b, a)) && !next.has(a)) next.set(a, b);
    }
    const loops: number[][] = [];
    const seen = new Set<number>();
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const loop: number[] = [];
      let v: number | undefined = start;
      while (v !== undefined && !seen.has(v)) { seen.add(v); loop.push(v); v = next.get(v); }
      if (v === start && loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  /** Shell number of each corner (corners joined by triangles). */
  shells(): Int32Array {
    const parent = new Int32Array(this.pointCount);
    for (let i = 0; i < parent.length; i += 1) parent[i] = i;
    const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let t = 0; t < this.triCount; t += 1) {
      const a = find(this.tris[t * 3]), b = find(this.tris[t * 3 + 1]), c = find(this.tris[t * 3 + 2]);
      parent[b] = a; parent[find(c)] = a;
    }
    for (let i = 0; i < parent.length; i += 1) parent[i] = find(i);
    return parent;
  }

  /** Splits the rim edge a -> b into k + 1 equal parts (the triangle beside it too); returns the new corners in order. */
  splitRim(a: number, b: number, k: number): number[] {
    const t = this.edges.get(this.key(a, b));
    if (t === undefined || t < 0 || k <= 0) return [];
    let c = -1;
    for (let j = 0; j < 3; j += 1) { const v = this.tris[t * 3 + j]; if (v !== a && v !== b) c = v; }
    const pa = this.p(a), pb = this.p(b);
    const made: number[] = [];
    for (let j = 1; j <= k; j += 1) { const q = pa.clone().lerp(pb, j / (k + 1)); made.push(this.addPoint(q.x, q.y, q.z)); }
    const chain = [a, ...made, b];
    this.setTri(t, chain[0], chain[1], c);
    for (let j = 1; j + 1 < chain.length; j += 1) this.addTri(chain[j], chain[j + 1], c);
    return made;
  }

  toSoup(): Float32Array {
    const out = new Float32Array(this.tris.length * 3);
    for (let i = 0; i < this.tris.length; i += 1) {
      const v = this.tris[i] * 3;
      out[i * 3] = this.points[v]; out[i * 3 + 1] = this.points[v + 1]; out[i * 3 + 2] = this.points[v + 2];
    }
    return out;
  }
}

// -------------------------------------------------------------------------------------------------
// Loops

/** Newell's normal of a closed loop of corners (length is twice the loop's projected area). */
function newell(m: Indexed, loop: number[]) {
  const n = new THREE.Vector3();
  const P = m.points;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i] * 3, b = loop[(i + 1) % loop.length] * 3;
    n.x += (P[a + 1] - P[b + 1]) * (P[a + 2] + P[b + 2]);
    n.y += (P[a + 2] - P[b + 2]) * (P[a] + P[b]);
    n.z += (P[a] - P[b]) * (P[a + 1] + P[b + 1]);
  }
  return n;
}
function centroid(m: Indexed, loop: number[]) {
  const c = new THREE.Vector3();
  for (const v of loop) c.add(m.p(v));
  return c.divideScalar(loop.length);
}
function loopLength(m: Indexed, loop: number[]) {
  let s = 0;
  for (let i = 0; i < loop.length; i += 1) s += m.dist(loop[i], loop[(i + 1) % loop.length]);
  return s;
}

/** The open-edge loops of a soup, as corner positions, each in the direction its triangles run it. */
export function rimLoopsOfSoup(soup: ArrayLike<number>): Vec3[][] {
  const m = Indexed.fromSoup(soup);
  return m.rimLoops().map((loop) => loop.map((v) => [m.points[v * 3], m.points[v * 3 + 1], m.points[v * 3 + 2]] as Vec3));
}

/** Gives the loop `target - loop.length` more corners, splitting its longest edges first (length shared out). */
function resample(m: Indexed, loop: number[], target: number): number[] {
  const n = loop.length, extra = target - n;
  if (extra <= 0) return loop;
  const lengths = loop.map((v, i) => m.dist(v, loop[(i + 1) % n]));
  const total = lengths.reduce((s, x) => s + x, 0) || 1;
  const counts = lengths.map((l) => Math.floor((extra * l) / total));
  let left = extra - counts.reduce((s, x) => s + x, 0);
  // The rest to the edges whose pieces are still longest.
  while (left > 0) {
    let best = 0, bestPiece = -1;
    for (let i = 0; i < n; i += 1) { const piece = lengths[i] / (counts[i] + 1); if (piece > bestPiece) { bestPiece = piece; best = i; } }
    counts[best] += 1;
    left -= 1;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(loop[i]);
    out.push(...m.splitRim(loop[i], loop[(i + 1) % n], counts[i]));
  }
  return out;
}

/** The turn that carries loop A's facing onto the facing of the loop it is paired with (half a turn about the line between them when the two face opposite ways). */
function transport(nA: THREE.Vector3, nP: THREE.Vector3, across: THREE.Vector3) {
  const q = new THREE.Quaternion();
  if (nA.lengthSq() < 1e-20 || nP.lengthSq() < 1e-20) return q;
  const a = nA.clone().normalize(), p = nP.clone().normalize();
  if (a.dot(p) > -0.999) return q.setFromUnitVectors(a, p);
  let axis = a.clone().cross(across);
  if (axis.lengthSq() < 1e-12) axis = Math.abs(a.x) < 0.9 ? new THREE.Vector3(1, 0, 0).cross(a) : new THREE.Vector3(0, 1, 0).cross(a);
  return q.setFromAxisAngle(axis.normalize(), Math.PI);
}

/** The starting offset into P that makes the pairing A[i] - P[i + s] least twisted, and its cost. */
function leastTwist(m: Indexed, A: number[], P: number[]): { offset: number; cost: number } {
  const n = A.length;
  const cA = centroid(m, A), cP = centroid(m, P);
  const q = transport(newell(m, A), newell(m, P), cP.clone().sub(cA));
  const shape = (loop: number[], c: THREE.Vector3, turn: THREE.Quaternion | null) => {
    const pts = loop.map((v) => { const p = m.p(v).sub(c); return turn ? p.applyQuaternion(turn) : p; });
    const rms = Math.sqrt(pts.reduce((s, p) => s + p.lengthSq(), 0) / pts.length) || 1;
    const out = new Float64Array(n * 3);
    pts.forEach((p, i) => { out[i * 3] = p.x / rms; out[i * 3 + 1] = p.y / rms; out[i * 3 + 2] = p.z / rms; });
    return out;
  };
  const a = shape(A, cA, q), p = shape(P, cP, null);
  let best = 0, bestCost = Infinity;
  for (let s = 0; s < n; s += 1) {
    let cost = 0;
    for (let i = 0; i < n && cost < bestCost; i += 1) {
      const j = ((i + s) % n) * 3;
      cost += (a[i * 3] - p[j]) ** 2 + (a[i * 3 + 1] - p[j + 1]) ** 2 + (a[i * 3 + 2] - p[j + 2]) ** 2;
    }
    if (cost < bestCost) { bestCost = cost; best = s; }
  }
  return { offset: best, cost: bestCost / n };
}

/**
 * How the surface beside a rim faces: +1 straight out from the rim's middle (a tube's outside, a cup's
 * outside), -1 straight in, near 0 along the rim's axis (a flat ring). Area weighted.
 */
function rimFacing(m: Indexed, loop: number[]) {
  const c = centroid(m, loop), axis = newell(m, loop);
  if (axis.lengthSq() > 0) axis.normalize();
  let along = 0, total = 0;
  const n = new THREE.Vector3(), r = new THREE.Vector3();
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const t = m.edges.get(m.key(a, b));
    if (t === undefined || t < 0) continue;
    const p0 = m.p(m.tris[t * 3]), p1 = m.p(m.tris[t * 3 + 1]), p2 = m.p(m.tris[t * 3 + 2]);
    n.subVectors(p1, p0).cross(p2.sub(p0));
    r.copy(m.p(a)).add(m.p(b)).multiplyScalar(0.5).sub(c);
    r.addScaledVector(axis, -r.dot(axis));
    if (r.lengthSq() === 0) continue;
    along += n.dot(r.normalize());
    total += n.length();
  }
  return total > 0 ? along / total : 0;
}

/** The way the surface runs on across the rim at corner v of a rim loop (unit), for a curved bridge. */
function rimHeading(m: Indexed, loop: number[], i: number) {
  const n = loop.length;
  const out = new THREE.Vector3();
  for (const [a, b] of [[loop[(i + n - 1) % n], loop[i]], [loop[i], loop[(i + 1) % n]]]) {
    const t = m.edges.get(m.key(a, b));
    if (t === undefined || t < 0) continue;
    let c = -1;
    for (let j = 0; j < 3; j += 1) { const v = m.tris[t * 3 + j]; if (v !== a && v !== b) c = v; }
    const pa = m.p(a), pb = m.p(b);
    const along = pb.clone().sub(pa).normalize();
    const d = pa.clone().add(pb).multiplyScalar(0.5).sub(m.p(c));
    d.addScaledVector(along, -d.dot(along));
    if (d.lengthSq() > 0) out.add(d.normalize());
  }
  return out.lengthSq() > 0 ? out.normalize() : out;
}

// -------------------------------------------------------------------------------------------------
// Bridge

export type BridgeOptions = {
  /** Rings of triangles across the gap; by default enough to keep the bridge near the rims' edge length. */
  segments?: number;
  /** 0 (straight, the default) .. 1: how far the bridge leaves each rim in the way the surface was heading (Hermite curve). */
  smooth?: number;
  /** Even out the bridge's own corners with LiveMesh.refine (default true). */
  refine?: boolean;
};

export type BridgeResult =
  | {
      ok: true;
      soup: Float32Array;
      /** Triangles in the bridge (before refining). */
      added: number;
      /** Rings of quads across the gap. */
      segments: number;
      /** Whether the second loop's shell was turned over to face the same way as the first's. */
      flipped: boolean;
    }
  | { ok: false; reason: "no-rims" | "not-a-rim" | "same-rim" };

function bridgeIndexed(m: Indexed, loopA: number[], loopB: number[], options: BridgeOptions): BridgeResult {
  if (loopA === loopB || loopA.some((v) => loopB.includes(v))) return { ok: false, reason: "same-rim" };
  // Equal counts: the shorter loop gets more corners.
  const count = Math.max(loopA.length, loopB.length);
  const meanEdge = (loopLength(m, loopA) + loopLength(m, loopB)) / (loopA.length + loopB.length);
  let A = resample(m, loopA, count);
  let B = resample(m, loopB, count);
  // Pair A with B the other way round, so the tube runs both rims against their surfaces. Two separate
  // shells may face opposite ways (one inside out): then B's shell is turned over first.
  let P = B.slice().reverse();
  let pairing = leastTwist(m, A, P);
  let flipped = false;
  const shell = m.shells();
  if (shell[A[0]] !== shell[B[0]]) {
    // Two shells whose surfaces at the rims face opposite ways (one out from its rim's middle, the other
    // in): B's is inside out. When a rim's surface faces neither way (a flat ring), the twist decides.
    const fa = rimFacing(m, A), fb = rimFacing(m, B);
    let flip: boolean;
    if (Math.abs(fa) > 0.2 && Math.abs(fb) > 0.2) flip = Math.sign(fa) !== Math.sign(fb);
    else {
      const forward = leastTwist(m, A, B);
      flip = pairing.cost > 0.05 && forward.cost < pairing.cost * 0.5;
    }
    if (flip) {
      const which = shell[B[0]];
      for (let t = 0; t < m.triCount; t += 1) {
        if (shell[m.tris[t * 3]] !== which) continue;
        m.setTri(t, m.tris[t * 3], m.tris[t * 3 + 2], m.tris[t * 3 + 1]);
      }
      B = B.slice().reverse();
      P = B.slice().reverse();
      pairing = leastTwist(m, A, P);
      flipped = true;
    }
  }
  const n = count, s = pairing.offset;
  const pa = A, pb = Array.from({ length: n }, (_, i) => P[(i + s) % n]);
  let gap = 0;
  for (let i = 0; i < n; i += 1) gap += m.dist(pa[i], pb[i]);
  gap /= n;
  const segments = Math.max(1, Math.round(options.segments ?? Math.min(256, gap / Math.max(meanEdge, 1e-9))));
  const smooth = Math.max(0, Math.min(1, options.smooth ?? 0));
  const headingA = smooth > 0 ? pa.map((_, i) => rimHeading(m, A, i)) : [];
  // P runs B backwards; B's own order is what rimHeading needs.
  const headingB = smooth > 0 ? pb.map((v) => rimHeading(m, B, B.indexOf(v))) : [];
  const firstNew = m.pointCount;
  const rings: number[][] = [pa];
  for (let j = 1; j < segments; j += 1) {
    const t = j / segments;
    const ring: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = m.p(pa[i]), b = m.p(pb[i]);
      let q: THREE.Vector3;
      if (smooth > 0) {
        const L = a.distanceTo(b) * smooth;
        const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
        q = a.multiplyScalar(h00).add(b.multiplyScalar(h01)).addScaledVector(headingA[i], h10 * L).addScaledVector(headingB[i], -h11 * L);
      } else q = a.lerp(b, t);
      ring.push(m.addPoint(q.x, q.y, q.z));
    }
    rings.push(ring);
  }
  rings.push(pb);
  let added = 0;
  for (let j = 0; j < segments; j += 1) {
    const lo = rings[j], hi = rings[j + 1];
    for (let i = 0; i < n; i += 1) {
      const a0 = lo[i], a1 = lo[(i + 1) % n], b0 = hi[i], b1 = hi[(i + 1) % n];
      // The quad a1 -> a0 -> b0 -> b1, cut along its shorter diagonal.
      if (m.dist(a0, b1) <= m.dist(a1, b0)) { m.addTri(a1, a0, b1); m.addTri(a0, b0, b1); }
      else { m.addTri(a1, a0, b0); m.addTri(a1, b0, b1); }
      added += 2;
    }
  }
  let soup: Float32Array;
  if (options.refine !== false && m.pointCount > firstNew) {
    // Only the bridge goes into the refiner: its rims are fixed, so nothing outside it can change, and
    // the part's other triangles are put back round it untouched.
    const firstBridge = m.triCount - added;
    const local = new Map<number, number>();
    const points: number[] = [], tris: number[] = [];
    let firstFree = 0;
    const order: number[] = [];
    for (const ring of [rings[0], rings[segments]]) for (const v of ring) if (!local.has(v)) { local.set(v, order.length); order.push(v); }
    firstFree = order.length;
    for (let j = 1; j < segments; j += 1) for (const v of rings[j]) { local.set(v, order.length); order.push(v); }
    for (const v of order) points.push(m.points[v * 3], m.points[v * 3 + 1], m.points[v * 3 + 2]);
    for (let i = firstBridge * 3; i < m.tris.length; i += 1) tris.push(local.get(m.tris[i])!);
    const live = new LiveMesh(points, tris);
    for (let pass = 0; pass < 3; pass += 1) {
      const free: number[] = [];
      for (let v = firstFree; v < live.vCount; v += 1) if (live.vAlive[v]) free.push(v);
      // A little over the rim edge: the bridge's quads (rim edge by ring spacing) are cut into triangles whose
      // diagonals are about 1.4 times it, which a target of the rim edge itself would split again and again.
      live.refine(free, meanEdge * 1.15, { fixed: (v) => v < firstFree, budget: Number.MAX_SAFE_INTEGER });
    }
    const bridge = live.soup();
    live.dispose();
    m.tris.length = firstBridge * 3;
    const rest = m.toSoup();
    soup = new Float32Array(rest.length + bridge.length);
    soup.set(rest);
    soup.set(bridge, rest.length);
  } else soup = m.toSoup();
  return { ok: true, soup, added, segments, flipped };
}

/** Finds the mesh's rim loop that holds most of the given corner positions (more than half of them). */
function matchLoop(m: Indexed, loops: number[][], points: ArrayLike<Vec3>): number[] | null {
  const where = new Map<string, number>();
  for (let v = 0; v < m.pointCount; v += 1) where.set(`${Math.round(m.points[v * 3] * QUANT)},${Math.round(m.points[v * 3 + 1] * QUANT)},${Math.round(m.points[v * 3 + 2] * QUANT)}`, v);
  const ids = new Set<number>();
  for (let i = 0; i < points.length; i += 1) {
    const [x, y, z] = points[i];
    const v = where.get(`${Math.round(x * QUANT)},${Math.round(y * QUANT)},${Math.round(z * QUANT)}`);
    if (v !== undefined) ids.add(v);
  }
  let best: number[] | null = null, bestHits = 0;
  for (const loop of loops) {
    let hits = 0;
    for (const v of loop) if (ids.has(v)) hits += 1;
    if (hits > bestHits) { bestHits = hits; best = loop; }
  }
  return best && bestHits * 2 > points.length ? best : null;
}

/**
 * Joins two open-edge loops of `soup` with a tube of triangles. `loopA` and `loopB` are corner positions
 * of the two rims (as rimLoopsOfSoup gives them; order and direction do not matter).
 */
export function bridgeLoops(soup: ArrayLike<number>, loopA: ArrayLike<Vec3>, loopB: ArrayLike<Vec3>, options: BridgeOptions = {}): BridgeResult {
  const m = Indexed.fromSoup(soup);
  const loops = m.rimLoops();
  if (loops.length < 2) return { ok: false, reason: "no-rims" };
  const a = matchLoop(m, loops, loopA), b = matchLoop(m, loops, loopB);
  if (!a || !b) return { ok: false, reason: "not-a-rim" };
  if (a === b) return { ok: false, reason: "same-rim" };
  return bridgeIndexed(m, a, b, options);
}

function distanceToLoop(m: Indexed, loop: number[], p: THREE.Vector3) {
  let best = Infinity;
  const seg = new THREE.Line3(), q = new THREE.Vector3();
  for (let i = 0; i < loop.length; i += 1) {
    seg.set(m.p(loop[i]), m.p(loop[(i + 1) % loop.length]));
    seg.closestPointToPoint(p, true, q);
    best = Math.min(best, q.distanceTo(p));
  }
  return best;
}

/** Bridges the rim nearest `pointA` to the rim nearest `pointB` (two picks on or near the open edges). */
export function bridgeNearestRims(soup: ArrayLike<number>, pointA: Vec3, pointB: Vec3, options: BridgeOptions = {}): BridgeResult {
  const m = Indexed.fromSoup(soup);
  const loops = m.rimLoops();
  if (loops.length < 2) return { ok: false, reason: "no-rims" };
  const pA = new THREE.Vector3(...pointA), pB = new THREE.Vector3(...pointB);
  const dA = loops.map((loop) => distanceToLoop(m, loop, pA));
  const dB = loops.map((loop) => distanceToLoop(m, loop, pB));
  const ia = dA.indexOf(Math.min(...dA)), ib = dB.indexOf(Math.min(...dB));
  if (ia === ib) return { ok: false, reason: "same-rim" };
  return bridgeIndexed(m, loops[ia], loops[ib], options);
}

// -------------------------------------------------------------------------------------------------
// Join

export type JoinResult = {
  soup: Float32Array;
  /** Pairs of rim corners merged. */
  merged: number;
  /** Rim corners put into an opposite rim edge. */
  inserted: number;
  /** Shells turned over to face the same way as the shell they were joined to. */
  flipped: number;
  /** Open edges before and after. */
  openBefore: number;
  openAfter: number;
};

function countOpen(m: Indexed) {
  let open = 0;
  for (const [key, t] of m.edges) {
    if (t < 0) continue;
    const a = Math.floor(key / EDGE_KEY), b = key - a * EDGE_KEY;
    if (!m.edges.has(m.key(b, a))) open += 1;
  }
  return open;
}

/**
 * Zips open edges that lie within `tolerance` mm of other open edges (Meshmixer's Join): nearest rim
 * corners merged in pairs, a rim corner with no partner put into the rim edge across from it, shells
 * turned to face the same way. Corners of one rim next to each other are never merged.
 */
export function joinOpenEdges(soup: ArrayLike<number>, tolerance: number): JoinResult {
  const m = Indexed.fromSoup(soup);
  const openBefore = countOpen(m);
  const tol = Math.max(tolerance, 1e-6);
  // Rim edges (directed as their triangles run them) and rim corners.
  const rimEdges: number[] = [];
  for (const [key, t] of m.edges) {
    if (t < 0) continue;
    const a = Math.floor(key / EDGE_KEY), b = key - a * EDGE_KEY;
    if (!m.edges.has(m.key(b, a))) rimEdges.push(a, b);
  }
  const rimCorners = [...new Set(rimEdges)];
  // Corners joined by an edge (any edge) are never merged: that would fold a triangle flat.
  const linked = new Set<number>();
  for (let t = 0; t < m.triCount; t += 1) for (let k = 0; k < 3; k += 1) {
    const a = m.tris[t * 3 + k], b = m.tris[t * 3 + ((k + 1) % 3)];
    linked.add(a < b ? a * EDGE_KEY + b : b * EDGE_KEY + a);
  }
  const joined = (a: number, b: number) => linked.has(a < b ? a * EDGE_KEY + b : b * EDGE_KEY + a);
  const cellKey = (ix: number, iy: number, iz: number) => `${ix},${iy},${iz}`;
  const cornerGrid = new Map<string, number[]>();
  const P = m.points;
  for (const v of rimCorners) {
    const k = cellKey(Math.floor(P[v * 3] / tol), Math.floor(P[v * 3 + 1] / tol), Math.floor(P[v * 3 + 2] / tol));
    const list = cornerGrid.get(k); if (list) list.push(v); else cornerGrid.set(k, [v]);
  }
  const nearest = (v: number) => {
    const ix = Math.floor(P[v * 3] / tol), iy = Math.floor(P[v * 3 + 1] / tol), iz = Math.floor(P[v * 3 + 2] / tol);
    let best = -1, bestD = tol;
    for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) for (let oz = -1; oz <= 1; oz += 1) {
      for (const w of cornerGrid.get(cellKey(ix + ox, iy + oy, iz + oz)) ?? []) {
        if (w === v || joined(v, w)) continue;
        const d = m.dist(v, w);
        if (d <= bestD) { bestD = d; best = w; }
      }
    }
    return best;
  };
  const partner = new Map<number, number>();
  const near = new Map<number, number>();
  for (const v of rimCorners) near.set(v, nearest(v));
  for (const v of rimCorners) {
    const w = near.get(v)!;
    if (w >= 0 && near.get(w) === v && !partner.has(v) && !partner.has(w)) { partner.set(v, w); partner.set(w, v); }
  }
  // Unpaired rim corners: into the nearest rim edge within the tolerance that does not touch them.
  const edgeCell = Math.max(tol, rimEdges.length ? (() => { let s = 0; for (let e = 0; e < rimEdges.length; e += 2) s += m.dist(rimEdges[e], rimEdges[e + 1]); return s / (rimEdges.length / 2); })() : tol);
  const edgeGrid = new Map<string, number[]>();
  for (let e = 0; e < rimEdges.length; e += 2) {
    const a = rimEdges[e], b = rimEdges[e + 1];
    const lo = [0, 1, 2].map((k) => Math.floor((Math.min(P[a * 3 + k], P[b * 3 + k]) - tol) / edgeCell));
    const hi = [0, 1, 2].map((k) => Math.floor((Math.max(P[a * 3 + k], P[b * 3 + k]) + tol) / edgeCell));
    for (let ix = lo[0]; ix <= hi[0]; ix += 1) for (let iy = lo[1]; iy <= hi[1]; iy += 1) for (let iz = lo[2]; iz <= hi[2]; iz += 1) {
      const k = cellKey(ix, iy, iz); const list = edgeGrid.get(k); if (list) list.push(e); else edgeGrid.set(k, [e]);
    }
  }
  const splits = new Map<number, Array<{ t: number; v: number }>>();
  const seg = new THREE.Line3(), q = new THREE.Vector3();
  let inserted = 0;
  for (const v of rimCorners) {
    if (partner.has(v)) continue;
    const pv = m.p(v);
    let best = -1, bestD = tol, bestT = 0;
    for (const e of edgeGrid.get(cellKey(Math.floor(pv.x / edgeCell), Math.floor(pv.y / edgeCell), Math.floor(pv.z / edgeCell))) ?? []) {
      const a = rimEdges[e], b = rimEdges[e + 1];
      if (a === v || b === v || joined(a, v) || joined(b, v)) continue;
      seg.set(m.p(a), m.p(b));
      const t = seg.closestPointToPointParameter(pv, true);
      if (t <= 0.01 || t >= 0.99) continue;
      seg.at(t, q);
      const d = q.distanceTo(pv);
      if (d <= bestD) { bestD = d; best = e; bestT = t; }
    }
    if (best < 0) continue;
    const list = splits.get(best); if (list) list.push({ t: bestT, v }); else splits.set(best, [{ t: bestT, v }]);
  }
  // Union of corners to merge, positions averaged.
  const parent = new Int32Array(m.pointCount + rimCorners.length * 2);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  let merged = 0;
  for (const [v, w] of partner) if (v < w) { unite(v, w); merged += 1; }
  for (const [e, list] of splits) {
    list.sort((x, y) => x.t - y.t);
    const a = rimEdges[e], b = rimEdges[e + 1];
    const made = m.splitRim(a, b, list.length);
    // splitRim spaces them evenly; put each where its partner projects instead.
    const pa = m.p(a), pb = m.p(b);
    list.forEach(({ t, v }, i) => {
      const at = pa.clone().lerp(pb, t);
      m.points[made[i] * 3] = at.x; m.points[made[i] * 3 + 1] = at.y; m.points[made[i] * 3 + 2] = at.z;
      unite(made[i], v);
      inserted += 1;
    });
  }
  // Merge: each group at its average.
  const sum = new Map<number, [number, number, number, number]>();
  for (let v = 0; v < m.pointCount; v += 1) {
    const r = find(v);
    if (r === v && !sum.has(r)) continue;
    const s = sum.get(r) ?? [m.points[r * 3], m.points[r * 3 + 1], m.points[r * 3 + 2], 1];
    if (r !== v) { s[0] += m.points[v * 3]; s[1] += m.points[v * 3 + 1]; s[2] += m.points[v * 3 + 2]; s[3] += 1; }
    sum.set(r, s);
  }
  for (const [r, s] of sum) { m.points[r * 3] = s[0] / s[3]; m.points[r * 3 + 1] = s[1] / s[3]; m.points[r * 3 + 2] = s[2] / s[3]; }
  // The shells as they were before the join, for turning one over.
  const shellOf = m.shells();
  const out = new Indexed();
  out.points = m.points;
  const triShell: number[] = [];
  const seenTri = new Map<string, number>();
  const dropped = new Set<number>();
  for (let t = 0; t < m.triCount; t += 1) {
    const a = find(m.tris[t * 3]), b = find(m.tris[t * 3 + 1]), c = find(m.tris[t * 3 + 2]);
    if (a === b || b === c || a === c) continue;
    // Two triangles on the same three corners (a flattened pocket): both go.
    const key = [a, b, c].sort((x, y) => x - y).join(",");
    const twin = seenTri.get(key);
    if (twin !== undefined) { dropped.add(twin); continue; }
    seenTri.set(key, out.triCount);
    out.tris.push(a, b, c);
    triShell.push(shellOf[m.tris[t * 3]]);
  }
  // Shells joined at an edge both run the same way round face opposite ways: turn the smaller over.
  const tally = new Map<number, Map<number, number>>(); // shell -> other shell -> (agree - disagree)
  const runs = new Map<number, number[]>();
  for (let t = 0; t < out.tris.length / 3; t += 1) {
    if (dropped.has(t)) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = out.tris[t * 3 + k], b = out.tris[t * 3 + ((k + 1) % 3)];
      const key = a < b ? a * EDGE_KEY + b : b * EDGE_KEY + a;
      const list = runs.get(key); if (list) list.push(a < b ? t + 1 : -(t + 1)); else runs.set(key, [a < b ? t + 1 : -(t + 1)]);
    }
  }
  for (const list of runs.values()) {
    if (list.length !== 2) continue;
    const s0 = triShell[Math.abs(list[0]) - 1], s1 = triShell[Math.abs(list[1]) - 1];
    if (s0 === s1) continue;
    const agree = Math.sign(list[0]) !== Math.sign(list[1]) ? 1 : -1;
    for (const [x, y] of [[s0, s1], [s1, s0]]) {
      const row = tally.get(x) ?? new Map<number, number>();
      row.set(y, (row.get(y) ?? 0) + agree);
      tally.set(x, row);
    }
  }
  const shellSize = new Map<number, number>();
  for (const s of triShell) shellSize.set(s, (shellSize.get(s) ?? 0) + 1);
  const turn = new Map<number, boolean>();
  const order = [...shellSize.keys()].sort((x, y) => shellSize.get(y)! - shellSize.get(x)!);
  for (const start of order) {
    if (turn.has(start)) continue;
    turn.set(start, false);
    const queue = [start];
    while (queue.length) {
      const s = queue.shift()!;
      for (const [other, score] of tally.get(s) ?? []) {
        if (turn.has(other) || score === 0) continue;
        turn.set(other, score > 0 ? turn.get(s)! : !turn.get(s)!);
        queue.push(other);
      }
    }
  }
  const flipped = [...turn.values()].filter(Boolean).length;
  const result = new Indexed();
  result.points = out.points;
  for (let t = 0; t < out.tris.length / 3; t += 1) {
    if (dropped.has(t)) continue;
    const a = out.tris[t * 3], b = out.tris[t * 3 + 1], c = out.tris[t * 3 + 2];
    if (turn.get(triShell[t])) result.addTri(a, c, b); else result.addTri(a, b, c);
  }
  return { soup: result.toSoup(), merged, inserted, flipped, openBefore, openAfter: countOpen(result) };
}
