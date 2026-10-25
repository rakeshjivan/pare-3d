/**
 * Fork (build 47): Dental Studio - from a turned arch (teeth up, occlusal plane at z = 0) to a model.
 *
 * closeToFloor keeps as much of the scan as it can: every open edge, ragged or not, gets a vertical
 * wall straight down to the floor (Meshmixer's "extrude, flat"). Where a wall could not stand - some
 * of the scan lies under that part of the edge (a cheek flap folded over the sulcus, a fin of
 * palate), or the edge seen from above crosses itself - the edge is worn back there, a ring of
 * triangles at a time, until every wall stands clear. Only those spots lose anatomy.
 *
 * orthoOutline is the outline of an orthodontic base trimmed the British/ABO way: back square to the
 * midline, heels at 115 degrees, buccal sides at 65 (upper) or 55 (lower) degrees to the back, the
 * upper's front pointed at the midline (labial sides at 25 degrees), the lower's rounded - each
 * side 3 mm clear of the teeth.
 *
 * hollowCavity is the solid shrunk by the wall on a voxel grid, either carried on down through the
 * floor (open underneath) or kept closed with vent holes up through the floor into it.
 *
 * hingeParts are a printed snap-on hinge behind the last molars: two posts with an axle on the
 * lower, a clip on the upper that snaps over it.
 */
import { sampler, squaredDistanceTo, voxelise, type Grid } from "@/lib/meshRound";
import { boundaryLoops, closeWithBase, dropFragments, dropInverted, type ManifoldRuntime, type ManifoldSolid, type Mesh, type Ring } from "@/lib/dentalMesh";

const MAX_HOLLOW_VOXELS = 9_000_000;

// ---------------------------------------------------------------------------------------------
// Walls from a ragged edge

type TriangleIndex = { cell: number; cells: Map<number, number[]> };

const cellKey = (ix: number, iy: number) => (ix + 32768) * 65536 + (iy + 32768);

function indexTriangles(m: Mesh, cell: number): TriangleIndex {
  const cells = new Map<number, number[]>();
  for (let t = 0; t < m.f.length / 3; t += 1) {
    const a = m.f[t * 3] * 3, b = m.f[t * 3 + 1] * 3, c = m.f[t * 3 + 2] * 3;
    const x0 = Math.floor(Math.min(m.v[a], m.v[b], m.v[c]) / cell), x1 = Math.floor(Math.max(m.v[a], m.v[b], m.v[c]) / cell);
    const y0 = Math.floor(Math.min(m.v[a + 1], m.v[b + 1], m.v[c + 1]) / cell), y1 = Math.floor(Math.max(m.v[a + 1], m.v[b + 1], m.v[c + 1]) / cell);
    for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) {
      const key = cellKey(ix, iy);
      const list = cells.get(key);
      if (list) list.push(t);
      else cells.set(key, [t]);
    }
  }
  return { cell, cells };
}

/** Whether some live triangle, not touching the excluded corners, lies under (x, y, z) above the floor. */
function surfaceBelow(m: Mesh, index: TriangleIndex, alive: Uint8Array, x: number, y: number, z: number, floor: number, excluded: number[], hits?: number[]): boolean {
  const list = index.cells.get(cellKey(Math.floor(x / index.cell), Math.floor(y / index.cell)));
  if (!list) return false;
  let found = false;
  for (const t of list) {
    if (!alive[t]) continue;
    const ia = m.f[t * 3], ib = m.f[t * 3 + 1], ic = m.f[t * 3 + 2];
    if (excluded.includes(ia) || excluded.includes(ib) || excluded.includes(ic)) continue;
    const ax = m.v[ia * 3], ay = m.v[ia * 3 + 1], az = m.v[ia * 3 + 2];
    const bx = m.v[ib * 3], by = m.v[ib * 3 + 1], bz = m.v[ib * 3 + 2];
    const cx = m.v[ic * 3], cy = m.v[ic * 3 + 1], cz = m.v[ic * 3 + 2];
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-12) continue;
    const u = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / det;
    const w = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / det;
    const s = 1 - u - w;
    if (u < -1e-9 || w < -1e-9 || s < -1e-9) continue;
    const zt = u * az + w * bz + s * cz;
    if (zt < z - 0.02 && zt > floor) {
      if (!hits) return true;
      hits.push(t);
      found = true;
    }
  }
  return found;
}

function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

/** Corners of edges that cross another edge, seen from above. */
function crossingCorners(m: Mesh, edges: number[][]): Set<number> {
  const segments: Array<[number, number]> = edges.map(([a, b]) => [a, b]);
  const cell = 1;
  const cells = new Map<number, number[]>();
  const bad = new Set<number>();
  segments.forEach(([a, b], s) => {
    const ax = m.v[a * 3], ay = m.v[a * 3 + 1], bx = m.v[b * 3], by = m.v[b * 3 + 1];
    const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
    const y0 = Math.floor(Math.min(ay, by) / cell), y1 = Math.floor(Math.max(ay, by) / cell);
    const seen = new Set<number>();
    for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) {
      const key = cellKey(ix, iy);
      const list = cells.get(key);
      if (list) {
        for (const other of list) {
          if (seen.has(other)) continue;
          seen.add(other);
          const [c, d] = segments[other];
          if (c === a || c === b || d === a || d === b) continue;
          if (segmentsCross(ax, ay, bx, by, m.v[c * 3], m.v[c * 3 + 1], m.v[d * 3], m.v[d * 3 + 1])) {
            bad.add(a); bad.add(b); bad.add(c); bad.add(d);
          }
        }
        list.push(s);
      } else cells.set(key, [s]);
    }
  });
  return bad;
}

/** `forced`: corners in the protected band left as they were although their wall is not clear. */
/** The ragged fringe along a scan's open edge that may be worn back even beside a tooth, mm. */
export const EDGE_FRINGE = 1.2;

/** Distance along the surface from the open edge, mm, worked out up to `limit` (Infinity beyond). */
/** How far over the surface each corner is from the nearest corner marked in `seeds` (mm), up to `limit` (build 53). */
export function distanceFrom(m: Mesh, seeds: Uint8Array, limit: number): Float64Array {
  const n = m.v.length / 3;
  const dist = new Float64Array(n).fill(Infinity);
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < m.f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t + k], b = m.f[t + ((k + 1) % 3)];
    neighbours[a].push(b); neighbours[b].push(a);
  }
  const queue: number[] = [];
  for (let i = 0; i < n; i += 1) if (seeds[i]) { dist[i] = 0; queue.push(i); }
  for (let head = 0; head < queue.length; head += 1) {
    const v = queue[head];
    for (const w of neighbours[v]) {
      const d = dist[v] + Math.hypot(m.v[w * 3] - m.v[v * 3], m.v[w * 3 + 1] - m.v[v * 3 + 1], m.v[w * 3 + 2] - m.v[v * 3 + 2]);
      if (d < dist[w] && d <= limit) { dist[w] = d; queue.push(w); }
    }
  }
  return dist;
}

export function distanceFromEdge(m: Mesh, limit: number): Float64Array {
  const n = m.v.length / 3;
  const dist = new Float64Array(n).fill(Infinity);
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const uses = new Map<number, number>();
  for (let t = 0; t < m.f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t + k], b = m.f[t + ((k + 1) % 3)];
    neighbours[a].push(b);
    const key = edgeId(a, b);
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  const queue: number[] = [];
  uses.forEach((count, key) => {
    if (count !== 1) return;
    const a = Math.floor(key / 4194304), b = key % 4194304;
    for (const v of [a, b]) if (dist[v] !== 0) { dist[v] = 0; queue.push(v); }
  });
  // Label-correcting search, cut off at the limit: cheap, and exact enough for a fringe.
  for (let head = 0; head < queue.length; head += 1) {
    const v = queue[head];
    for (const w of neighbours[v]) {
      const d = dist[v] + Math.hypot(m.v[w * 3] - m.v[v * 3], m.v[w * 3 + 1] - m.v[v * 3 + 1], m.v[w * 3 + 2] - m.v[v * 3 + 2]);
      if (d < dist[w] && d <= limit * 1.5) { dist[w] = d; queue.push(w); }
    }
  }
  return dist;
}

/**
 * A corner where the open edge passes twice (two fans of triangles meeting at one point) gets a copy
 * for each fan after the first, moved 2 microns into its fan: each fan then has a wall of its own.
 */
export function splitBowties(m: Mesh): Mesh {
  const uses = new Map<number, number>();
  for (let t = 0; t < m.f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const key = edgeId(m.f[t + k], m.f[t + ((k + 1) % 3)]);
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  const outgoing = new Map<number, number>();
  for (let t = 0; t < m.f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t + k], b = m.f[t + ((k + 1) % 3)];
    if (uses.get(edgeId(a, b)) === 1) outgoing.set(a, (outgoing.get(a) ?? 0) + 1);
  }
  const bowties = [...outgoing].filter(([, n]) => n > 1).map(([v]) => v);
  if (!bowties.length) return m;
  const faces = new Map<number, number[]>();
  const wanted = new Set(bowties);
  for (let t = 0; t < m.f.length / 3; t += 1) for (let k = 0; k < 3; k += 1) {
    const v = m.f[t * 3 + k];
    if (!wanted.has(v)) continue;
    const list = faces.get(v);
    if (list) list.push(t);
    else faces.set(v, [t]);
  }
  const v = Array.from(m.v);
  const f = m.f.slice();
  for (const corner of bowties) {
    const list = faces.get(corner) ?? [];
    // Fans: triangles round the corner joined across an edge that runs from the corner.
    const parent = list.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    const byOther = new Map<number, number>();
    list.forEach((t, i) => {
      for (let k = 0; k < 3; k += 1) {
        const other = m.f[t * 3 + k];
        if (other === corner) continue;
        const seen = byOther.get(other);
        if (seen === undefined) byOther.set(other, i);
        else parent[root(i)] = root(seen);
      }
    });
    const fans = new Map<number, number[]>();
    list.forEach((t, i) => { const r = root(i); const fan = fans.get(r); if (fan) fan.push(t); else fans.set(r, [t]); });
    let first = true;
    for (const fan of fans.values()) {
      if (first) { first = false; continue; }
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const t of fan) for (let k = 0; k < 3; k += 1) {
        const w = m.f[t * 3 + k];
        if (w === corner) continue;
        cx += m.v[w * 3]; cy += m.v[w * 3 + 1]; cz += m.v[w * 3 + 2]; n += 1;
      }
      const px = m.v[corner * 3], py = m.v[corner * 3 + 1], pz = m.v[corner * 3 + 2];
      const dx = cx / n - px, dy = cy / n - py, dz = cz / n - pz;
      const len = Math.hypot(dx, dy, dz) || 1;
      const id = v.length / 3;
      v.push(px + (dx / len) * 0.002, py + (dy / len) * 0.002, pz + (dz / len) * 0.002);
      for (const t of fan) for (let k = 0; k < 3; k += 1) if (f[t * 3 + k] === corner) f[t * 3 + k] = id;
    }
  }
  return { v, f };
}

export type ClosedArch = { mesh: Mesh; outline: Ring[]; worn: number; rounds: number; forced: number; forcedAt?: number[] };

const edgeId = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);

/**
 * Vertical walls from every open edge of the scan down to z = floor, and the floor; the edge is worn
 * back where a wall could not stand. The open edge is kept up to date as triangles go, and only the
 * corners that are new on it are tested again: taking surface away never puts surface under a
 * corner that was clear. Throws when it does not settle.
 */
export function closeToFloor(m: Mesh, floor: number, maxRounds = 400, teeth?: Uint8Array, fringe = EDGE_FRINGE): ClosedArch {
  const faces = m.f.length / 3;
  const alive = new Uint8Array(faces).fill(1);
  // Triangles on the teeth are never worn away: what blocks a wall under them goes instead. The
  // ragged fringe right at the scan's edge (EDGE_FRINGE) may still go, even beside a tooth.
  const guarded = new Uint8Array(faces);
  if (teeth) {
    const fromEdge = fringe > 0 ? distanceFromEdge(m, fringe) : null;
    const kept = (v: number) => teeth[v] && (!fromEdge || fromEdge[v] > fringe);
    for (let t = 0; t < faces; t += 1) if (kept(m.f[t * 3]) || kept(m.f[t * 3 + 1]) || kept(m.f[t * 3 + 2])) guarded[t] = 1;
  }
  const accepted = new Set<number>();
  const index = indexTriangles(m, 1);
  const counts = new Int32Array(m.v.length / 3 + 1);
  for (let i = 0; i < m.f.length; i += 1) counts[m.f[i] + 1] += 1;
  for (let i = 1; i < counts.length; i += 1) counts[i] += counts[i - 1];
  const around = new Int32Array(m.f.length);
  const fill = counts.slice(0, -1);
  for (let t = 0; t < faces; t += 1) for (let k = 0; k < 3; k += 1) around[fill[m.f[t * 3 + k]]++] = t;
  const uses = new Map<number, number>();
  for (let t = 0; t < faces; t += 1) for (let k = 0; k < 3; k += 1) {
    const key = edgeId(m.f[t * 3 + k], m.f[t * 3 + ((k + 1) % 3)]);
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  // The open edge: each edge used by one live triangle, in that triangle's direction.
  const open = new Map<number, [number, number]>();
  for (let t = 0; t < faces; t += 1) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
    if (uses.get(edgeId(a, b)) === 1) open.set(edgeId(a, b), [a, b]);
  }
  let worn = 0;
  let touched = new Set<number>();
  const remove = (t: number) => {
    if (!alive[t]) return;
    alive[t] = 0;
    worn += 1;
    for (let k = 0; k < 3; k += 1) {
      const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
      touched.add(a);
      const key = edgeId(a, b);
      const left = (uses.get(key) ?? 1) - 1;
      if (left <= 0) {
        uses.delete(key);
        open.delete(key);
        continue;
      }
      uses.set(key, left);
      if (left !== 1) continue;
      // The edge is open now, in the direction of the live triangle still on it.
      for (let i = counts[a]; i < counts[a + 1]; i += 1) {
        const other = around[i];
        if (!alive[other]) continue;
        const f0 = m.f[other * 3], f1 = m.f[other * 3 + 1], f2 = m.f[other * 3 + 2];
        if (f0 !== b && f1 !== b && f2 !== b) continue;
        const forward = (f0 === a && f1 === b) || (f1 === a && f2 === b) || (f2 === a && f0 === b);
        open.set(key, forward ? [a, b] : [b, a]);
        break;
      }
    }
  };
  let candidates: Set<number> | null = null;
  let rounds = 0;
  for (; rounds < maxRounds; rounds += 1) {
    const edges = [...open.values()];
    const outgoing = new Map<number, number[]>();
    for (const [a, b] of edges) {
      const list = outgoing.get(a);
      if (list) list.push(b);
      else outgoing.set(a, [b]);
    }
    const bad = crossingCorners(m, edges);
    // A corner the edge passes through twice (two open edges touching at a point) would share a wall.
    outgoing.forEach((list, v) => { if (list.length > 1) bad.add(v); });
    // What lies under a corner's wall, for corners that may not be worn.
    const blockers = new Map<number, number[]>();
    for (const [a, list] of outgoing) {
      if (candidates && !candidates.has(a) && !list.some((b) => candidates!.has(b))) continue;
      const ax = m.v[a * 3], ay = m.v[a * 3 + 1], az = m.v[a * 3 + 2];
      const hits: number[] = [];
      if (surfaceBelow(m, index, alive, ax, ay, az, floor, [a], hits)) bad.add(a);
      for (const b of list) {
        const mx = (ax + m.v[b * 3]) / 2, my = (ay + m.v[b * 3 + 1]) / 2, mz = (az + m.v[b * 3 + 2]) / 2;
        const before = hits.length;
        if (surfaceBelow(m, index, alive, mx, my, mz, floor, [a, b], hits)) { bad.add(a); bad.add(b); }
        if (hits.length > before) blockers.set(b, (blockers.get(b) ?? []).concat(hits.slice(before)));
      }
      if (hits.length) blockers.set(a, (blockers.get(a) ?? []).concat(hits));
    }
    accepted.forEach((v) => bad.delete(v));
    if (bad.size === 0) break;
    touched = new Set<number>();
    // Wear back rings of triangles round each spot: two, three once it is taking long.
    let ring = new Set<number>(bad);
    const rings = rounds > 30 ? 3 : 2;
    for (let r = 1; r < rings; r += 1) {
      const next = new Set<number>(ring);
      for (const v of ring) for (let i = counts[v]; i < counts[v + 1]; i += 1) {
        const t = around[i];
        if (!alive[t]) continue;
        next.add(m.f[t * 3]); next.add(m.f[t * 3 + 1]); next.add(m.f[t * 3 + 2]);
      }
      ring = next;
    }
    const doomed = new Set<number>();
    for (const v of ring) for (let i = counts[v]; i < counts[v + 1]; i += 1) if (!guarded[around[i]]) doomed.add(around[i]);
    // A guarded corner keeps its triangles; the surface under its wall goes instead, if that may go.
    for (const v of bad) {
      let wearable = false, kept = false;
      for (let i = counts[v]; i < counts[v + 1]; i += 1) {
        if (!alive[around[i]]) continue;
        if (guarded[around[i]]) kept = true;
        else wearable = true;
      }
      if (wearable || !kept) continue;
      const under = (blockers.get(v) ?? []).filter((t) => alive[t] && !guarded[t]);
      if (under.length) under.forEach((t) => doomed.add(t));
      else accepted.add(v);
    }
    doomed.forEach(remove);
    candidates = touched;
    // Corners accepted this round count as touched, so their neighbours are looked at again.
    if (!doomed.size && accepted.size) continue;
  }
  if (rounds >= maxRounds) throw new Error("The scan's edge could not be made to stand on the base");
  const f: number[] = [];
  for (let t = 0; t < faces; t += 1) if (alive[t]) f.push(m.f[t * 3], m.f[t * 3 + 1], m.f[t * 3 + 2]);
  const compact: Mesh = { v: m.v, f };
  dropFragments(compact, 0.05, teeth);
  dropInverted(compact, teeth);
  const closed = closeWithBase(splitBowties(compact), floor);
  return { mesh: closed.mesh, outline: closed.outline, worn, rounds, forced: accepted.size, forcedAt: [...accepted] };
}

// ---------------------------------------------------------------------------------------------
// Orthodontic outline

/** Cuts a convex polygon with the half-plane n . p <= s. */
function clipHalfPlane(poly: Ring, nx: number, ny: number, s: number): Ring {
  const out: Ring = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = nx * p[0] + ny * p[1] - s, dq = nx * q[0] + ny * q[1] - s;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

const deg = Math.PI / 180;

/**
 * The outline of an orthodontic base round the teeth `points` (seen from above, front at -y), each
 * side `clearance` mm clear of them. Counter-clockwise.
 */
export function orthoOutline(points: Ring, arch: "upper" | "lower", clearance = 3): Ring {
  // Outward normals by angle (degrees from +x, anticlockwise); each side touches the teeth plus the clearance.
  const angles: number[] = [90, 25, 155];
  if (arch === "upper") {
    angles.push(-25, -155, -65, -115);
  } else {
    angles.push(-35, -145);
    for (let a = -45; a >= -135; a -= 5) angles.push(a);
  }
  let poly: Ring = [[-500, -500], [500, -500], [500, 500], [-500, 500]];
  for (const a of angles) {
    const nx = Math.cos(a * deg), ny = Math.sin(a * deg);
    let s = -Infinity;
    for (const [x, y] of points) s = Math.max(s, nx * x + ny * y);
    poly = clipHalfPlane(poly, nx, ny, s + clearance);
  }
  return poly;
}

/** A rectangular block round the teeth `points`, each side `clearance` mm clear of them. Counter-clockwise. */
export function blockOutline(points: Ring, clearance = 3): Ring {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return [[minX - clearance, minY - clearance], [maxX + clearance, minY - clearance], [maxX + clearance, maxY + clearance], [minX - clearance, maxY + clearance]];
}

/** The outward normal and the two ends of the polygon side whose normal is nearest `angle` degrees. */
export function outlineSide(poly: Ring, angle: number): { a: [number, number]; b: [number, number]; nx: number; ny: number } {
  let best = 0, bestDot = -Infinity;
  const tx = Math.cos(angle * deg), ty = Math.sin(angle * deg);
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    // Counter-clockwise: the outward normal of p->q is (dy, -dx).
    const nx = (q[1] - p[1]) / length, ny = -(q[0] - p[0]) / length;
    const dot = (nx * tx + ny * ty) * Math.min(1, length / 5);
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  const p = poly[best], q = poly[(best + 1) % poly.length];
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return { a: p, b: q, nx: (q[1] - p[1]) / length, ny: -(q[0] - p[0]) / length };
}

export function prism(runtime: ManifoldRuntime, ring: Ring, bottom: number, top: number): ManifoldSolid {
  const section = new runtime.CrossSection([ring], "Positive");
  const solid = section.extrude(top - bottom).translate([0, 0, bottom]);
  section.delete();
  return solid;
}

// ---------------------------------------------------------------------------------------------
// Hollowing

export type Cavity = { solid: ManifoldSolid; voxel: number; vents: Array<[number, number]> };

/**
 * The cavity of a hollow model: `positions` (a closed solid with its floor at z = floor) shrunk by
 * `wall`. Open: carried on down through the floor. Closed: a floor of `wall` stays, and `vents`
 * gives where vent holes of `ventRadius` go up through it into each part of the cavity. Pockets
 * that would be shut inside a thick wall are left solid.
 */
export function hollowCavity(runtime: ManifoldRuntime, positions: Float32Array, floor: number, wall: number, open: boolean, ventRadius = 1.5, shift = 0): Cavity {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const below = open ? wall + 1 : 0;
  const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ + below;
  let h = wall / 5;
  const budget = Math.cbrt((sx * sy * sz) / MAX_HOLLOW_VOXELS);
  if (budget > h) h = budget;
  if (h > wall / 2) throw new Error("This model is too big to hollow with walls this thin - use thicker walls");
  const pad = 2 * h;
  const origin: [number, number, number] = [minX - pad - shift * h, minY - pad - shift * h * 0.7, minZ - below - pad];
  const grid: Grid = { nx: Math.ceil((sx + 2 * pad) / h), ny: Math.ceil((sy + 2 * pad) / h), nz: Math.ceil((sz + 2 * pad) / h), h, origin };
  const { nx, ny, nz } = grid;
  const inside = voxelise(positions, grid);
  if (open) {
    const firstAbove = Math.max(0, Math.ceil((floor - origin[2]) / h - 0.5) + 1);
    for (let yi = 0; yi < ny; yi += 1) for (let xi = 0; xi < nx; xi += 1) {
      if (firstAbove >= nz || !inside[(firstAbove * ny + yi) * nx + xi]) continue;
      for (let zi = 0; zi < firstAbove; zi += 1) inside[(zi * ny + yi) * nx + xi] = 1;
    }
    for (let yi = 0; yi < ny; yi += 1) for (let xi = 0; xi < nx; xi += 1) inside[yi * nx + xi] = 0;
  }
  const outsideMask = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i += 1) outsideMask[i] = inside[i] ? 0 : 1;
  const toOutside = squaredDistanceTo(outsideMask, nx, ny, nz);
  const field = new Float32Array(inside.length);
  // Voxel centres sit about half a voxel inside the faces they stand for; one voxel more keeps the
  // thinnest wall at about the thickness asked for rather than under it.
  for (let i = 0; i < inside.length; i += 1) field[i] = (Math.sqrt(toOutside[i]) - 1) * h - wall;
  const bounds = {
    min: [origin[0], origin[1], origin[2]] as [number, number, number],
    max: [origin[0] + nx * h, origin[1] + ny * h, origin[2] + nz * h] as [number, number, number],
  };
  const raw = runtime.Manifold.levelSet(sampler(field, grid, -wall), bounds, h, 0);
  const pieces = raw.decompose();
  raw.delete();
  // Open: only what opens through the floor. Closed: only what reaches down near the floor, where a vent can reach it.
  const reach = open ? floor : floor + wall + 3 * h;
  const kept = pieces.filter((piece) => piece.boundingBox().min[2] < reach);
  pieces.filter((piece) => !kept.includes(piece)).forEach((piece) => piece.delete());
  const solid = runtime.Manifold.compose(kept);
  kept.forEach((piece) => piece.delete());
  const vents: Array<[number, number]> = [];
  if (!open && !solid.isEmpty()) {
    // The cavity's lowest layers seen from above; vents go where there is room for them, spread out.
    const cavityMask = new Uint8Array(nx * ny);
    let lowest = nz;
    for (let zi = 0; zi < nz && lowest === nz; zi += 1) for (let i = 0; i < nx * ny; i += 1) if (field[zi * nx * ny + i] > 0) { lowest = zi; break; }
    for (let zi = lowest; zi < Math.min(nz, lowest + 3); zi += 1) for (let i = 0; i < nx * ny; i += 1) if (field[zi * nx * ny + i] > 0) cavityMask[i] = 1;
    const notCavity = new Uint8Array(nx * ny);
    for (let i = 0; i < nx * ny; i += 1) notCavity[i] = cavityMask[i] ? 0 : 1;
    const room = squaredDistanceTo(notCavity, nx, ny, 1);
    const needed = ((ventRadius + 0.6) / h) ** 2;
    // Each connected part of the mask gets a vent at its roomiest spot, and a second one far from it on a long part.
    const label = new Int32Array(nx * ny).fill(-1);
    let parts = 0;
    for (let start = 0; start < nx * ny; start += 1) {
      if (!cavityMask[start] || label[start] >= 0) continue;
      const stack = [start];
      label[start] = parts;
      const members: number[] = [];
      while (stack.length) {
        const i = stack.pop()!;
        members.push(i);
        const x = i % nx, y = Math.floor(i / nx);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
          const j = yy * nx + xx;
          if (cavityMask[j] && label[j] < 0) { label[j] = parts; stack.push(j); }
        }
      }
      parts += 1;
      const roomy = members.filter((i) => room[i] >= needed);
      if (!roomy.length) continue;
      let first = roomy[0];
      for (const i of roomy) if (room[i] > room[first]) first = i;
      const at = (i: number): [number, number] => [origin[0] + ((i % nx) + 0.5) * h, origin[1] + (Math.floor(i / nx) + 0.5) * h];
      vents.push(at(first));
      let second = -1, far = 0;
      for (const i of roomy) {
        const d = Math.hypot((i % nx) - (first % nx), Math.floor(i / nx) - Math.floor(first / nx)) * h;
        if (d > far) { far = d; second = i; }
      }
      if (second >= 0 && far > 25) vents.push(at(second));
    }
  }
  return { solid, voxel: h, vents };
}

// ---------------------------------------------------------------------------------------------
// Hinge

export const HINGE_AXLE_RADIUS = 2;
/** The fit round the axle, mm (build 58): the default, and the choices the panel offers. */
export const HINGE_CLEARANCE = 0.15;
export const HINGE_FITS = [0.1, 0.15, 0.2, 0.25, 0.3] as const;
/** Room along the axle between a clip and the posts either side of it, mm. */
const HINGE_END_PLAY = 0.2;
/** The opening the clip snaps over the axle through: this much narrower than the axle, mm. */
const HINGE_SNAP = 0.8;
/** Bearings this far apart or more go one behind each side's last molar; closer, one in the middle. */
const HINGE_TWO_BEARINGS = 30;

const box = (runtime: ManifoldRuntime, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  runtime.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);

const axleAlongX = (runtime: ManifoldRuntime, radius: number, x0: number, x1: number, y: number, z: number) =>
  runtime.Manifold.cylinder(x1 - x0, radius, radius, 64).rotate([0, 90, 0]).translate([x0, y, z]);

export type HingeFront = { y: number; x: number };

/**
 * The hinge in the pair's frame (occlusal plane z = 0, back +y), built the way printable
 * articulators are (build 58, after Medit's xSNAP and 3Shape's articulators):
 *
 * - Bearings set wide: on a full arch one behind each side's last molar, like the two condyles,
 *   on one axle line 6 mm behind `back` in the occlusal plane; a quadrant gets one. Each bearing is
 *   a pair of posts on the lower carrying the axle, and a clip on the upper between them that snaps
 *   over it. Two bearings far apart cannot rock the way one short one did.
 * - Fitted: `clearance` round the axle (0.15 mm by default), 0.2 mm along it, and an opening
 *   0.8 mm narrower than the axle, so the clip holds the axle and only turns on it.
 * - An incisal stop at `front`: a post down from the upper onto one up from the lower, standing
 *   clear in front of the model and meeting in the occlusal plane, so the models close to the
 *   scanned bite every time and the stop, not the teeth, takes the load.
 * A bar along the back of each base joins its parts to it.
 */
export function hingeParts(runtime: ManifoldRuntime, back: number, xMin: number, xMax: number, floorUpper: number, floorLower: number, clearance = HINGE_CLEARANCE, front: HingeFront | null = null) {
  const r = HINGE_AXLE_RADIUS, bore = r + Math.max(0.05, clearance);
  const ay = back + 6;
  const known = Number.isFinite(xMin) && Number.isFinite(xMax);
  const cx = known ? (xMin + xMax) / 2 : 0;
  const half = Math.max(14, known ? (xMax - xMin) / 2 : 14);
  // Bearing centres: inside the ends of the back, or one in the middle.
  const centres = half * 2 >= HINGE_TWO_BEARINGS + 19 ? [cx - half + 9.5, cx + half - 9.5] : [cx];
  const made: ManifoldSolid[] = [];
  const keep = <T extends ManifoldSolid>(solid: T) => { made.push(solid); return solid; };
  const clipHalf = 4.8;
  const postIn = clipHalf + HINGE_END_PLAY, postOut = postIn + 4.5;
  const lowerParts: ManifoldSolid[] = [keep(box(runtime, cx - half, cx + half, back - 4, back + 10, floorLower, floorLower + 4))];
  const upperParts: ManifoldSolid[] = [keep(box(runtime, cx - half, cx + half, back - 4, back + 10, floorUpper - 4, floorUpper))];
  const cuts: ManifoldSolid[] = [];
  for (const c of centres) {
    lowerParts.push(
      keep(box(runtime, c - postOut, c - postIn, back + 2, back + 10, floorLower, r + 2.5)),
      keep(box(runtime, c + postIn, c + postOut, back + 2, back + 10, floorLower, r + 2.5)),
      keep(axleAlongX(runtime, r, c - postOut, c + postOut, ay, 0)),
    );
    upperParts.push(keep(box(runtime, c - clipHalf, c + clipHalf, back + 2, back + 10, -(bore + 1.8), floorUpper)));
    cuts.push(
      keep(axleAlongX(runtime, bore, c - clipHalf - 1, c + clipHalf + 1, ay, 0)),
      keep(box(runtime, c - clipHalf - 1, c + clipHalf + 1, ay - (r - HINGE_SNAP / 2), ay + (r - HINGE_SNAP / 2), -(bore + 3), 0)),
    );
  }
  if (front) {
    // The stop: 6 mm posts standing clear in front of the model (2 to 8 mm out), meeting in the
    // occlusal plane, each joined to its base only through the base's bottom 4 mm - never near the teeth.
    const y0 = front.y - 8, y1 = front.y - 2;
    lowerParts.push(
      keep(box(runtime, front.x - 3, front.x + 3, y0, y1, floorLower, 0)),
      keep(box(runtime, front.x - 3, front.x + 3, y0, front.y + 3, floorLower, floorLower + 4)),
    );
    upperParts.push(
      keep(box(runtime, front.x - 3, front.x + 3, y0, y1, 0, floorUpper)),
      keep(box(runtime, front.x - 3, front.x + 3, y0, front.y + 3, floorUpper - 4, floorUpper)),
    );
  }
  const lower = runtime.Manifold.union(lowerParts);
  const joined = keep(runtime.Manifold.union(upperParts));
  const upper = runtime.Manifold.difference(joined, runtime.Manifold.union(cuts));
  made.forEach((solid) => solid.delete());
  return { upper, lower };
}

// ---------------------------------------------------------------------------------------------
// The teeth

/** How far below its own cusp tips a tooth is protected, mm: crowns run 7 to 11 mm. */
export const TOOTH_CROWN = 10;
/** How far out from a cusp tip, seen from above, a tooth's surface reaches, mm. */
/** How far above the occlusal plane a cusp tip may stand (mm); higher points are soft tissue. */
export const TIP_CEILING = 6;
/** How far below the occlusal plane a cusp tip may lie, for the crowns (mm); lower points are soft tissue. */
export const TIP_FLOOR = -5;
/** Neighbouring teeth's cusps lie closer than this to one another, even across a missing tooth (mm). */
export const TIP_LONELY = 11;
export const TOOTH_REACH = 5.5;

/**
 * Which vertices of an arch (teeth up) are teeth: within TOOTH_REACH of a cusp tip seen from above
 * and no more than TOOTH_CROWN below it. Cusp tips are found on the scan's top surface as points
 * that are the highest within 3 mm and stand at least 2.5 mm above the surface within 6 mm - which a
 * cheek flap, the palate or the floor of the mouth seldom do. Measured locally, so a tilted or curved
 * arch and a quadrant are covered alike.
 * `ceiling`, `lowest`: in a levelled frame, tips higher or lower than these are not cusps (a fold
 * of cheek or tongue standing far above the occlusal plane, or lying well below it) and find no teeth.
 * `lonely`: a group of tips further than this from every other group finds no teeth.
 */
export function toothZone(m: Mesh, crown = TOOTH_CROWN, reachOut = TOOTH_REACH, tipsOut?: number[][], ceiling = Infinity, lowest = -Infinity, lonely = Infinity, fieldOut?: Float64Array): Uint8Array {
  const cell = 0.5;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < m.v.length; i += 3) { minX = Math.min(minX, m.v[i]); maxX = Math.max(maxX, m.v[i]); minY = Math.min(minY, m.v[i + 1]); maxY = Math.max(maxY, m.v[i + 1]); }
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1), ny = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const top = new Float64Array(nx * ny).fill(-Infinity);
  const at = (x: number, y: number) => Math.min(nx - 1, Math.floor((x - minX) / cell)) + Math.min(ny - 1, Math.floor((y - minY) / cell)) * nx;
  // The top surface, sampled across each triangle so big triangles leave no gaps.
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
    const span = Math.max(Math.abs(m.v[a] - m.v[b]), Math.abs(m.v[a] - m.v[c]), Math.abs(m.v[a + 1] - m.v[b + 1]), Math.abs(m.v[a + 1] - m.v[c + 1]));
    const steps = Math.min(40, Math.ceil(span / cell));
    for (let i = 0; i <= steps; i += 1) for (let j = 0; i + j <= steps; j += 1) {
      const u = steps ? i / steps : 0, w = steps ? j / steps : 0, s = 1 - u - w;
      const x = m.v[a] * s + m.v[b] * u + m.v[c] * w, y = m.v[a + 1] * s + m.v[b + 1] * u + m.v[c + 1] * w, z = m.v[a + 2] * s + m.v[b + 2] * u + m.v[c + 2] * w;
      const k = at(x, y);
      if (z > top[k]) top[k] = z;
    }
  }
  // Square-window max and min over the cells that have surface, by separable passes.
  const pass = (src: Float64Array, radius: number, pick: (p: number, q: number) => number, empty: number) => {
    const r = Math.round(radius / cell);
    const tmp = new Float64Array(nx * ny).fill(empty), out = new Float64Array(nx * ny).fill(empty);
    for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
      let best = empty;
      for (let d = Math.max(0, x - r); d <= Math.min(nx - 1, x + r); d += 1) { const v = src[d + y * nx]; if (Number.isFinite(v)) best = pick(best, v); }
      tmp[x + y * nx] = best;
    }
    for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
      let best = empty;
      for (let d = Math.max(0, y - r); d <= Math.min(ny - 1, y + r); d += 1) { const v = tmp[x + d * nx]; if (Number.isFinite(v)) best = pick(best, v); }
      out[x + y * nx] = best;
    }
    return out;
  };
  const near = pass(top, 3, Math.max, -Infinity);
  const around = pass(top, 6, Math.min, Infinity);
  const tips = new Float64Array(nx * ny).fill(-Infinity);
  for (let k = 0; k < tips.length; k += 1) {
    if (!Number.isFinite(top[k])) continue;
    if (top[k] >= near[k] - 0.3 && top[k] - around[k] >= 2.5 && top[k] <= ceiling && top[k] >= lowest) tips[k] = top[k];
  }
  if (Number.isFinite(lonely)) {
    // Teeth stand in a row: a group of tips further than `lonely` from every other group, where
    // there are others, is a lump of tissue beside the teeth.
    const groups: number[][] = [];
    const group = new Int32Array(nx * ny).fill(-1);
    for (let k = 0; k < tips.length; k += 1) {
      if (!Number.isFinite(tips[k]) || group[k] >= 0) continue;
      const members: number[] = [];
      const stack = [k];
      group[k] = groups.length;
      while (stack.length) {
        const i = stack.pop()!;
        members.push(i);
        const x = i % nx, y = Math.floor(i / nx);
        for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
          const j = yy * nx + xx;
          if (Number.isFinite(tips[j]) && group[j] < 0) { group[j] = groups.length; stack.push(j); }
        }
      }
      groups.push(members);
    }
    if (groups.length >= 3) {
      const far = groups.map((members, g) => {
        for (let h = 0; h < groups.length; h += 1) {
          if (h === g) continue;
          for (const i of members) for (const j of groups[h]) {
            if (Math.hypot((i % nx) - (j % nx), Math.floor(i / nx) - Math.floor(j / nx)) * cell <= lonely) return false;
          }
        }
        return true;
      });
      groups.forEach((members, g) => { if (far[g]) for (const i of members) tips[i] = -Infinity; });
    }
  }
  if (tipsOut) for (let k = 0; k < tips.length; k += 1) if (Number.isFinite(tips[k])) tipsOut.push([minX + ((k % nx) + 0.5) * cell, minY + (Math.floor(k / nx) + 0.5) * cell, tips[k]]);
  // The highest cusp tip within reach of each cell.
  const reach = pass(tips, reachOut, Math.max, -Infinity);
  const zone = new Uint8Array(m.v.length / 3);
  for (let i = 0; i < zone.length; i += 1) {
    const r = reach[at(m.v[i * 3], m.v[i * 3 + 1])];
    if (Number.isFinite(r) && m.v[i * 3 + 2] > r - crown) zone[i] = 1;
  }
  if (fieldOut) {
    // Build 52: how far inside the zone each corner is (mm; negative outside) - the round distance
    // from the nearest tip against `reachOut`, and the height above `crown` below the tips in reach.
    // Zero runs along the zone's edge, so a smooth cut can follow it.
    const mask = new Uint8Array(nx * ny);
    for (let k = 0; k < mask.length; k += 1) if (Number.isFinite(tips[k])) mask[k] = 1;
    const squared = squaredDistanceTo(mask, nx, ny, 1);
    const wide = pass(tips, reachOut + 4, Math.max, -Infinity);
    for (let i = 0; i < zone.length; i += 1) {
      const k = at(m.v[i * 3], m.v[i * 3 + 1]);
      const across = reachOut - Math.sqrt(squared[k]) * cell;
      const r = wide[k];
      const down = Number.isFinite(r) ? m.v[i * 3 + 2] - (r - crown) : -10;
      fieldOut[i] = Math.min(across, down);
    }
  }
  return zone;
}

/**
 * Smooths the scan's ragged open edge, `rounds` times, leaving the teeth where they are: each edge
 * corner moves towards its two neighbours along the edge (a gentle, shrink-free pass each round).
 */
export function smoothEdge(m: Mesh, rounds: number, keep?: Uint8Array) {
  if (rounds <= 0) return;
  const loops = boundaryLoops(m);
  for (let round = 0; round < rounds; round += 1) {
    for (const factor of [0.5, -0.53]) {
      for (const loop of loops) {
        if (loop.length < 4) continue;
        const moved = loop.map((v, k) => {
          const a = loop[(k + loop.length - 1) % loop.length], b = loop[(k + 1) % loop.length];
          return [0, 1, 2].map((axis) => m.v[v * 3 + axis] + factor * ((m.v[a * 3 + axis] + m.v[b * 3 + axis]) / 2 - m.v[v * 3 + axis]));
        });
        loop.forEach((v, k) => {
          if (keep?.[v]) return;
          for (let axis = 0; axis < 3; axis += 1) m.v[v * 3 + axis] = moved[k][axis];
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Clean base (build 49)

/**
 * The outline of a clean base: the teeth seen from above, grown by `grow` mm and rounded smooth -
 * a horseshoe for a full arch, a rounded bar for a quadrant. Returned as rings (counter-clockwise
 * outlines, clockwise holes), simplified to about 0.05 mm.
 */
/**
 * A closed ring resampled every `spacing` mm and smoothed: each point moved to the average of the
 * points within `window` mm along the ring, `passes` times. Keeps its direction.
 */
export function smoothRing(ring: Ring, spacing: number, window: number, passes: number): Ring {
  const n = ring.length;
  if (n < 3) return ring;
  let length = 0;
  for (let i = 0; i < n; i += 1) { const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n]; length += Math.hypot(bx - ax, by - ay); }
  const count = Math.max(8, Math.round(length / spacing));
  const step = length / count;
  const even: Ring = [];
  let seg = 0, along = 0;
  let [ax, ay] = ring[0], [bx, by] = ring[1 % n];
  let segLength = Math.hypot(bx - ax, by - ay);
  for (let k = 0; k < count; k += 1) {
    const target = k * step;
    while (along + segLength < target && seg < n) {
      along += segLength; seg += 1;
      [ax, ay] = ring[seg % n]; [bx, by] = ring[(seg + 1) % n];
      segLength = Math.hypot(bx - ax, by - ay);
    }
    const t = segLength > 0 ? (target - along) / segLength : 0;
    even.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  const half = Math.max(1, Math.round(window / step / 2));
  let current = even;
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((_, i) => {
      let x = 0, y = 0;
      for (let j = -half; j <= half; j += 1) { const p = current[(i + j + count) % count]; x += p[0]; y += p[1]; }
      return [x / (2 * half + 1), y / (2 * half + 1)] as [number, number];
    });
  }
  return current;
}

/** How far the clean base's outline runs outside the teeth, seen from above (mm). */
export const CLEAN_CLEARANCE = 3;
/**
 * How far a crown reaches from its cusp tips, seen from above (mm). Wider than any crown round its
 * tips (a molar's buccal face bulges about 1 mm past its cusps), narrower than TOOTH_REACH, which
 * also takes in the gum and any flap of tongue or cheek beside the teeth.
 */
export const CROWN_REACH = 4;

export function cleanOutline(runtime: ManifoldRuntime, m: Mesh, teeth: Uint8Array, grow: number, scan?: { mesh: Mesh; crowns: Uint8Array; partial?: boolean }): Ring[] {
  const cell = 0.5;
  const key = (ix: number, iy: number) => (ix + 32768) * 65536 + (iy + 32768);
  // Seen from above, as cells: the teeth, and everything the scan covers (triangles filled in).
  const footprint = (wanted: (t: number) => boolean, mesh: Mesh = m) => {
    const m = mesh;
    const cells = new Set<number>();
    for (let t = 0; t < m.f.length; t += 3) {
      if (!wanted(t)) continue;
      const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
      const steps = Math.min(20, Math.ceil(Math.max(Math.abs(m.v[a] - m.v[b]), Math.abs(m.v[a] - m.v[c]), Math.abs(m.v[a + 1] - m.v[b + 1]), Math.abs(m.v[a + 1] - m.v[c + 1])) / cell));
      for (let i = 0; i <= steps; i += 1) for (let j = 0; i + j <= steps; j += 1) {
        const u = steps ? i / steps : 0, w = steps ? j / steps : 0, s = 1 - u - w;
        cells.add(key(Math.floor((m.v[a] * s + m.v[b] * u + m.v[c] * w) / cell), Math.floor((m.v[a + 1] * s + m.v[b + 1] * u + m.v[c + 1] * w) / cell)));
      }
    }
    const squares: Ring[] = [];
    cells.forEach((k) => {
      const x = (Math.floor(k / 65536) - 32768) * cell, y = ((k % 65536) - 32768) * cell;
      squares.push([[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell]]);
    });
    return new runtime.CrossSection(squares, "Positive");
  };
  const toothCells = footprint((t) => Boolean(teeth[m.f[t]] && teeth[m.f[t + 1]] && teeth[m.f[t + 2]]));
  if (toothCells.isEmpty()) { toothCells.delete(); return []; }
  const scanCells = footprint(() => true);
  const made: Array<{ delete: () => void }> = [toothCells, scanCells];
  const keep = <T extends { delete: () => void }>(section: T) => { made.push(section); return section; };
  // Build 50: the outline is drawn round the teeth, as a model builder draws it - a smooth band
  // CLEAN_CLEARANCE outside them, the gaps between teeth bridged - and kept inside the scan as kept,
  // so the wall rises until it meets the scan's own gum and its top edge follows the gum. The scan's
  // ragged edge, flaps of tongue or cheek and the curtain closing them down are cut away outside it.
  void grow;
  // Build 51 (back to build 49's way): the scan as kept, cut flat at the gum line, seen from above
  // and 0.6 mm inside its edge - so the outline runs through the scan where it comes down to the
  // cut and the wall's top meets the scan cleanly. Gaps under 3 mm between pieces are bridged and
  // jags under 2 mm rounded off. Then the line itself is smoothed (evenly spaced points averaged
  // with their neighbours), so the wall turns gently instead of in rows of tiny faces. The teeth -
  // within TOOTH_REACH of every cusp tip - always stay inside, with 1 mm to spare.
  void grow; void scan;
  const teethShape = keep(keep(toothCells.offset(2, "Round", 2, 32)).offset(-1, "Round", 2, 32));
  const scanShape = keep(keep(scanCells.offset(1, "Round", 2, 24)).offset(-1.6, "Round", 2, 24));
  const bridged = keep(keep(scanShape.offset(3, "Round", 2, 48)).offset(-3, "Round", 2, 48));
  const opened = keep(keep(bridged.offset(-2, "Round", 2, 48)).offset(2, "Round", 2, 48));
  const evened = opened.toPolygons().map((polygon) => smoothRing(polygon.map(([x, y]) => [x, y] as [number, number]), 0.4, 2, 4)).filter((ring) => ring.length >= 3);
  // Smoothing rounds the line a little inwards on convex turns; it stays inside the scan as before.
  const evenedSection = keep(runtime.CrossSection.intersection(keep(new runtime.CrossSection(evened, "EvenOdd")), opened));
  const smooth = keep(keep(runtime.CrossSection.union(evenedSection, teethShape)).simplify(0.002));
  const rings = smooth.toPolygons().map((polygon) => polygon.map(([x, y]) => [x, y] as [number, number]));
  made.forEach((section) => section.delete());
  // Specks (under 4 mm²) go.
  return rings.filter((ring) => Math.abs(ringArea(ring)) >= 4);
}

function ringArea(ring: Ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** Rings (as cleanOutline gives them) extruded between two heights. */
export function prismOf(runtime: ManifoldRuntime, rings: Ring[], bottom: number, top: number): ManifoldSolid {
  const section = new runtime.CrossSection(rings, "Positive");
  const solid = section.extrude(top - bottom).translate([0, 0, bottom]);
  section.delete();
  return solid;
}

// ---------------------------------------------------------------------------------------------
// Finishing a clean base (build 50): locator notches, a tie bar, an articulator plate block

/** Half-round notches at the foot of the wall: radius and height, mm. */
export const NOTCH_RADIUS = 1.5;
export const NOTCH_HEIGHT = 2;

function ringCentroid(ring: Ring): [number, number] {
  let x = 0, y = 0;
  ring.forEach(([px, py]) => { x += px; y += py; });
  return [x / ring.length, y / ring.length];
}

/** Where a ray from `from` at `angle` degrees last leaves the ring, or null. */
function rayExit(ring: Ring, from: [number, number], angle: number): [number, number] | null {
  const dx = Math.cos((angle * Math.PI) / 180), dy = Math.sin((angle * Math.PI) / 180);
  let best = -Infinity;
  for (let n = 0; n < ring.length; n += 1) {
    const [ax, ay] = ring[n], [bx, by] = ring[(n + 1) % ring.length];
    const ex = bx - ax, ey = by - ay;
    const det = dx * -ey - dy * -ex;
    if (Math.abs(det) < 1e-12) continue;
    const wx = ax - from[0], wy = ay - from[1];
    const t = (wx * -ey - wy * -ex) / det, u = (dx * wy - dy * wx) / det;
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
  }
  return Number.isFinite(best) ? [from[0] + dx * best, from[1] + dy * best] : null;
}

/**
 * Half-round notches cut into the foot of the outer wall - at the front and either side (front at
 * -y) - which a lab uses to seat the model the same way each time.
 */
export function locatorNotches(runtime: ManifoldRuntime, outer: Ring, floor: number): ManifoldSolid {
  const centre = ringCentroid(outer);
  const cuts: ManifoldSolid[] = [];
  for (const angle of [-90, -30, -150, 20, 160]) {
    const at = rayExit(outer, centre, angle);
    if (!at) continue;
    cuts.push(runtime.Manifold.cylinder(NOTCH_HEIGHT + 0.01, NOTCH_RADIUS, NOTCH_RADIUS, 32).translate([at[0], at[1], floor - 0.01]));
  }
  if (!cuts.length) return runtime.Manifold.cube([0.001, 0.001, 0.001]).translate([1e6, 1e6, 1e6]);
  const all = runtime.Manifold.union(cuts);
  cuts.forEach((cut) => cut.delete());
  return all;
}

/** The tie bar's cross-section, mm. */
export const TIE_BAR_WIDTH = 3;
export const TIE_BAR_HEIGHT = 3;

/**
 * A bar across the back of a horseshoe arch (front at -y), joining its two ends at the floor, so the
 * arch cannot spread or warp while it prints. Snapped or cut off afterwards. Null when the outline
 * is not a horseshoe (a quadrant, or an arch with a palate).
 */
export function tieBar(runtime: ManifoldRuntime, outer: Ring, floor: number): ManifoldSolid | null {
  let maxY = -Infinity, minY = Infinity;
  outer.forEach(([, y]) => { maxY = Math.max(maxY, y); minY = Math.min(minY, y); });
  const backY = maxY - Math.min(8, (maxY - minY) * 0.15);
  const [cx] = ringCentroid(outer);
  // Where the line across the back crosses the outline: a horseshoe crosses it four times.
  const xs: number[] = [];
  for (let n = 0; n < outer.length; n += 1) {
    const [ax, ay] = outer[n], [bx, by] = outer[(n + 1) % outer.length];
    if ((ay <= backY) !== (by <= backY)) xs.push(ax + ((backY - ay) / (by - ay)) * (bx - ax));
  }
  xs.sort((p, q) => p - q);
  if (xs.length < 4 || !(xs[1] < cx && xs[2] > cx)) return null;
  const from = (xs[0] + xs[1]) / 2, to = (xs[xs.length - 2] + xs[xs.length - 1]) / 2;
  return runtime.Manifold.cube([to - from, TIE_BAR_WIDTH, TIE_BAR_HEIGHT]).translate([from, backY - TIE_BAR_WIDTH / 2, floor]);
}

/** The block of an articulator plate base: the outline's box, 2 mm clear, its corners cut at 45°. */
export function articulatorOutline(rings: Ring[]): Ring {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  minX -= 2; minY -= 2; maxX += 2; maxY += 2;
  const c = Math.min(8, (maxX - minX) / 4, (maxY - minY) / 4);
  return [[minX + c, minY], [maxX - c, minY], [maxX, minY + c], [maxX, maxY - c], [maxX - c, maxY], [minX + c, maxY], [minX, maxY - c], [minX, minY + c]];
}

/** Square pockets in the block's underside, for the magnetic plate: size, rib and depth, mm. */
export const POCKET_SIZE = 4;
export const POCKET_RIB = 1.6;
export const POCKET_DEPTH = 2;

/** The pockets in a grid inside the block's outline, 3 mm in from its edge. */
export function articulatorPockets(runtime: ManifoldRuntime, plate: Ring, floor: number): ManifoldSolid {
  const outline = new runtime.CrossSection([plate], "Positive");
  const inside = outline.offset(-3, "Miter");
  outline.delete();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of plate) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const step = POCKET_SIZE + POCKET_RIB;
  const squares: Ring[] = [];
  for (let y = minY; y + POCKET_SIZE <= maxY; y += step) for (let x = minX; x + POCKET_SIZE <= maxX; x += step) {
    squares.push([[x, y], [x + POCKET_SIZE, y], [x + POCKET_SIZE, y + POCKET_SIZE], [x, y + POCKET_SIZE]]);
  }
  const grid = new runtime.CrossSection(squares, "Positive");
  // Whole squares only: those that lie inside the inset outline.
  const kept = squares.filter((square) => {
    const one = new runtime.CrossSection([square], "Positive");
    const within = runtime.CrossSection.intersection(one, inside);
    const whole = within.area() >= one.area() * 0.999;
    one.delete(); within.delete();
    return whole;
  });
  grid.delete(); inside.delete();
  const section = new runtime.CrossSection(kept.length ? kept : [[[0, 0], [0.001, 0], [0.001, 0.001]]], "Positive");
  const pockets = section.extrude(POCKET_DEPTH + 0.01).translate([0, 0, floor - 0.01]);
  section.delete();
  return pockets;
}

// ---------------------------------------------------------------------------------------------
// Honeycomb inside a hollow model (build 49)

/** Honeycomb cells (across the flats) and their walls, mm. */
export const HONEYCOMB_CELL = 6;
export const HONEYCOMB_WALL = 0.8;
/** Slots through the foot of every wall, so the cells drain into one another (resin), mm high. */
export const HONEYCOMB_SLOT = 1.2;
/** A honeycomb in the base only rises this far above the floor (mm). */
export const HONEYCOMB_BASE_HEIGHT = 6;

/**
 * Hexagonal walls filling a model's cavity: they stand on the floor and carry the shell, so a hollow
 * model is as stiff as a solid one for a fraction of the material. Slots at the foot of each wall
 * join the cells, so resin drains through the model's vents (or the open bottom). Returns what to
 * take out of the solid in place of the cavity.
 */
export function honeycombIn(runtime: ManifoldRuntime, cavity: ManifoldSolid, floor: number, open = false, upTo = Infinity): ManifoldSolid {
  const box = cavity.boundingBox();
  const [x0, y0, z0] = box.min, [x1, y1, z1] = box.max;
  const across = HONEYCOMB_CELL, radius = across / Math.sqrt(3); // hexagon with flats `across` apart
  const stepX = across, stepY = radius * 1.5;
  const hole = (cx: number, cy: number): Ring => {
    const r = radius - HONEYCOMB_WALL / Math.sqrt(3);
    return Array.from({ length: 6 }, (_, k) => {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
    });
  };
  const holes: Ring[] = [];
  let row = 0;
  for (let y = y0 - radius; y <= y1 + radius; y += stepY, row += 1) {
    for (let x = x0 - across + (row % 2 ? across / 2 : 0); x <= x1 + across; x += stepX) holes.push(hole(x, y));
  }
  const frame: Ring = [[x0 - 2 * across, y0 - 2 * across], [x1 + 2 * across, y0 - 2 * across], [x1 + 2 * across, y1 + 2 * across], [x0 - 2 * across, y1 + 2 * across]];
  // Holes run clockwise inside the counter-clockwise frame.
  const section = new runtime.CrossSection([frame, ...holes.map((ring) => ring.slice().reverse())], "EvenOdd");
  // In the base only: the walls stop `upTo`, and the cavity above is left empty.
  const wallTop = Math.min(z1 + 1, upTo);
  const walls = section.extrude(Math.max(0.1, wallTop - (z0 - 1))).translate([0, 0, z0 - 1]);
  section.delete();
  // What is taken out of the solid: the cavity less the walls, so the walls are never joined on
  // (faces lying on faces would pinch), plus drain slots - low bars both ways across the floor.
  const cells = runtime.Manifold.difference(cavity, walls);
  walls.delete();
  const bars: ManifoldSolid[] = [];
  const low = Math.max(floor, z0) - 0.01;
  // Build 50: narrow slots close together, so every wall has two or three at its foot.
  for (let x = x0 + stepX / 8; x <= x1; x += stepX / 3) bars.push(runtime.Manifold.cube([0.7, y1 - y0 + 2, HONEYCOMB_SLOT + 0.01]).translate([x, y0 - 1, low]));
  for (let y = y0 + stepY / 5; y <= y1; y += stepY / 2) bars.push(runtime.Manifold.cube([x1 - x0 + 2, 0.7, HONEYCOMB_SLOT + 0.01]).translate([x0 - 1, y, low]));
  // Open underneath, every cell drains through the bottom already.
  if (open || !bars.length) { bars.forEach((bar) => bar.delete()); return cells; }
  const slots = runtime.Manifold.union(bars);
  bars.forEach((bar) => bar.delete());
  const slotsInside = runtime.Manifold.intersection(slots, cavity);
  slots.delete();
  const taken = runtime.Manifold.union(cells, slotsInside);
  cells.delete();
  slotsInside.delete();
  return taken;
}
