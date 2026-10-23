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
export function closeToFloor(m: Mesh, floor: number, maxRounds = 400, teeth?: Uint8Array): ClosedArch {
  const faces = m.f.length / 3;
  const alive = new Uint8Array(faces).fill(1);
  // Triangles on the teeth are never worn away: what blocks a wall under them goes instead. The
  // ragged fringe right at the scan's edge (EDGE_FRINGE) may still go, even beside a tooth.
  const guarded = new Uint8Array(faces);
  if (teeth) {
    const fromEdge = distanceFromEdge(m, EDGE_FRINGE);
    const kept = (v: number) => teeth[v] && fromEdge[v] > EDGE_FRINGE;
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
  dropFragments(compact, 0.05);
  dropInverted(compact);
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
export const HINGE_CLEARANCE = 0.3;

const box = (runtime: ManifoldRuntime, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  runtime.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);

const axleAlongX = (runtime: ManifoldRuntime, radius: number, x0: number, x1: number, y: number, z: number) =>
  runtime.Manifold.cylinder(x1 - x0, radius, radius, 48).rotate([0, 90, 0]).translate([x0, y, z]);

/**
 * A snap-on hinge in the pair's frame (occlusal plane z = 0, back +y): a bar along the back of each
 * base, two posts carrying an axle on the lower, and a clip on the upper that snaps over the axle
 * between them. The axle lies 6 mm behind `back`, in the occlusal plane.
 */
export function hingeParts(runtime: ManifoldRuntime, back: number, xMin: number, xMax: number, floorUpper: number, floorLower: number) {
  const r = HINGE_AXLE_RADIUS, bore = r + HINGE_CLEARANCE;
  const ay = back + 6;
  const half = Math.max(14, Math.min(-xMin, xMax));
  const made: ManifoldSolid[] = [];
  const keep = <T extends ManifoldSolid>(solid: T) => { made.push(solid); return solid; };
  const lowerBar = keep(box(runtime, -half, half, back - 4, back + 10, floorLower, floorLower + 4));
  const postL = keep(box(runtime, -13, -5.5, back + 2, back + 10, floorLower, r + 2.5));
  const postR = keep(box(runtime, 5.5, 13, back + 2, back + 10, floorLower, r + 2.5));
  const axle = keep(axleAlongX(runtime, r, -13, 13, ay, 0));
  const lower = runtime.Manifold.union([lowerBar, postL, postR, axle]);
  const upperBar = keep(box(runtime, -half, half, back - 4, back + 10, floorUpper - 4, floorUpper));
  const clipBlock = keep(box(runtime, -4.8, 4.8, back + 2, back + 10, -(bore + 1.8), floorUpper));
  const joined = keep(runtime.Manifold.union(upperBar, clipBlock));
  const hole = keep(axleAlongX(runtime, bore, -6, 6, ay, 0));
  const slot = keep(box(runtime, -6, 6, ay - 1.7, ay + 1.7, -(bore + 3), 0));
  const upper = runtime.Manifold.difference(joined, runtime.Manifold.union(hole, slot));
  made.forEach((solid) => solid.delete());
  return { upper, lower };
}

// ---------------------------------------------------------------------------------------------
// The teeth

/** How far below its own cusp tips a tooth is protected, mm: crowns run 7 to 11 mm. */
export const TOOTH_CROWN = 10;
/** How far out from a cusp tip, seen from above, a tooth's surface reaches, mm. */
export const TOOTH_REACH = 5.5;

/**
 * Which vertices of an arch (teeth up) are teeth: within TOOTH_REACH of a cusp tip seen from above
 * and no more than TOOTH_CROWN below it. Cusp tips are found on the scan's top surface as points
 * that are the highest within 3 mm and stand at least 2.5 mm above the surface within 6 mm - which a
 * cheek flap, the palate or the floor of the mouth never do. Measured locally, so a tilted or curved
 * arch and a quadrant are covered alike.
 */
export function toothZone(m: Mesh): Uint8Array {
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
    if (top[k] >= near[k] - 0.3 && top[k] - around[k] >= 2.5) tips[k] = top[k];
  }
  // The highest cusp tip within reach of each cell.
  const reach = pass(tips, TOOTH_REACH, Math.max, -Infinity);
  const zone = new Uint8Array(m.v.length / 3);
  for (let i = 0; i < zone.length; i += 1) {
    const r = reach[at(m.v[i * 3], m.v[i * 3 + 1])];
    if (Number.isFinite(r) && m.v[i * 3 + 2] > r - TOOTH_CROWN) zone[i] = 1;
  }
  return zone;
}
