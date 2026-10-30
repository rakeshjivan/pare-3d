/**
 * Build 103: an eggshell provisional from the wax-up (exocad's "extract anatomies" for an eggshell,
 * Meshmixer's offset shell): each adapted wax tooth kept as its outer surface only, open at the
 * neck where the prepared tooth goes in, given an even wall inward, and closed round the opening.
 * Where the tooth is thinner than two walls (the incisal edge), the wall is held to under half of it,
 * so the inner surface never crosses the outer: the edge stays solid, as an eggshell's does before
 * it is relined. One closed shell per tooth, joined into one piece by the caller.
 */
import { weld, type Mesh } from "@/lib/dentalMesh";

type V3 = readonly [number, number, number] | readonly number[];

/** The shell's wall, mm, by default, and its limits. */
export const EGGSHELL_WALL = 0.6;
export const EGGSHELL_MIN_WALL = 0.3;
export const EGGSHELL_MAX_WALL = 1.5;
/** Faces this far down (their normal against the tooth's up) in the lowest part of it are the neck's floor: opened. */
const FLOOR_FACING = -0.5;
/** The lowest share of the tooth's height (at most FLOOR_REACH mm) in which the floor is looked for. */
const FLOOR_SHARE = 0.3;
const FLOOR_REACH = 2.5;
/** The wall is at most this share of the tooth's own thickness at a point. */
const THICKNESS_SHARE = 0.45;

function faceNormal(v: number[], a: number, b: number, c: number): [number, number, number, number] {
  const ux = v[b * 3] - v[a * 3], uy = v[b * 3 + 1] - v[a * 3 + 1], uz = v[b * 3 + 2] - v[a * 3 + 2];
  const wx = v[c * 3] - v[a * 3], wy = v[c * 3 + 1] - v[a * 3 + 1], wz = v[c * 3 + 2] - v[a * 3 + 2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const l = Math.hypot(nx, ny, nz);
  return l > 0 ? [nx / l, ny / l, nz / l, l / 2] : [0, 0, 0, 0];
}

/** How far a ray goes before it meets one of the faces (Möller-Trumbore), or Infinity. */
function rayDistance(m: Mesh, faces: number[], o: number[], d: number[]): number {
  let best = Infinity;
  const v = m.v;
  for (const t of faces) {
    const a = m.f[t * 3], b = m.f[t * 3 + 1], c = m.f[t * 3 + 2];
    const e1x = v[b * 3] - v[a * 3], e1y = v[b * 3 + 1] - v[a * 3 + 1], e1z = v[b * 3 + 2] - v[a * 3 + 2];
    const e2x = v[c * 3] - v[a * 3], e2y = v[c * 3 + 1] - v[a * 3 + 1], e2z = v[c * 3 + 2] - v[a * 3 + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = o[0] - v[a * 3], sy = o[1] - v[a * 3 + 1], sz = o[2] - v[a * 3 + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (w < 0 || u + w > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist > 1e-4 && dist < best) best = dist;
  }
  return best;
}

/**
 * One wax tooth (a closed soup, outward faces) as an eggshell: a closed soup, or null when it has no
 * neck floor to open (it is not a tooth standing on a margin).
 */
export function eggshellTooth(positions: ArrayLike<number>, up: V3, wall = EGGSHELL_WALL): Float32Array | null {
  const m = weld(positions, 1e-5);
  const nv = m.v.length / 3, nf = m.f.length / 3;
  if (!nf) return null;
  const ul = Math.hypot(up[0], up[1], up[2]) || 1;
  const U = [up[0] / ul, up[1] / ul, up[2] / ul];
  const height = (i: number) => m.v[i * 3] * U[0] + m.v[i * 3 + 1] * U[1] + m.v[i * 3 + 2] * U[2];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < nv; i += 1) { const h = height(i); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const floorTop = lo + Math.min(FLOOR_REACH, FLOOR_SHARE * (hi - lo));
  // The faces kept (the outer surface) and their normals.
  const kept: number[] = [];
  const normals = new Float64Array(nf * 4);
  for (let t = 0; t < nf; t += 1) {
    const a = m.f[t * 3], b = m.f[t * 3 + 1], c = m.f[t * 3 + 2];
    const n = faceNormal(m.v, a, b, c);
    normals.set(n, t * 4);
    const centre = (height(a) + height(b) + height(c)) / 3;
    const floor = n[0] * U[0] + n[1] * U[1] + n[2] * U[2] < FLOOR_FACING && centre < floorTop;
    if (!floor) kept.push(t);
  }
  if (kept.length === nf || kept.length < nf / 4) return null;
  // Vertex normals from the kept faces, area-weighted.
  const vn = new Float64Array(nv * 3);
  const used = new Uint8Array(nv);
  for (const t of kept) for (let k = 0; k < 3; k += 1) {
    const i = m.f[t * 3 + k];
    used[i] = 1;
    for (let j = 0; j < 3; j += 1) vn[i * 3 + j] += normals[t * 4 + j] * normals[t * 4 + 3];
  }
  for (let i = 0; i < nv; i += 1) {
    const l = Math.hypot(vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]) || 1;
    vn[i * 3] /= l; vn[i * 3 + 1] /= l; vn[i * 3 + 2] /= l;
  }
  // The wall at each corner: as asked, or under half the tooth where it is thinner.
  const offset = new Float64Array(nv);
  for (let i = 0; i < nv; i += 1) {
    if (!used[i]) continue;
    const o = [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]];
    const across = rayDistance(m, kept, o, [-vn[i * 3], -vn[i * 3 + 1], -vn[i * 3 + 2]]);
    offset[i] = Math.min(wall, THICKNESS_SHARE * across);
  }
  // Evened out with the neighbours (never thicker than a corner allows).
  const neighbours: number[][] = Array.from({ length: nv }, () => []);
  for (const t of kept) for (let k = 0; k < 3; k += 1) neighbours[m.f[t * 3 + k]].push(m.f[t * 3 + ((k + 1) % 3)], m.f[t * 3 + ((k + 2) % 3)]);
  for (let pass = 0; pass < 2; pass += 1) {
    const next = offset.slice();
    for (let i = 0; i < nv; i += 1) {
      if (!used[i] || !neighbours[i].length) continue;
      let s = 0;
      for (const j of neighbours[i]) s += offset[j];
      next[i] = Math.min(offset[i], (offset[i] + s / neighbours[i].length) / 2);
    }
    offset.set(next);
  }
  const inner = (i: number, j: number) => m.v[i * 3 + j] - vn[i * 3 + j] * offset[i];
  const out: number[] = [];
  const push = (p: (j: number) => number) => { out.push(p(0), p(1), p(2)); };
  const outer = (i: number) => (j: number) => m.v[i * 3 + j];
  const innerOf = (i: number) => (j: number) => inner(i, j);
  // The outer surface; the inner one turned inside out.
  for (const t of kept) {
    const a = m.f[t * 3], b = m.f[t * 3 + 1], c = m.f[t * 3 + 2];
    push(outer(a)); push(outer(b)); push(outer(c));
    push(innerOf(a)); push(innerOf(c)); push(innerOf(b));
  }
  // The rim round the opening: each open edge a -> b joined to its inner copy.
  const count = new Map<string, number>();
  for (const t of kept) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  for (const t of kept) for (let k = 0; k < 3; k += 1) {
    const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
    if (count.get(a < b ? `${a},${b}` : `${b},${a}`) !== 1) continue;
    push(outer(b)); push(outer(a)); push(innerOf(a));
    push(outer(b)); push(innerOf(a)); push(innerOf(b));
  }
  return Float32Array.from(out);
}
