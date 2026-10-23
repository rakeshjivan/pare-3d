/**
 * Fork (build 46): Dental model - turns a raw intraoral scan (an open surface) into a printable model.
 *
 * Step 1, prepareDentalScan: welds the triangle soup, drops degenerate, doubled and non-manifold
 * triangles and loose fragments, fills every small hole, keeps the long open edge where the scan
 * stops on the gum (the margin), and turns the scan so the teeth point up (+z) and the margin lies
 * underneath. The surface itself is not moved relative to itself: only rotated and shifted.
 *
 * Step 2, makeDentalModel: cuts the scan with a level plane at or above the highest point of the
 * margin - there the margin is complete all round and lies wholly on the plane - drops vertical
 * walls from that edge to a flat floor and closes the floor. The scan above the plane is kept
 * exactly; only gum below the plane goes. Optionally a plate joins the two sides of the arch, and
 * the model is hollowed: the cavity is the solid shrunk by the wall on a voxel grid (the same exact
 * distance transform and level set Round a mesh uses), continued down through the floor so the
 * model is open underneath - no trapped resin, no suction cupping, no drain holes needed. The outer
 * surface never comes from the grid.
 *
 * All coordinates here are Z-up millimetres, 9 numbers a triangle; the editor converts.
 */
import * as THREE from "three";
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { sampler, squaredDistanceTo, voxelise, type Grid } from "@/lib/meshRound";
import { weldedVertexIds } from "@/lib/meshComponents";

/** A piece smaller than this share of the biggest piece's area is a fragment (cheek, tongue, cotton roll). */
export const DENTAL_FRAGMENT_SHARE = 0.05;
/** Model heights and thicknesses the panel offers, in mm. */
export const DENTAL_MIN_BASE = 1;
export const DENTAL_MAX_BASE = 30;
export const DENTAL_MIN_WALL = 1;
export const DENTAL_MAX_WALL = 5;
/** Plate across the arch: this thick, or the whole base when that is thinner. */
export const DENTAL_PLATE_THICKNESS = 3;
/** The most voxels the hollowing grid may have. */
const MAX_HOLLOW_VOXELS = 9_000_000;

type Mesh = { v: number[]; f: number[] };

export type DentalScanReport = {
  triangles: number;
  fragmentsRemoved: number;
  holesFilled: number;
  brokenRemoved: number;
  /** Height of the highest tooth point above the lowest point of the scan, mm. */
  top: number;
  /** The highest point of the margin: from here up the scan is complete all round. */
  completeMarginZ: number;
  /** How much of the scan, measured down from the highest tooth point, can be kept, mm. */
  maxKeep: number;
  /** Length of the margin, mm. */
  marginLength: number;
};

export type PreparedDentalScan = { positions: Float32Array; report: DentalScanReport };

export type DentalModelOptions = {
  /** How much of the scan to keep, measured down from the highest tooth point, mm. */
  keep: number;
  /** Height of the base below the kept scan, mm. */
  base: number;
  /** A plate across the arch (palate or tongue space), for accuracy. */
  plate: boolean;
  hollow: boolean;
  /** Wall thickness of a hollow model, mm. */
  wall: number;
};

export type DentalModelResult = {
  positions: Float32Array;
  height: number;
  keep: number;
  volume: number;
  hollow: boolean;
  voxel: number | null;
};

// ---------------------------------------------------------------------------------------------
// Indexed mesh helpers

function weld(positions: ArrayLike<number>, tolerance = 1e-4): Mesh {
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
  const seen = new Set<string>();
  for (let t = 0; t + 2 < count; t += 3) {
    const a = ids[t], b = ids[t + 1], c = ids[t + 2];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    f.push(a, b, c);
  }
  return { v, f };
}

function edgeKey(a: number, b: number) {
  return a < b ? a * 4194304 + b : b * 4194304 + a;
}

function faceArea(m: Mesh, t: number) {
  const a = m.f[t * 3] * 3, b = m.f[t * 3 + 1] * 3, c = m.f[t * 3 + 2] * 3;
  const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1], uz = m.v[b + 2] - m.v[a + 2];
  const wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1], wz = m.v[c + 2] - m.v[a + 2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

/** Drops the triangles on an edge used by more than two triangles. */
function dropNonManifold(m: Mesh): number {
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
function dropFragments(m: Mesh, share: number): number {
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
  const kept: number[] = [];
  for (let t = 0; t < faces; t += 1) if (keep.has(find(m.f[t * 3]))) kept.push(m.f[t * 3], m.f[t * 3 + 1], m.f[t * 3 + 2]);
  m.f = kept;
  return area.size - keep.size;
}

/**
 * The open edges as closed loops of vertex indices, each in the direction its triangles run along
 * it (a triangle's edge a->b on the boundary gives a->b in the loop).
 */
function boundaryLoops(m: Mesh): number[][] {
  const faces = m.f.length / 3;
  const directed = new Map<number, number>();
  for (let t = 0; t < faces; t += 1) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
    const key = edgeKey(a, b);
    directed.set(key, (directed.get(key) ?? 0) + 1);
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

function loopLength(m: Mesh, loop: number[]) {
  let total = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i] * 3, b = loop[(i + 1) % loop.length] * 3;
    total += Math.hypot(m.v[a] - m.v[b], m.v[a + 1] - m.v[b + 1], m.v[a + 2] - m.v[b + 2]);
  }
  return total;
}

/** Closes a hole with a fan from its centre; the new triangles run the other way round the edge. */
function fillLoop(m: Mesh, loop: number[]) {
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
function planeNormal(points: number[][]): [number, number, number] {
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

function rotateOnto(m: Mesh, from: [number, number, number], to: [number, number, number]) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...from), new THREE.Vector3(...to));
  const p = new THREE.Vector3();
  for (let i = 0; i < m.v.length; i += 3) {
    p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyQuaternion(q);
    m.v[i] = p.x;
    m.v[i + 1] = p.y;
    m.v[i + 2] = p.z;
  }
}

function soup(m: Mesh): Float32Array {
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
function upwardness(m: Mesh) {
  let total = 0;
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
    const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1];
    const wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1];
    total += ux * wy - uy * wx;
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Step 1

/** Whether a mesh looks like a raw scan: an open surface with one long open edge. */
export function looksLikeDentalScan(positions: ArrayLike<number>): boolean {
  if (positions.length < 9 * 2000) return false;
  const m = weld(positions);
  const loops = boundaryLoops(m);
  if (loops.length === 0) return false;
  const lengths = loops.map((loop) => loopLength(m, loop)).sort((a, b) => b - a);
  return lengths[0] > 40;
}

export function prepareDentalScan(positions: ArrayLike<number>): PreparedDentalScan {
  const triangles = Math.floor(positions.length / 9);
  const m = weld(positions);
  if (m.f.length < 9) throw new Error("This part has too few triangles to be a scan");
  const brokenRemoved = dropNonManifold(m);
  const fragmentsRemoved = dropFragments(m, DENTAL_FRAGMENT_SHARE);
  let loops = boundaryLoops(m);
  if (loops.length === 0) throw new Error("This part is already closed - it is a model, not a raw scan");
  const lengths = loops.map((loop) => loopLength(m, loop));
  let marginIndex = 0;
  lengths.forEach((length, i) => { if (length > lengths[marginIndex]) marginIndex = i; });
  const margin = loops[marginIndex];
  let holesFilled = 0;
  loops.forEach((loop, i) => {
    if (i === marginIndex) return;
    fillLoop(m, loop);
    holesFilled += 1;
  });
  // The margin's best-fit plane; its normal points from the margin towards the teeth.
  const marginPoints = margin.map((i) => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]]);
  let normal = planeNormal(marginPoints);
  const mc = [0, 0, 0];
  marginPoints.forEach((p) => { mc[0] += p[0]; mc[1] += p[1]; mc[2] += p[2]; });
  mc[0] /= marginPoints.length; mc[1] /= marginPoints.length; mc[2] /= marginPoints.length;
  // The teeth are the part of the surface farthest from the margin's plane.
  let far = 0, farSign = 0;
  for (let i = 0; i < m.v.length; i += 3) {
    const d = (m.v[i] - mc[0]) * normal[0] + (m.v[i + 1] - mc[1]) * normal[1] + (m.v[i + 2] - mc[2]) * normal[2];
    if (Math.abs(d) > far) {
      far = Math.abs(d);
      farSign = Math.sign(d);
    }
  }
  if (farSign < 0) normal = [-normal[0], -normal[1], -normal[2]];
  rotateOnto(m, normal, [0, 0, 1]);
  // Outward faces point away from the tissue: on the whole, up.
  if (upwardness(m) < 0) {
    for (let t = 0; t < m.f.length; t += 3) {
      const b = m.f[t + 1];
      m.f[t + 1] = m.f[t + 2];
      m.f[t + 2] = b;
    }
  }
  // Centred over the origin, lowest point at z = 0.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < m.v.length; i += 3) {
    minX = Math.min(minX, m.v[i]); maxX = Math.max(maxX, m.v[i]);
    minY = Math.min(minY, m.v[i + 1]); maxY = Math.max(maxY, m.v[i + 1]);
    minZ = Math.min(minZ, m.v[i + 2]); maxZ = Math.max(maxZ, m.v[i + 2]);
  }
  const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
  for (let i = 0; i < m.v.length; i += 3) {
    m.v[i] -= ox;
    m.v[i + 1] -= oy;
    m.v[i + 2] -= minZ;
  }
  // The margin after the fill: the only open edge left.
  loops = boundaryLoops(m);
  const finalMargin = loops.reduce((best, loop) => (loopLength(m, loop) > loopLength(m, best) ? loop : best), loops[0]);
  let completeMarginZ = 0;
  for (const i of finalMargin) completeMarginZ = Math.max(completeMarginZ, m.v[i * 3 + 2]);
  const top = maxZ - minZ;
  return {
    positions: soup(m),
    report: {
      triangles,
      fragmentsRemoved,
      holesFilled,
      brokenRemoved,
      top,
      completeMarginZ,
      maxKeep: top - completeMarginZ,
      marginLength: loopLength(m, finalMargin),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Step 2

/** Cuts away everything below z = level; new points on the cut are shared between triangles. */
function cutBelow(m: Mesh, level: number): Mesh {
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

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function signedArea(poly: Array<[number, number]>) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) s += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return s / 2;
}

/** Closes a cut scan: vertical walls from every edge loop on the plane down to z = floor, and the floor. */
function closeWithBase(m: Mesh, level: number, floor: number): { mesh: Mesh; outline: Array<Array<[number, number]>> } {
  const loops = boundaryLoops(m);
  if (loops.length === 0) throw new Error("The cut left no open edge to build the base from");
  for (const loop of loops) {
    for (const i of loop) {
      if (Math.abs(m.v[i * 3 + 2] - level) > 1e-5) throw new Error("The scan has an opening above the cut - fill it or keep less of the scan");
    }
  }
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
  // Floor: loops nested by containment; even depth = outline, odd = hole in the one around it.
  const depth = rings.map((ring, i) => rings.reduce((d, other, j) => (j !== i && pointInPolygon(ring[0][0], ring[0][1], other) ? d + 1 : d), 0));
  const areas = rings.map((ring) => Math.abs(signedArea(ring)));
  rings.forEach((ring, i) => {
    if (depth[i] % 2 !== 0) return;
    const holes = rings
      .map((_, j) => j)
      .filter((j) => depth[j] === depth[i] + 1 && areas[j] < areas[i] && pointInPolygon(rings[j][0][0], rings[j][0][1], ring));
    const contour = ring.map(([x, y]) => new THREE.Vector2(x, y));
    const holeVectors = holes.map((j) => rings[j].map(([x, y]) => new THREE.Vector2(x, y)));
    const ids = [...loops[i].map(down), ...holes.flatMap((j) => loops[j].map(down))];
    const faces = THREE.ShapeUtils.triangulateShape(contour, holeVectors);
    faces.forEach(([p, q, r]) => {
      const a = ids[p], b = ids[q], c = ids[r];
      const cross = (v[b * 3] - v[a * 3]) * (v[c * 3 + 1] - v[a * 3 + 1]) - (v[b * 3 + 1] - v[a * 3 + 1]) * (v[c * 3] - v[a * 3]);
      // The floor faces down.
      if (cross > 0) f.push(a, c, b);
      else f.push(a, b, c);
    });
  });
  return { mesh: { v, f }, outline: rings };
}

/** Convex hull of 2D points (monotone chain), counter-clockwise. */
function convexHull(points: Array<[number, number]>): Array<[number, number]> {
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

type ManifoldRuntime = Awaited<ReturnType<typeof getManifoldRuntime>>;
type ManifoldSolid = InstanceType<ManifoldRuntime["Manifold"]>;

function toManifold(runtime: ManifoldRuntime, m: Mesh): ManifoldSolid {
  // Points made twice (a cut point and a wall point at the same place) are joined first.
  const welded = weld(soup(m), 1e-6);
  const solid = new runtime.Manifold(new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(welded.v), triVerts: new Uint32Array(welded.f) }));
  if (solid.status() !== "NoError") throw new Error(`The model did not close into a solid (${solid.status()})`);
  return solid;
}

function solidPositions(solid: ManifoldSolid): Float32Array {
  const mesh = solid.getMesh();
  const out = new Float32Array(mesh.triVerts.length * 3);
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const base = mesh.triVerts[i] * mesh.numProp;
    out[i * 3] = mesh.vertProperties[base];
    out[i * 3 + 1] = mesh.vertProperties[base + 1];
    out[i * 3 + 2] = mesh.vertProperties[base + 2];
  }
  return out;
}

/** The cavity of a hollow model: the solid shrunk by `wall`, carried on down through the floor. */
function cavity(runtime: ManifoldRuntime, positions: Float32Array, floor: number, wall: number, shift = 0): { solid: ManifoldSolid; voxel: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const below = wall + 1;
  const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ + below;
  let h = wall / 5;
  const budget = Math.cbrt((sx * sy * sz) / MAX_HOLLOW_VOXELS);
  if (budget > h) h = budget;
  if (h > wall / 2) throw new Error("This model is too big to hollow with walls this thin - use thicker walls");
  const pad = 2 * h;
  const origin: [number, number, number] = [minX - pad - shift * h, minY - pad - shift * h * 0.7, minZ - below - pad];
  const grid: Grid = {
    nx: Math.ceil((sx + 2 * pad) / h),
    ny: Math.ceil((sy + 2 * pad) / h),
    nz: Math.ceil((sz + 2 * pad) / h),
    h,
    origin,
  };
  const { nx, ny, nz } = grid;
  const inside = voxelise(positions, grid);
  // Continue every column that is solid just above the floor on down: the floor is not a wall.
  const firstAbove = Math.max(0, Math.ceil((floor - origin[2]) / h - 0.5) + 1);
  for (let yi = 0; yi < ny; yi += 1) for (let xi = 0; xi < nx; xi += 1) {
    if (firstAbove >= nz || !inside[(firstAbove * ny + yi) * nx + xi]) continue;
    for (let zi = 0; zi < firstAbove; zi += 1) inside[(zi * ny + yi) * nx + xi] = 1;
  }
  // The grid's bottom layer stays outside, so the carried-on columns end inside the grid.
  for (let yi = 0; yi < ny; yi += 1) for (let xi = 0; xi < nx; xi += 1) inside[yi * nx + xi] = 0;
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
  // Only the cavity that opens through the floor: a pocket shut inside a thick wall would hold resin.
  const pieces = raw.decompose();
  raw.delete();
  const open = pieces.filter((piece) => piece.boundingBox().min[2] < floor);
  pieces.filter((piece) => !open.includes(piece)).forEach((piece) => piece.delete());
  const solid = runtime.Manifold.compose(open);
  open.forEach((piece) => piece.delete());
  return { solid, voxel: h };
}

/** Edges used by more than two triangles once coincident points are joined. */
export function pinchedEdges(positions: ArrayLike<number>): number {
  const m = weld(positions, 1e-5);
  const counts = new Map<number, number>();
  for (let t = 0; t < m.f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const key = edgeKey(m.f[t + k], m.f[t + ((k + 1) % 3)]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let pinched = 0;
  counts.forEach((count) => { if (count > 2) pinched += 1; });
  return pinched;
}

export async function makeDentalModel(positions: ArrayLike<number>, options: DentalModelOptions, given?: ManifoldRuntime): Promise<DentalModelResult> {
  const m = weld(positions);
  if (m.f.length < 9) throw new Error("This part has too few triangles to be a scan");
  dropNonManifold(m);
  dropFragments(m, DENTAL_FRAGMENT_SHARE);
  let loops = boundaryLoops(m);
  if (loops.length === 0) throw new Error("This part is already closed - it is a model, not a raw scan");
  // Any hole still open other than the margin is filled here too.
  const lengths = loops.map((loop) => loopLength(m, loop));
  let marginIndex = 0;
  lengths.forEach((length, i) => { if (length > lengths[marginIndex]) marginIndex = i; });
  loops.forEach((loop, i) => { if (i !== marginIndex) fillLoop(m, loop); });
  loops = [loops[marginIndex]];
  let top = -Infinity, completeMarginZ = -Infinity;
  for (let i = 2; i < m.v.length; i += 3) top = Math.max(top, m.v[i]);
  for (const i of loops[0]) completeMarginZ = Math.max(completeMarginZ, m.v[i * 3 + 2]);
  const maxKeep = top - completeMarginZ;
  if (maxKeep <= 0.5) throw new Error("The scan's open edge reaches the top of the teeth - turn the scan teeth up first");
  const keep = Math.max(0.5, Math.min(options.keep, maxKeep - 0.01));
  const base = Math.max(DENTAL_MIN_BASE, Math.min(DENTAL_MAX_BASE, options.base));
  const level = top - keep;
  const floor = level - base;
  const cut = cutBelow(m, level);
  dropFragments(cut, DENTAL_FRAGMENT_SHARE);
  const { mesh, outline } = closeWithBase(cut, level, floor);
  const runtime = given ?? await getManifoldRuntime();
  const made: Array<{ delete(): void }> = [];
  try {
    let solid = toManifold(runtime, mesh);
    made.push(solid);
    if (options.plate) {
      const hull = convexHull(outline.flat());
      const thickness = Math.min(DENTAL_PLATE_THICKNESS, base);
      const outer = new runtime.CrossSection([hull], "Positive");
      made.push(outer);
      // A little inside the outline, so the plate's sides never lie in the walls' faces.
      const section = outer.offset(-0.3, "Round");
      made.push(section);
      const slab = section.extrude(thickness).translate([0, 0, floor]);
      made.push(slab);
      solid = runtime.Manifold.union(solid, slab);
      made.push(solid);
    }
    let voxel: number | null = null;
    if (options.hollow) {
      const wall = Math.max(DENTAL_MIN_WALL, Math.min(DENTAL_MAX_WALL, options.wall));
      const before = solidPositions(solid);
      // A cavity whose surface pinches at an edge (two lobes just touching) would not weld back into
      // a clean solid; sampled half a voxel over, it does not touch.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const hollowing = cavity(runtime, before, floor, wall, attempt * 0.5);
        made.push(hollowing.solid);
        voxel = hollowing.voxel;
        if (hollowing.solid.isEmpty()) break;
        const result = runtime.Manifold.difference(solid, hollowing.solid);
        made.push(result);
        if (attempt < 3 && pinchedEdges(solidPositions(result)) > 0) continue;
        solid = result;
        break;
      }
    }
    if (solid.status() !== "NoError" || solid.isEmpty()) throw new Error("The model did not come out as a closed solid");
    // Floor at z = 0.
    const moved = solid.translate([0, 0, -floor]);
    made.push(moved);
    return { positions: solidPositions(moved), height: top - floor, keep, volume: moved.volume(), hollow: options.hollow, voxel };
  } finally {
    made.forEach((item) => {
      try {
        item.delete();
      } catch {
        // already gone
      }
    });
  }
}
