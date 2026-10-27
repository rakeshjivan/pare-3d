/**
 * Fork (build 47): mesh helpers for Dental Studio - an indexed mesh welded from a triangle soup,
 * its open edges, cuts, fills, and the bridge to Manifold. Z-up millimetres throughout.
 */
import * as THREE from "three";
import type { ManifoldToplevel } from "manifold-3d";
import { weldedVertexIds } from "@/lib/meshComponents";

export type Mesh = { v: number[]; f: number[] };
export type Ring = Array<[number, number]>;
export type ManifoldRuntime = ManifoldToplevel;
export type ManifoldSolid = InstanceType<ManifoldToplevel["Manifold"]>;

export function weld(positions: ArrayLike<number>, tolerance = 1e-4): Mesh {
  const count = Math.floor(positions.length / 3);
  const points: Float64Array[] = new Array(count);
  const flat = Float64Array.from(positions as ArrayLike<number>);
  for (let i = 0; i < count; i += 1) points[i] = flat.subarray(i * 3, i * 3 + 3);
  const ids = weldedVertexIds(points, tolerance);
  let vertexCount = 0;
  for (let i = 0; i < count; i += 1) vertexCount = Math.max(vertexCount, ids[i] + 1);
  const v = new Array<number>(vertexCount * 3);
  for (let i = 0; i < count; i += 1) {
    const id = ids[i];
    v[id * 3] = flat[i * 3];
    v[id * 3 + 1] = flat[i * 3 + 1];
    v[id * 3 + 2] = flat[i * 3 + 2];
  }
  const f: number[] = [];
  const seen = new Map<number, number[]>();
  for (let t = 0; t + 2 < count; t += 3) {
    const a = ids[t], b = ids[t + 1], c = ids[t + 2];
    if (a === b || b === c || a === c) continue;
    // A doubled triangle: the same three corners, looked up by its two lowest corners.
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
    const key = lo * 4294967296 + mid;
    const list = seen.get(key);
    if (list) {
      if (list.includes(hi)) continue;
      list.push(hi);
    } else seen.set(key, [hi]);
    f.push(a, b, c);
  }
  return { v, f };
}

export function edgeKey(a: number, b: number) {
  return a < b ? a * 4194304 + b : b * 4194304 + a;
}

export function faceArea(m: Mesh, t: number) {
  const a = m.f[t * 3] * 3, b = m.f[t * 3 + 1] * 3, c = m.f[t * 3 + 2] * 3;
  const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1], uz = m.v[b + 2] - m.v[a + 2];
  const wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1], wz = m.v[c + 2] - m.v[a + 2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

/** Drops the triangles on an edge used by more than two triangles. */
export function dropNonManifold(m: Mesh): number {
  const counts = new Map<number, number>();
  const faces = m.f.length / 3;
  for (let t = 0; t < faces; t += 1) for (let k = 0; k < 3; k += 1) {
    const key = edgeKey(m.f[t * 3 + k], m.f[t * 3 + ((k + 1) % 3)]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const kept: number[] = [];
  let dropped = 0;
  for (let t = 0; t < faces; t += 1) {
    let bad = false;
    for (let k = 0; k < 3 && !bad; k += 1) bad = (counts.get(edgeKey(m.f[t * 3 + k], m.f[t * 3 + ((k + 1) % 3)])) ?? 0) > 2;
    if (bad) dropped += 1;
    else kept.push(m.f[t * 3], m.f[t * 3 + 1], m.f[t * 3 + 2]);
  }
  m.f = kept;
  return dropped;
}

/** Keeps the pieces at least `share` of the biggest piece's area; returns how many went. */
/** Drops pieces under `share` of the biggest by area - never one holding a `spare` vertex (a tooth). */
export function dropFragments(m: Mesh, share: number, spare?: Uint8Array): number {
  const faces = m.f.length / 3;
  if (faces === 0) return 0;
  const parent = new Int32Array(m.v.length / 3);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (start: number) => {
    let a = start;
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let t = 0; t < faces; t += 1) {
    const a = find(m.f[t * 3]);
    const b = find(m.f[t * 3 + 1]);
    if (a !== b) parent[b] = a;
    const c = find(m.f[t * 3 + 2]);
    const r = find(a);
    if (c !== r) parent[c] = r;
  }
  const area = new Map<number, number>();
  for (let t = 0; t < faces; t += 1) {
    const root = find(m.f[t * 3]);
    area.set(root, (area.get(root) ?? 0) + faceArea(m, t));
  }
  const biggest = Math.max(...area.values());
  const keep = new Set([...area.entries()].filter(([, a]) => a >= biggest * share).map(([root]) => root));
  // A piece of tooth stays, if it is more than a speck (2 mm²): a speck cannot stand as a solid.
  if (spare) for (let i = 0; i < m.f.length; i += 1) if (spare[m.f[i]] && (area.get(find(m.f[i])) ?? 0) >= 2) keep.add(find(m.f[i]));
  const kept: number[] = [];
  for (let t = 0; t < faces; t += 1) if (keep.has(find(m.f[t * 3]))) kept.push(m.f[t * 3], m.f[t * 3 + 1], m.f[t * 3 + 2]);
  m.f = kept;
  return area.size - keep.size;
}

/**
 * Drops the pieces that face down on the whole (a flap folded over, its outside towards the plate),
 * keeping the biggest piece whatever it does. Returns how many went.
 */
export function dropInverted(m: Mesh, spare?: Uint8Array): number {
  const faces = m.f.length / 3;
  if (faces === 0) return 0;
  const parent = new Int32Array(m.v.length / 3);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (start: number) => {
    let a = start;
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  for (let t = 0; t < faces; t += 1) {
    const a = find(m.f[t * 3]);
    for (let k = 1; k < 3; k += 1) { const b = find(m.f[t * 3 + k]); if (a !== b) parent[b] = a; }
  }
  const up = new Map<number, number>(), area = new Map<number, number>();
  for (let t = 0; t < faces; t += 1) {
    const root = find(m.f[t * 3]);
    const a = m.f[t * 3] * 3, b = m.f[t * 3 + 1] * 3, c = m.f[t * 3 + 2] * 3;
    const cross = (m.v[b] - m.v[a]) * (m.v[c + 1] - m.v[a + 1]) - (m.v[b + 1] - m.v[a + 1]) * (m.v[c] - m.v[a]);
    up.set(root, (up.get(root) ?? 0) + cross);
    area.set(root, (area.get(root) ?? 0) + faceArea(m, t));
  }
  let biggest = -1, most = -1;
  area.forEach((value, root) => { if (value > most) { most = value; biggest = root; } });
  const drop = new Set([...up.entries()].filter(([root, value]) => value < 0 && root !== biggest).map(([root]) => root));
  if (spare) for (let i = 0; i < m.f.length; i += 1) if (spare[m.f[i]]) drop.delete(find(m.f[i]));
  if (!drop.size) return 0;
  const kept: number[] = [];
  for (let t = 0; t < faces; t += 1) if (!drop.has(find(m.f[t * 3]))) kept.push(m.f[t * 3], m.f[t * 3 + 1], m.f[t * 3 + 2]);
  m.f = kept;
  return drop.size;
}

/**
 * The open edges as closed loops of vertex indices, each in the direction its triangles run along
 * it (a triangle's edge a->b on the boundary gives a->b in the loop).
 */
export function boundaryLoops(m: Mesh): number[][] {
  const faces = m.f.length / 3;
  // Build 68: a typed table, not a Map - this ran over every edge of the scan several times a model.
  const directed = new KeyTable(faces * 2);
  for (let t = 0; t < faces; t += 1) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
    directed.add(edgeKey(a, b));
  }
  const next = new Map<number, number[]>();
  for (let t = 0; t < faces; t += 1) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
    if (directed.get(edgeKey(a, b)) !== 1) continue;
    const list = next.get(a);
    if (list) list.push(b);
    else next.set(a, [b]);
  }
  const loops: number[][] = [];
  for (const start of [...next.keys()]) {
    for (;;) {
      const outs = next.get(start);
      if (!outs || outs.length === 0) break;
      const loop: number[] = [start];
      let current = outs.pop()!;
      let guard = 0;
      while (current !== start && guard < 10_000_000) {
        loop.push(current);
        const more = next.get(current);
        if (!more || more.length === 0) break;
        current = more.pop()!;
        guard += 1;
      }
      if (current === start && loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

export function loopLength(m: Mesh, loop: number[]) {
  let total = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i] * 3, b = loop[(i + 1) % loop.length] * 3;
    total += Math.hypot(m.v[a] - m.v[b], m.v[a + 1] - m.v[b + 1], m.v[a + 2] - m.v[b + 2]);
  }
  return total;
}

/** Closes a hole with a fan from its centre; the new triangles run the other way round the edge. */
export function fillLoop(m: Mesh, loop: number[]) {
  let cx = 0, cy = 0, cz = 0;
  for (const i of loop) {
    cx += m.v[i * 3];
    cy += m.v[i * 3 + 1];
    cz += m.v[i * 3 + 2];
  }
  const centre = m.v.length / 3;
  m.v.push(cx / loop.length, cy / loop.length, cz / loop.length);
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    m.f.push(b, a, centre);
  }
}

/** Unit normal of the best-fit plane through points (smallest eigenvector of their covariance). */
export function planeNormal(points: number[][]): [number, number, number] {
  const n = points.length;
  const c = [0, 0, 0];
  points.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
  c[0] /= n; c[1] /= n; c[2] /= n;
  const a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach((p) => {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) a[i][j] += d[i] * d[j];
  });
  // Jacobi rotations on the symmetric 3x3 matrix.
  const vecs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep += 1) {
    let off = 0;
    for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) off += a[i][j] * a[i][j];
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p += 1) for (let q = p + 1; q < 3; q += 1) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k += 1) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = cs * akp - sn * akq;
        a[k][q] = sn * akp + cs * akq;
      }
      for (let k = 0; k < 3; k += 1) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = cs * apk - sn * aqk;
        a[q][k] = sn * apk + cs * aqk;
      }
      for (let k = 0; k < 3; k += 1) {
        const vkp = vecs[k][p], vkq = vecs[k][q];
        vecs[k][p] = cs * vkp - sn * vkq;
        vecs[k][q] = sn * vkp + cs * vkq;
      }
    }
  }
  let smallest = 0;
  for (let i = 1; i < 3; i += 1) if (a[i][i] < a[smallest][smallest]) smallest = i;
  const normal: [number, number, number] = [vecs[0][smallest], vecs[1][smallest], vecs[2][smallest]];
  const length = Math.hypot(...normal) || 1;
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

export function rotateOnto(m: Mesh, from: [number, number, number], to: [number, number, number]) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...from), new THREE.Vector3(...to));
  const p = new THREE.Vector3();
  for (let i = 0; i < m.v.length; i += 3) {
    p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyQuaternion(q);
    m.v[i] = p.x;
    m.v[i + 1] = p.y;
    m.v[i + 2] = p.z;
  }
}

export function soup(m: Mesh): Float32Array {
  const out = new Float32Array(m.f.length * 3);
  for (let i = 0; i < m.f.length; i += 1) {
    const base = m.f[i] * 3;
    out[i * 3] = m.v[base];
    out[i * 3 + 1] = m.v[base + 1];
    out[i * 3 + 2] = m.v[base + 2];
  }
  return out;
}

/** Sum of z-normal times area: positive when the surface faces up on the whole. */
export function upwardness(m: Mesh) {
  let total = 0;
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
    const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1];
    const wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1];
    total += ux * wy - uy * wx;
  }
  return total;
}

export function cutBelow(m: Mesh, level: number): Mesh {
  const v = m.v.slice();
  for (let i = 2; i < v.length; i += 3) if (Math.abs(v[i] - level) < 1e-7) v[i] = level;
  const f: number[] = [];
  const made = new Map<number, number>();
  const cutPoint = (a: number, b: number) => {
    const key = edgeKey(a, b);
    const found = made.get(key);
    if (found !== undefined) return found;
    const za = v[a * 3 + 2], zb = v[b * 3 + 2];
    const s = (level - za) / (zb - za);
    const id = v.length / 3;
    v.push(v[a * 3] + (v[b * 3] - v[a * 3]) * s, v[a * 3 + 1] + (v[b * 3 + 1] - v[a * 3 + 1]) * s, level);
    made.set(key, id);
    return id;
  };
  for (let t = 0; t < m.f.length; t += 3) {
    const tri = [m.f[t], m.f[t + 1], m.f[t + 2]];
    const above = tri.map((i) => v[i * 3 + 2] >= level);
    const count = above.filter(Boolean).length;
    if (count === 3) {
      f.push(...tri);
      continue;
    }
    if (count === 0) continue;
    // Walk the triangle's edges, keeping the part above and the crossings, in order.
    const poly: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const aa = above[k], bb = above[(k + 1) % 3];
      if (aa) poly.push(a);
      if (aa !== bb) {
        const za = v[a * 3 + 2], zb = v[b * 3 + 2];
        // A corner exactly on the plane is the crossing itself.
        if (aa && za === level) continue;
        if (bb && zb === level) continue;
        poly.push(cutPoint(a, b));
      }
    }
    for (let k = 1; k + 1 < poly.length; k += 1) {
      const a = poly[0], b = poly[k], c = poly[k + 1];
      if (a !== b && b !== c && a !== c) f.push(a, b, c);
    }
  }
  return { v, f };
}

export function pointInPolygon(x: number, y: number, poly: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function signedArea(poly: Array<[number, number]>) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) s += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return s / 2;
}

/**
 * Closes a cut scan: vertical walls from every open edge straight down to z = floor, and the floor.
 * The edges' outlines seen from above must not cross themselves or each other, and no part of the
 * scan may lie under an edge (closeToFloor in dentalBase sees to both).
 */
export function closeWithBase(m: Mesh, floor: number): { mesh: Mesh; outline: Ring[] } {
  const loops = boundaryLoops(m);
  if (loops.length === 0) throw new Error("The cut left no open edge to build the base from");
  const v = m.v.slice();
  const f = m.f.slice();
  const below = new Map<number, number>();
  const down = (i: number) => {
    const found = below.get(i);
    if (found !== undefined) return found;
    const id = v.length / 3;
    v.push(m.v[i * 3], m.v[i * 3 + 1], floor);
    below.set(i, id);
    return id;
  };
  const rings = loops.map((loop) => loop.map((i) => [m.v[i * 3], m.v[i * 3 + 1]] as [number, number]));
  // Walls: the scan runs a->b along its edge, the wall b->a, then down.
  loops.forEach((loop) => {
    for (let k = 0; k < loop.length; k += 1) {
      const a = loop[k], b = loop[(k + 1) % loop.length];
      const a2 = down(a), b2 = down(b);
      f.push(b, a, a2, b, a2, b2);
    }
  });
  // Floor: an outline runs round the way the biggest loop does, a hole (the palate's opening) the
  // other way and goes in the smallest outline around it. Judged by direction, not by nesting: a
  // separate piece above the main one, seen from above, is an outline of its own, not a hole.
  const signed = rings.map((ring) => signedArea(ring));
  const areas = signed.map((value) => Math.abs(value));
  const biggest = areas.indexOf(Math.max(...areas));
  const outward = Math.sign(signed[biggest]) || 1;
  const isOutline = signed.map((value) => Math.sign(value) === outward);
  const holeOf = rings.map((ring, j) => {
    if (isOutline[j]) return -1;
    let best = -1;
    rings.forEach((other, i) => { if (isOutline[i] && areas[i] > areas[j] && pointInPolygon(ring[0][0], ring[0][1], other) && (best < 0 || areas[i] < areas[best])) best = i; });
    return best;
  });
  rings.forEach((ring, i) => {
    if (!isOutline[i]) return;
    const holes = rings.map((_, j) => j).filter((j) => holeOf[j] === i);
    const contour = ring.map(([x, y]) => new THREE.Vector2(x, y));
    const holeVectors = holes.map((j) => rings[j].map(([x, y]) => new THREE.Vector2(x, y)));
    const ids = [...loops[i].map(down), ...holes.flatMap((j) => loops[j].map(down))];
    const faces = THREE.ShapeUtils.triangulateShape(contour, holeVectors);
    // The floor runs against its walls: the walls run along the bottom edge in the loop's direction,
    // so the floor runs the other way. Decided once for the whole floor (slivers along a straight
    // edge have no winding of their own).
    let total = 0;
    for (const [p, q, r] of faces) {
      const a = ids[p], b = ids[q], c = ids[r];
      total += (v[b * 3] - v[a * 3]) * (v[c * 3 + 1] - v[a * 3 + 1]) - (v[b * 3 + 1] - v[a * 3 + 1]) * (v[c * 3] - v[a * 3]);
    }
    const loopTurnsLeft = signedArea(ring) > 0;
    for (const [p, q, r] of faces) {
      if ((total > 0) === loopTurnsLeft) f.push(ids[p], ids[r], ids[q]);
      else f.push(ids[p], ids[q], ids[r]);
    }
  });
  patchOpenEdges(f);
  return { mesh: { v, f }, outline: rings };
}

/**
 * Where the floor's triangulation left gaps (an outline touching or crossing itself where a corner
 * of the teeth could not be worn back), each gap is closed by a fan, so the solid is closed.
 */
export function patchOpenEdges(f: number[]) {
  const uses = new Map<number, number>();
  for (let t = 0; t < f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const key = edgeKey(f[t + k], f[t + ((k + 1) % 3)]);
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  // The edges a patch must run along: the reverse of each edge used once.
  const next = new Map<number, number[]>();
  for (let t = 0; t < f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = f[t + k], b = f[t + ((k + 1) % 3)];
    if (uses.get(edgeKey(a, b)) !== 1) continue;
    const list = next.get(b);
    if (list) list.push(a);
    else next.set(b, [a]);
  }
  for (const start of [...next.keys()]) {
    while ((next.get(start) ?? []).length) {
      const cycle = [start];
      let at = next.get(start)!.pop()!;
      let guard = 0;
      while (at !== start && guard < 100000) {
        cycle.push(at);
        const list = next.get(at);
        if (!list || !list.length) break;
        at = list.pop()!;
        guard += 1;
      }
      if (at !== start || cycle.length < 3) continue;
      for (let k = 1; k + 1 < cycle.length; k += 1) f.push(cycle[0], cycle[k], cycle[k + 1]);
    }
  }
}

/** Convex hull of 2D points (monotone chain), counter-clockwise. */
export function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function toManifold(runtime: ManifoldRuntime, m: Mesh): ManifoldSolid {
  // Points made twice (a cut point and a wall point at the same place) are joined first.
  const welded = weld(soup(m), 1e-6);
  const mesh = new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(welded.v), triVerts: new Uint32Array(welded.f) });
  let solid: ManifoldSolid;
  try {
    solid = new runtime.Manifold(mesh);
  } catch {
    // Open edges whose ends lie at the same places (a split corner, a gap closed by a fan) are joined.
    mesh.merge();
    solid = new runtime.Manifold(mesh);
  }
  if (solid.status() !== "NoError") throw new Error(`The model did not close into a solid (${solid.status()})`);
  return solid;
}

/**
 * Build 61: which corners are the same point, as 32-bit floats (as an STL file holds them; -0 is 0):
 * an id for each corner, numbered in the order points first appear. A hash table on the floats'
 * bits, in place of a string per corner - the same answer, many times faster.
 */
export function samePointIds(coords: Float32Array): { ids: Int32Array; count: number } {
  const n = Math.floor(coords.length / 3);
  let cap = 1;
  while (cap < n * 2) cap <<= 1;
  const mask = cap - 1;
  const slot = new Int32Array(cap).fill(-1);
  const slotId = new Int32Array(cap);
  const ids = new Int32Array(n);
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  const bits = (v: number) => { f[0] = v + 0; return u[0]; };
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const x = coords[i * 3], y = coords[i * 3 + 1], z = coords[i * 3 + 2];
    let h = Math.imul(bits(x), 0x9e3779b1) ^ Math.imul(bits(y), 0x85ebca77) ^ Math.imul(bits(z), 0xc2b2ae3d);
    h ^= h >>> 15;
    let k = h & mask;
    for (;;) {
      const j = slot[k];
      if (j < 0) { slot[k] = i; slotId[k] = count; ids[i] = count; count += 1; break; }
      if (coords[j * 3] === x && coords[j * 3 + 1] === y && coords[j * 3 + 2] === z) { ids[i] = slotId[k]; break; }
      k = (k + 1) & mask;
    }
  }
  return { ids, count };
}

export function solidPositions(solid: ManifoldSolid): Float32Array {
  const mesh = solid.getMesh();
  const n = mesh.vertProperties.length / mesh.numProp;
  const px = new Float64Array(n * 3);
  for (let i = 0; i < n; i += 1) for (let k = 0; k < 3; k += 1) px[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k];
  // Where the solid touches itself (two lobes of a cavity meeting at an edge) Manifold keeps two
  // vertices at one place. Joined again on import they would make an edge of four faces, so each
  // copy is moved a few microns towards its own neighbours: apart, the solid welds back as
  // Manifold built it.
  // Compared as they will be written (32-bit floats): two corners a nanometre apart in Manifold's
  // doubles land on one point in the file, and a slicer would read them as one.
  const same = samePointIds(Float32Array.from(px));
  const seen = new Int32Array(same.count);
  for (let i = 0; i < n; i += 1) seen[same.ids[i]] += 1;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const id = same.ids[i];
    if (seen[id] < 2) continue;
    const list = groups.get(id);
    if (list) list.push(i); else groups.set(id, [i]);
  }
  const doubled = [...groups.values()].flat();
  if (doubled.length) {
    const wanted = new Set(doubled);
    const sum = new Map<number, [number, number, number, number]>();
    for (let t = 0; t < mesh.triVerts.length; t += 3) for (let k = 0; k < 3; k += 1) {
      const v = mesh.triVerts[t + k];
      if (!wanted.has(v)) continue;
      const entry = sum.get(v) ?? [0, 0, 0, 0];
      for (let j = 1; j < 3; j += 1) {
        const w = mesh.triVerts[t + ((k + j) % 3)];
        entry[0] += px[w * 3]; entry[1] += px[w * 3 + 1]; entry[2] += px[w * 3 + 2]; entry[3] += 1;
      }
      sum.set(v, entry);
    }
    const way = new Map<number, [number, number, number]>();
    sum.forEach(([x, y, z, count], v) => {
      const dx = x / count - px[v * 3], dy = y / count - px[v * 3 + 1], dz = z / count - px[v * 3 + 2];
      const length = Math.hypot(dx, dy, dz) || 1;
      way.set(v, [dx / length, dy / length, dz / length]);
    });
    // Copies whose neighbours lie the same way (thin flaps stacked on each other) would land on one
    // point again, so each copy in a group goes a little further than the one before.
    groups.forEach((list) => {
      if (list.length < 2) return;
      list.forEach((v, j) => {
        const d = way.get(v) ?? [0, 0, 1];
        const step = 0.002 * (j + 1);
        px[v * 3] += d[0] * step; px[v * 3 + 1] += d[1] * step; px[v * 3 + 2] += d[2] * step;
      });
    });
    // Checked as written: any corners still on one point are moved apart along z by a micron more.
    for (let round = 0; round < 6; round += 1) {
      const seen = new Map<string, number>();
      let moved = false;
      for (const v of wanted) {
        const key = `${Math.fround(px[v * 3])},${Math.fround(px[v * 3 + 1])},${Math.fround(px[v * 3 + 2])}`;
        if (seen.has(key)) { px[v * 3 + 2] += 0.001 * (round + 1); moved = true; } else seen.set(key, v);
      }
      if (!moved) break;
    }
  }
  const out = new Float32Array(mesh.triVerts.length * 3);
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const base = mesh.triVerts[i] * 3;
    out[i * 3] = px[base];
    out[i * 3 + 1] = px[base + 1];
    out[i * 3 + 2] = px[base + 2];
  }
  return tidyForFile(out);
}

/**
 * Makes a triangle list read as one clean closed surface once a slicer joins corners that sit at the
 * same point (as written, in 32-bit floats). Triangles that collapse to a line, and pairs of the same
 * triangle facing both ways, are dropped. Where two parts of the surface still meet at a corner or an
 * edge, each part gets its own copy of the corner, 2 microns towards its own side.
 */
export function tidyForFile(soup: Float32Array): Float32Array {
  const count = soup.length / 3;
  // Corners are joined only where they are the same point, as an STL file is read.
  const joined = samePointIds(soup);
  const ids = joined.ids;
  const pts: number[] = new Array(joined.count * 3);
  const set = new Uint8Array(joined.count);
  // Each point as it first appears.
  for (let i = 0; i < count; i += 1) {
    const id = ids[i];
    if (set[id]) continue;
    set[id] = 1;
    pts[id * 3] = soup[i * 3]; pts[id * 3 + 1] = soup[i * 3 + 1]; pts[id * 3 + 2] = soup[i * 3 + 2];
  }
  // Drop collapsed triangles, and a triangle met by its own mirror image.
  let tris: number[] = [];
  // Keyed by the corners in order (numbers, not strings): a * n + b, then c.
  const faceOf = new KeyTable(count / 3);
  const faceC = new KeyTable(count / 3);
  const extra = new Map<string, number>();
  const np = joined.count;
  const faceLookup = (lo: number, mid: number, hi: number) => {
    const key = lo * np + mid;
    const c = faceC.get(key);
    if (c === undefined) return undefined;
    if (c === hi) return faceOf.get(key);
    return extra.get(`${lo},${mid},${hi}`);
  };
  const faceStore = (lo: number, mid: number, hi: number, value: number) => {
    const key = lo * np + mid;
    const c = faceC.get(key);
    if (c === undefined || c === hi) { faceC.set(key, hi); faceOf.set(key, value); }
    else extra.set(`${lo},${mid},${hi}`, value);
  };
  for (let t = 0; t < count; t += 3) {
    const a = ids[t], b = ids[t + 1], c = ids[t + 2];
    if (a === b || b === c || a === c) continue;
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
    const other = faceLookup(lo, mid, hi);
    if (other !== undefined && other >= 0) {
      const oa = tris[other], ob = tris[other + 1], oc = tris[other + 2];
      const same = (oa === a && ob === b && oc === c) || (oa === b && ob === c && oc === a) || (oa === c && ob === a && oc === b);
      if (!same) { tris[other] = -1; faceStore(lo, mid, hi, -1); continue; }
    }
    faceStore(lo, mid, hi, tris.length);
    tris.push(a, b, c);
  }
  const dropped: number[] = [];
  for (let t = 0; t < tris.length; t += 3) if (tris[t] >= 0) dropped.push(tris[t], tris[t + 1], tris[t + 2]);
  tris = dropped;
  const nt = tris.length / 3;
  const edgeKey = (a: number, b: number) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  const edgeUse = new KeyTable(nt * 2);
  for (let t = 0; t < nt; t += 1) for (let k = 0; k < 3; k += 1) edgeUse.add(edgeKey(tris[t * 3 + k], tris[t * 3 + ((k + 1) % 3)]));
  // Build 68: the triangles round each corner in flat typed lists (and the corners in the order they
  // are first met), not a Map of arrays - the same lists, without half a million little arrays.
  const vertexCount = pts.length / 3;
  const cornerStart = new Int32Array(vertexCount + 1);
  const cornerOrder: number[] = [];
  for (let i = 0; i < nt * 3; i += 1) {
    const v = tris[i];
    if (cornerStart[v + 1] === 0) cornerOrder.push(v);
    cornerStart[v + 1] += 1;
  }
  for (let v = 0; v < vertexCount; v += 1) cornerStart[v + 1] += cornerStart[v];
  const cornerList = new Int32Array(nt * 3);
  {
    const fill = cornerStart.slice(0, vertexCount);
    for (let t = 0; t < nt; t += 1) for (let k = 0; k < 3; k += 1) cornerList[fill[tris[t * 3 + k]]++] = t;
  }
  // Where an edge is used by more than two triangles, pair them as the solid does: each triangle with
  // the first one met turning from it into the material. Two parts touching along an edge each keep
  // their own pair; a sheet of no thickness pairs its two faces with each other.
  const orig = Int32Array.from(tris);
  const partner = new Map<string, number>();
  const onEdge = new Map<number, number[]>();
  for (let t = 0; t < nt; t += 1) for (let k = 0; k < 3; k += 1) {
    const key = edgeKey(orig[t * 3 + k], orig[t * 3 + ((k + 1) % 3)]);
    if ((edgeUse.get(key) ?? 0) <= 2) continue;
    const list = onEdge.get(key);
    if (list) list.push(t); else onEdge.set(key, [t]);
  }
  const P = (i: number) => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  onEdge.forEach((faces, key) => {
    const a = Math.floor(key / 4294967296), b = key % 4294967296;
    const pa = P(a), d = sub(P(b), pa);
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const axis = [d[0] / dl, d[1] / dl, d[2] / dl];
    const info = faces.map((t) => {
      const c = [0, 1, 2].map((k) => orig[t * 3 + k]);
      const third = c.find((x) => x !== a && x !== b)!;
      let r = sub(P(third), pa);
      r = sub(r, axis.map((x) => x * dot(r, axis)));
      const normal = cross(sub(P(c[1]), P(c[0])), sub(P(c[2]), P(c[0])));
      const forward = c.findIndex((x) => x === a);
      const ab = c[(forward + 1) % 3] === b;
      return { t, r, ab, turn: Math.sign(dot(cross(r, normal.map((x) => -x)), axis)) || 1 };
    });
    const ref = info[0].r;
    const angle = (r: number[]) => Math.atan2(dot(cross(ref, r), axis), dot(ref, r));
    const choice = info.map((f) => {
      let best = -1, bestGap = Infinity;
      info.forEach((g, j) => {
        if (g === f || g.ab === f.ab) return;
        let gap = (angle(g.r) - angle(f.r)) * f.turn;
        gap = ((gap % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (gap > 2 * Math.PI - 1e-3) gap = 0;
        if (gap < bestGap) { bestGap = gap; best = j; }
      });
      return best;
    });
    choice.forEach((j, i) => {
      if (j >= 0 && choice[j] === i) partner.set(`${info[i].t}:${key}`, info[j].t);
    });
  });
  // At each corner, the triangles around it fall into fans joined by their shared edges.
  // One fan is a clean corner; more than one is a pinch, and each fan gets its own copy.
  // Build 68: the fans are found by joining the corner's triangles that share an edge (the triangles
  // using an edge from this corner are all in its list, so how many there are is the edge's use) -
  // the same fans, numbered in the same order, without a lookup per edge.
  let next = pts.length / 3;
  let scratch = new Int32Array(64);
  const root = (parent: Int32Array, i: number) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (const v of cornerOrder) {
    const begin = cornerStart[v], size = cornerStart[v + 1] - begin;
    if (size < 3) continue;
    if (scratch.length < size * 2) scratch = new Int32Array(size * 4);
    const parent = scratch.subarray(0, size);
    for (let i = 0; i < size; i += 1) parent[i] = i;
    const join = (i: number, j: number) => {
      const ri = root(parent, i), rj = root(parent, j);
      if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
    };
    for (let i = 0; i < size; i += 1) {
      const t = cornerList[begin + i];
      for (let k = 0; k < 3; k += 1) {
        const w = orig[t * 3 + k];
        if (w === v) continue;
        let use = 0;
        for (let j = 0; j < size; j += 1) {
          const u = cornerList[begin + j];
          if (orig[u * 3] === w || orig[u * 3 + 1] === w || orig[u * 3 + 2] === w) use += 1;
        }
        if (use === 2) {
          for (let j = 0; j < size; j += 1) {
            const u = cornerList[begin + j];
            if (u !== t && (orig[u * 3] === w || orig[u * 3 + 1] === w || orig[u * 3 + 2] === w)) join(i, j);
          }
        } else if (use > 2) {
          const u = partner.get(`${t}:${edgeKey(v, w)}`);
          if (u !== undefined) for (let j = 0; j < size; j += 1) if (cornerList[begin + j] === u) join(i, j);
        }
      }
    }
    // Fans numbered as they are first met along the corner's list.
    const fanOf = scratch.subarray(size, size * 2);
    let fans = 0;
    for (let i = 0; i < size; i += 1) {
      const r = root(parent, i);
      fanOf[i] = r === i ? fans++ : fanOf[r];
    }
    if (fans < 2) continue;
    for (let f = 1; f < fans; f += 1) {
      let sx = 0, sy = 0, sz = 0, n = 0;
      const mine: number[] = [];
      for (let i = 0; i < size; i += 1) if (fanOf[i] === f) mine.push(cornerList[begin + i]);
      for (const t of mine) for (let k = 0; k < 3; k += 1) {
        const w = orig[t * 3 + k];
        if (w === v) continue;
        sx += pts[w * 3]; sy += pts[w * 3 + 1]; sz += pts[w * 3 + 2]; n += 1;
      }
      const dx = sx / n - pts[v * 3], dy = sy / n - pts[v * 3 + 1], dz = sz / n - pts[v * 3 + 2];
      const length = Math.hypot(dx, dy, dz) || 1;
      const id = next; next += 1;
      pts.push(pts[v * 3] + (dx / length) * 0.002, pts[v * 3 + 1] + (dy / length) * 0.002, pts[v * 3 + 2] + (dz / length) * 0.002);
      for (const t of mine) for (let k = 0; k < 3; k += 1) if (orig[t * 3 + k] === v) tris[t * 3 + k] = id;
    }
  }
  // A split must never open the surface: where a copy left an edge with one triangle, the corners
  // of that edge go back to the corner they came from (and the pinch there stays as it was).
  const from = new Map<number, number>();
  tris.forEach((id, i) => { if (id !== orig[i]) from.set(id, orig[i]); });
  for (let round = 0; round < 8 && from.size; round += 1) {
    const use = new Map<number, number>();
    for (let t = 0; t < nt; t += 1) for (let k = 0; k < 3; k += 1) {
      const key = edgeKey(tris[t * 3 + k], tris[t * 3 + ((k + 1) % 3)]);
      use.set(key, (use.get(key) ?? 0) + 1);
    }
    const undo = new Set<number>();
    for (let t = 0; t < nt; t += 1) for (let k = 0; k < 3; k += 1) {
      const a = tris[t * 3 + k], b = tris[t * 3 + ((k + 1) % 3)];
      if (use.get(edgeKey(a, b)) !== 1) continue;
      if (from.has(a)) undo.add(a);
      if (from.has(b)) undo.add(b);
    }
    if (!undo.size) break;
    for (let i = 0; i < tris.length; i += 1) if (undo.has(tris[i])) tris[i] = orig[i];
    undo.forEach((id) => from.delete(id));
  }
  const all = pts;
  const out = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i += 1) {
    out[i * 3] = all[tris[i] * 3];
    out[i * 3 + 1] = all[tris[i] * 3 + 1];
    out[i * 3 + 2] = all[tris[i] * 3 + 2];
  }
  return out;
}

/**
 * Edges that are not shared by exactly two triangles once corners at the same point are joined, as
 * an STL file is read (the 32-bit values it holds): pinched edges and open ones. 0 is a clean,
 * closed surface.
 */
export function pinchedEdges(positions: ArrayLike<number>): number {
  const id = new Map<string, number>();
  const ids = new Int32Array(Math.floor(positions.length / 3));
  for (let i = 0; i < ids.length; i += 1) {
    const key = `${Math.fround(positions[i * 3])},${Math.fround(positions[i * 3 + 1])},${Math.fround(positions[i * 3 + 2])}`;
    let n = id.get(key);
    if (n === undefined) { n = id.size; id.set(key, n); }
    ids[i] = n;
  }
  const counts = new Map<number, number>();
  for (let t = 0; t + 2 < ids.length; t += 3) {
    const a = ids[t], b = ids[t + 1], c = ids[t + 2];
    if (a === b || b === c || a === c) continue;
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(x, y);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let bad = 0;
  counts.forEach((count) => { if (count !== 2) bad += 1; });
  return bad;
}


/** Applies a rigid (or any affine) transform to every point of the mesh, in place. */
export function applyMatrix(m: Mesh, matrix: THREE.Matrix4) {
  const p = new THREE.Vector3();
  for (let i = 0; i < m.v.length; i += 3) {
    p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyMatrix4(matrix);
    m.v[i] = p.x;
    m.v[i + 1] = p.y;
    m.v[i + 2] = p.z;
  }
}

export function cloneMesh(m: Mesh): Mesh {
  return { v: m.v.slice(), f: m.f.slice() };
}

/** A transformed copy of a triangle soup. */
export function transformSoup(positions: ArrayLike<number>, matrix: THREE.Matrix4): Float32Array {
  const out = new Float32Array(positions.length);
  const p = new THREE.Vector3();
  for (let i = 0; i + 2 < positions.length; i += 3) {
    p.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(matrix);
    out[i] = p.x;
    out[i + 1] = p.y;
    out[i + 2] = p.z;
  }
  return out;
}

export function soupBounds(positions: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) for (let k = 0; k < 3; k += 1) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
  return { min, max };
}

/**
 * Build 61: a map from whole-number keys (below 2^53) to whole numbers, in typed arrays - for the
 * millions of lookups making a model takes, where a Map spends most of its time on itself.
 */
export class KeyTable {
  private keys: Float64Array;
  private values: Int32Array;
  private used: Uint8Array;
  private mask: number;
  size = 0;
  constructor(expected = 16) {
    let cap = 16;
    while (cap < expected * 2) cap <<= 1;
    this.keys = new Float64Array(cap);
    this.values = new Int32Array(cap);
    this.used = new Uint8Array(cap);
    this.mask = cap - 1;
  }
  private slot(key: number) {
    const lo = key >>> 0, hi = Math.floor(key / 4294967296) >>> 0;
    let h = Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi + 0x7f4a7c15, 0x85ebca77);
    h ^= h >>> 15;
    let k = h & this.mask;
    while (this.used[k] && this.keys[k] !== key) k = (k + 1) & this.mask;
    return k;
  }
  get(key: number): number | undefined {
    const k = this.slot(key);
    return this.used[k] ? this.values[k] : undefined;
  }
  set(key: number, value: number) {
    let k = this.slot(key);
    if (!this.used[k]) {
      if ((this.size + 1) * 2 > this.keys.length) { this.grow(); k = this.slot(key); }
      this.used[k] = 1; this.keys[k] = key; this.size += 1;
    }
    this.values[k] = value;
  }
  /** Adds `by` to the key's value (0 when new) and returns the sum. */
  add(key: number, by = 1) {
    const value = (this.get(key) ?? 0) + by;
    this.set(key, value);
    return value;
  }
  private grow() {
    const { keys, values, used } = this;
    this.keys = new Float64Array(keys.length * 2);
    this.values = new Int32Array(keys.length * 2);
    this.used = new Uint8Array(keys.length * 2);
    this.mask = keys.length * 2 - 1;
    for (let i = 0; i < keys.length; i += 1) if (used[i]) { const k = this.slot(keys[i]); this.used[k] = 1; this.keys[k] = keys[i]; this.values[k] = values[i]; }
  }
}

/**
 * Points hashed into cubes of `cell` mm, for nearest-point questions. Build 61: each cube's points
 * are kept in one flat list (in the order given), so a question reads typed arrays, not lists of lists.
 */
export class PointGrid {
  private cells: KeyTable;
  private start: Int32Array;
  private order: Int32Array;
  constructor(private points: ArrayLike<number>, private cell: number) {
    const n = Math.floor(points.length / 3);
    this.cells = new KeyTable(n);
    const cellOf = new Int32Array(n);
    const counts: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const key = this.key(Math.floor(points[i * 3] / cell), Math.floor(points[i * 3 + 1] / cell), Math.floor(points[i * 3 + 2] / cell));
      let id = this.cells.get(key);
      if (id === undefined) { id = counts.length; this.cells.set(key, id); counts.push(0); }
      cellOf[i] = id;
      counts[id] += 1;
    }
    this.start = new Int32Array(counts.length + 1);
    for (let c = 0; c < counts.length; c += 1) this.start[c + 1] = this.start[c] + counts[c];
    const fill = this.start.slice(0, counts.length);
    this.order = new Int32Array(n);
    for (let i = 0; i < n; i += 1) this.order[fill[cellOf[i]]++] = i;
  }
  private key(x: number, y: number, z: number) {
    return ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
  }
  /** The nearest point within one cell's reach, as [index, distance], or null. */
  nearest(x: number, y: number, z: number): [number, number] | null {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    const points = this.points, order = this.order, start = this.start;
    let best = -1, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      const id = this.cells.get(this.key(cx + dx, cy + dy, cz + dz));
      if (id === undefined) continue;
      for (let k = start[id], end = start[id + 1]; k < end; k += 1) {
        const i = order[k];
        const ex = points[i * 3] - x, ey = points[i * 3 + 1] - y, ez = points[i * 3 + 2] - z;
        const d = ex * ex + ey * ey + ez * ez;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best < 0 ? null : [best, Math.sqrt(bestD)];
  }
  /**
   * Build 61: whether a point lies within `reach` (no more than a cell) of (x, y, z) - looking only in
   * the cubes that close a reach can touch, usually the one it is in.
   */
  within(x: number, y: number, z: number, reach: number): boolean {
    const c = this.cell, r2 = reach * reach;
    const fx = x / c, fy = y / c, fz = z / c;
    const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
    const span = (f: number, i: number): [number, number] => [f - i < reach / c ? -1 : 0, i + 1 - f < reach / c ? 1 : 0];
    const [x0, x1] = span(fx, cx), [y0, y1] = span(fy, cy), [z0, z1] = span(fz, cz);
    const points = this.points, order = this.order, start = this.start;
    for (let dx = x0; dx <= x1; dx += 1) for (let dy = y0; dy <= y1; dy += 1) for (let dz = z0; dz <= z1; dz += 1) {
      const id = this.cells.get(this.key(cx + dx, cy + dy, cz + dz));
      if (id === undefined) continue;
      for (let k = start[id], end = start[id + 1]; k < end; k += 1) {
        const i = order[k];
        const ex = points[i * 3] - x, ey = points[i * 3 + 1] - y, ez = points[i * 3 + 2] - z;
        if (ex * ex + ey * ey + ez * ez < r2) return true;
      }
    }
    return false;
  }
}

/** Unit vector helpers. */
export type Vec3 = [number, number, number];
export const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Share (by area) of the scan's surface above z = level that is still in `result` (a triangle soup):
 * a triangle counts when all its corners are there, within 0.01 mm.
 */
export function surfaceKept(scan: Mesh, result: ArrayLike<number>, level: number, only?: Uint8Array): number {
  const grid = new PointGrid(result, 0.05);
  const found = new Int8Array(scan.v.length / 3); // 0 unknown, 1 there, -1 gone
  const there = (i: number) => {
    if (!found[i]) {
      found[i] = grid.within(scan.v[i * 3], scan.v[i * 3 + 1], scan.v[i * 3 + 2], 0.01) ? 1 : -1;
    }
    return found[i] === 1;
  };
  let total = 0, kept = 0;
  for (let t = 0; t < scan.f.length / 3; t += 1) {
    const a = scan.f[t * 3], b = scan.f[t * 3 + 1], c = scan.f[t * 3 + 2];
    if (scan.v[a * 3 + 2] <= level || scan.v[b * 3 + 2] <= level || scan.v[c * 3 + 2] <= level) continue;
    if (only && !(only[a] && only[b] && only[c])) continue;
    const area = faceArea(scan, t);
    total += area;
    if (there(a) && there(b) && there(c)) kept += area;
  }
  return total > 0 ? kept / total : 1;
}

/**
 * Build 52: `field` (one value per corner) averaged with its neighbours `rounds` times, each corner
 * where `hold` is set kept at least where it was - so its zero line runs smooth along the surface.
 */
export function smoothField(m: Mesh, field: Float64Array, rounds: number, hold?: Uint8Array): Float64Array {
  const n = m.v.length / 3;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < m.f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t + k], b = m.f[t + ((k + 1) % 3)];
    neighbours[a].push(b); neighbours[b].push(a);
  }
  let current = Float64Array.from(field);
  for (let round = 0; round < rounds; round += 1) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const list = neighbours[i];
      if (!list.length) { next[i] = current[i]; continue; }
      let sum = current[i];
      for (const j of list) sum += current[j];
      next[i] = sum / (list.length + 1);
      if (hold?.[i]) next[i] = Math.max(next[i], field[i]);
    }
    current = next;
  }
  return current;
}

/**
 * Build 52: what of the mesh lies where `field` is above zero, cut exactly along its zero line -
 * triangles that cross it are split there, not dropped whole - so the cut edge is a clean line.
 * Corners where `keep` is set are kept whatever the field says (the teeth).
 * Build 76: where the line passes closer to a corner than SNAP_SHARE of the edge, the corner is
 * moved onto the line instead of the edge being split there, which left slivers along the cut. A
 * corner moves at most that share of one edge; the teeth (`keep`) never move.
 */
export function cutAlongField(m: Mesh, field: Float64Array, keep?: Uint8Array, snapShare = SNAP_SHARE): Mesh {
  const v = m.v.slice();
  const f: number[] = [];
  const corners = m.v.length / 3;
  const level = (i: number) => (keep?.[i] ? Math.max(field[i], 1e-3) : field[i]);
  const above = (i: number) => field[i] > 0 || Boolean(keep?.[i]);
  // Corners moved onto the line: kept, and the cut passes through them.
  const onLine = new Uint8Array(corners);
  if (snapShare > 0) {
    for (let t = 0; t < m.f.length; t += 3) for (let k = 0; k < 3; k += 1) {
      const a = m.f[t + k], b = m.f[t + (k + 1) % 3];
      if (above(a) === above(b) || onLine[a] || onLine[b]) continue;
      const fa = level(a), fb = level(b);
      const share = fa / (fa - fb);
      const near = share < snapShare ? a : share > 1 - snapShare ? b : -1;
      if (near < 0 || keep?.[near]) continue;
      for (let c = 0; c < 3; c += 1) v[near * 3 + c] = m.v[a * 3 + c] + (m.v[b * 3 + c] - m.v[a * 3 + c]) * share;
      onLine[near] = 1;
    }
  }
  const inside = (i: number) => onLine[i] === 1 || above(i);
  const crossing = new Map<number, number>();
  const point = (a: number, b: number) => {
    if (onLine[a]) return a;
    if (onLine[b]) return b;
    const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    const known = crossing.get(key);
    if (known !== undefined) return known;
    const fa = level(a), fb = level(b);
    const t = Math.min(1, Math.max(0, fa / (fa - fb)));
    const id = v.length / 3;
    for (let k = 0; k < 3; k += 1) v.push(m.v[a * 3 + k] + (m.v[b * 3 + k] - m.v[a * 3 + k]) * t);
    crossing.set(key, id);
    return id;
  };
  const push = (a: number, b: number, c: number) => { if (a !== b && b !== c && a !== c) f.push(a, b, c); };
  for (let t = 0; t < m.f.length; t += 3) {
    const c = [m.f[t], m.f[t + 1], m.f[t + 2]];
    const ins = c.map(inside);
    const count = ins.filter(Boolean).length;
    if (count === 3) {
      // Every corner on the line: kept if it lay inside before the corners moved.
      if (c.every((i) => onLine[i]) && c.filter(above).length < 2) continue;
      f.push(...c);
      continue;
    }
    if (count === 0) continue;
    // Rotate so the odd one out comes first.
    let r = 0;
    while (count === 1 ? !ins[r] : ins[r]) r += 1;
    const a = c[r], b = c[(r + 1) % 3], d = c[(r + 2) % 3];
    const ab = point(a, b), ad = point(a, d);
    if (count === 1) push(a, ab, ad);
    else { push(ab, b, d); push(ab, d, ad); }
  }
  return { v, f };
}
/** Build 76: the line snaps onto a corner it passes closer to than this share of the edge. */
export const SNAP_SHARE = 0.2;
