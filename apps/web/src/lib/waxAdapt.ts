/**
 * Build 105: the wax teeth against the bite and against each other, as exocad's Free-Forming "Adapt"
 * and "Cut all intersections" do it.
 *
 * - waxContactDistances: each wax tooth's corners' signed distance (mm; negative inside) to the opposing
 *   arch and to the other wax teeth, the nearer of the two - for the live colour map.
 * - adaptWax: where a tooth comes closer to the opposing arch than `occlusal` (into it, or nearer than
 *   the clearance asked for), its surface is set back onto the arch's surface plus the clearance, and
 *   the rings around blended so no step is left; then each tooth is cut back where it runs into a
 *   tooth nearer the midline (that one is left as it is), down to `approximal` (0 = touching).
 *
 * Everything in one frame (the studio's input coordinates, where the two arches are in their bite).
 * Each tooth is worked on as a welded mesh, so its triangles stay joined.
 */
import { closedOrientation } from "@/lib/biteContacts";
import { weld } from "@/lib/dentalMesh";
import { NearestSurface } from "@/lib/nearestSurface";

/** How far from a surface its distance is read for the map and the adapting, mm. */
export const ADAPT_REACH = 2;
/** exocad's usual static occlusion: the wax this far short of the opposing teeth, mm. */
export const OCCLUSAL_CLEARANCE = 0.1;
/** Rings around the set-back area blended into it. */
const BLEND_RINGS = 3;

const join = (parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/**
 * The opposing arch's faces turned (if need be) to face the wax: a scan's faces may run either way,
 * and a deep overlap would outvote the rest if the sign were read from the corners.
 */
export function facingWax(antagonist: Float32Array, teeth: Float32Array[]): Float32Array {
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const t of teeth) for (let i = 0; i < t.length; i += 3) { cx += t[i]; cy += t[i + 1]; cz += t[i + 2]; n += 1; }
  if (!n) return antagonist;
  cx /= n; cy /= n; cz /= n;
  let vote = 0;
  for (let o = 0; o + 8 < antagonist.length; o += 9) {
    const ax = antagonist[o], ay = antagonist[o + 1], az = antagonist[o + 2];
    const ux = antagonist[o + 3] - ax, uy = antagonist[o + 4] - ay, uz = antagonist[o + 5] - az;
    const vx = antagonist[o + 6] - ax, vy = antagonist[o + 7] - ay, vz = antagonist[o + 8] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const dx = cx - ax, dy = cy - ay, dz = cz - az;
    const dist = Math.hypot(dx, dy, dz) || 1;
    // Faces near the wax count most: the teeth facing it, not the far side of the scan.
    vote += (nx * dx + ny * dy + nz * dz) / (dist * dist * dist);
  }
  if (vote >= 0) return antagonist;
  const out = Float32Array.from(antagonist);
  for (let o = 0; o + 8 < out.length; o += 9) for (let k = 0; k < 3; k += 1) { const t = out[o + 3 + k]; out[o + 3 + k] = out[o + 6 + k]; out[o + 6 + k] = t; }
  return out;
}

/** Each tooth's corners: the nearer of the distance to the opposing arch and to the other wax teeth (NaN: nothing within reach). */
export function waxContactDistances(teeth: Float32Array[], antagonistAny: Float32Array | null, reach = ADAPT_REACH): Float32Array[] {
  const antagonist = antagonistAny && antagonistAny.length ? facingWax(antagonistAny, teeth) : null;
  const nearArch = antagonist ? new NearestSurface(antagonist, reach) : null;
  const q = new Float64Array(3);
  return teeth.map((tooth, i) => {
    const toArch = antagonist && nearArch ? signedTo(tooth, antagonist, nearArch, 1, q) : new Float32Array(tooth.length / 3).fill(Number.NaN);
    const others = teeth.filter((_, k) => k !== i && boxesNear(tooth, teeth[k], reach));
    if (!others.length) return toArch;
    const target = join(others);
    const toTeeth = signedTo(tooth, target, new NearestSurface(target, reach), outwardOf(target), q);
    for (let c = 0; c < toArch.length; c += 1) {
      const a = toArch[c], b = toTeeth[c];
      toArch[c] = Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b);
    }
    return toArch;
  });
}

function box(p: ArrayLike<number>) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k += 1) { b[k] = Math.min(b[k], p[i + k]); b[k + 3] = Math.max(b[k + 3], p[i + k]); }
  return b;
}
function boxesNear(a: ArrayLike<number>, b: ArrayLike<number>, gap: number) {
  const p = box(a), q = box(b);
  for (let k = 0; k < 3; k += 1) if (p[k] > q[k + 3] + gap || q[k] > p[k + 3] + gap) return false;
  return true;
}

type Welded = { v: Float64Array; f: Int32Array; ring: number[][] };
function welded(soup: Float32Array): Welded {
  const m = weld(soup, 1e-5);
  const v = Float64Array.from(m.v), f = Int32Array.from(m.f);
  const ring: number[][] = Array.from({ length: v.length / 3 }, () => []);
  for (let t = 0; t < f.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = f[t + k], b = f[t + ((k + 1) % 3)];
    if (!ring[a].includes(b)) ring[a].push(b);
    if (!ring[b].includes(a)) ring[b].push(a);
  }
  return { v, f, ring };
}
function soupOf(w: Welded): Float32Array {
  const out = new Float32Array(w.f.length * 3);
  for (let t = 0; t < w.f.length; t += 1) { const i = w.f[t] * 3; out[t * 3] = w.v[i]; out[t * 3 + 1] = w.v[i + 1]; out[t * 3 + 2] = w.v[i + 2]; }
  return out;
}

/**
 * The corners nearer `target` than `gap` (or inside it) set back onto its surface plus `gap`, along the
 * line to their nearest point there; returns the corners moved and the deepest overlap found (mm).
 */
/**
 * Each point's signed distance to `target` (negative inside), through `near` (built on `target`): to
 * its nearest point, the sign from that triangle's facing. `outward` - the target's faces face out
 * (an opposing arch turned by facingWax, a closed tooth checked by closedOrientation). NaN: out of reach.
 */
function signedTo(points: ArrayLike<number>, target: Float32Array, near: NearestSurface, outward: 1 | -1, q: Float64Array, onto?: Float64Array): Float32Array {
  const n = points.length / 3;
  const d = new Float32Array(n).fill(Number.NaN);
  for (let i = 0; i < n; i += 1) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    const dist = near.nearest(x, y, z, q);
    if (!Number.isFinite(dist)) continue;
    const o = near.lastTriangle * 9;
    const ux = target[o + 3] - target[o], uy = target[o + 4] - target[o + 1], uz = target[o + 5] - target[o + 2];
    const vx = target[o + 6] - target[o], vy = target[o + 7] - target[o + 1], vz = target[o + 8] - target[o + 2];
    const side = ((x - q[0]) * (uy * vz - uz * vy) + (y - q[1]) * (uz * vx - ux * vz) + (z - q[2]) * (ux * vy - uy * vx)) * outward;
    d[i] = side < 0 ? -dist : dist;
    if (onto) { onto[i * 3] = q[0]; onto[i * 3 + 1] = q[1]; onto[i * 3 + 2] = q[2]; }
  }
  return d;
}
const outwardOf = (soup: Float32Array): 1 | -1 => (closedOrientation(soup) ?? 1) >= 0 ? 1 : -1;

/**
 * The corners nearer `target` than `gap` (or inside it) set back onto its surface plus `gap`, along the
 * line to their nearest point there; returns the corners moved and the deepest overlap found (mm).
 */
function setBack(w: Welded, target: Float32Array, gap: number, near: NearestSurface, outward: 1 | -1): { moved: Uint8Array; count: number; deepest: number } {
  const n = w.v.length / 3;
  const moved = new Uint8Array(n);
  const q = new Float64Array(3);
  const onto = new Float64Array(n * 3);
  const d = signedTo(w.v, target, near, outward, q, onto);
  let count = 0, deepest = 0;
  for (let i = 0; i < n; i += 1) {
    const di = d[i];
    if (Number.isNaN(di) || di >= gap - 1e-4) continue;
    const x = w.v[i * 3], y = w.v[i * 3 + 1], z = w.v[i * 3 + 2];
    const qx = onto[i * 3], qy = onto[i * 3 + 1], qz = onto[i * 3 + 2];
    // Away from the target's surface: from the point to its nearest point when inside, the other way when outside.
    let ux = x - qx, uy = y - qy, uz = z - qz;
    const len = Math.hypot(ux, uy, uz);
    if (len < 1e-6) continue; // on the surface exactly: the blend below carries it
    const s = (di < 0 ? -1 : 1) / len;
    ux *= s; uy *= s; uz *= s;
    w.v[i * 3] = qx + ux * gap; w.v[i * 3 + 1] = qy + uy * gap; w.v[i * 3 + 2] = qz + uz * gap;
    moved[i] = 1;
    count += 1;
    deepest = Math.max(deepest, gap - di);
  }
  return { moved, count, deepest };
}

/** The rings round the moved corners eased towards their neighbours, the moved ones held, so the set-back runs out smoothly. */
function blend(w: Welded, moved: Uint8Array) {
  const n = moved.length;
  const ringOf = new Int16Array(n).fill(-1);
  let front: number[] = [];
  for (let i = 0; i < n; i += 1) if (moved[i]) { ringOf[i] = 0; front.push(i); }
  for (let r = 1; r <= BLEND_RINGS && front.length; r += 1) {
    const next: number[] = [];
    for (const i of front) for (const j of w.ring[i]) if (ringOf[j] < 0) { ringOf[j] = r; next.push(j); }
    front = next;
  }
  const free: number[] = [];
  for (let i = 0; i < n; i += 1) if (ringOf[i] > 0) free.push(i);
  const nv = new Float64Array(w.v);
  for (let pass = 0; pass < 4; pass += 1) {
    for (const i of free) {
      const nb = w.ring[i];
      if (!nb.length) continue;
      let x = 0, y = 0, z = 0;
      for (const j of nb) { x += w.v[j * 3]; y += w.v[j * 3 + 1]; z += w.v[j * 3 + 2]; }
      // Nearer the set-back, eased more; the outer ring barely.
      const k = 0.5 * (1 - (ringOf[i] - 1) / BLEND_RINGS);
      nv[i * 3] = w.v[i * 3] + k * (x / nb.length - w.v[i * 3]);
      nv[i * 3 + 1] = w.v[i * 3 + 1] + k * (y / nb.length - w.v[i * 3 + 1]);
      nv[i * 3 + 2] = w.v[i * 3 + 2] + k * (z / nb.length - w.v[i * 3 + 2]);
    }
    for (const i of free) { w.v[i * 3] = nv[i * 3]; w.v[i * 3 + 1] = nv[i * 3 + 1]; w.v[i * 3 + 2] = nv[i * 3 + 2]; }
  }
}

export type AdaptTooth = { fdi: number; positions: Float32Array };
export type AdaptResult = { teeth: Array<AdaptTooth & { bite: number; contact: number; deepest: number }> };

/** The order teeth are cut against each other: out from the midline (a tooth is cut where it runs into one nearer the midline). */
const rankOf = (fdi: number) => fdi % 10;

export function adaptWax(teeth: AdaptTooth[], antagonistAny: Float32Array | null, options: { occlusal?: number; approximal?: number; bite?: boolean; contacts?: boolean } = {}): AdaptResult {
  const occlusal = options.occlusal ?? OCCLUSAL_CLEARANCE;
  const approximal = options.approximal ?? 0;
  const antagonist = antagonistAny && antagonistAny.length ? facingWax(antagonistAny, teeth.map((t) => t.positions)) : null;
  const near = antagonist && options.bite !== false ? new NearestSurface(antagonist, ADAPT_REACH) : null;
  const order = teeth.map((t, i) => i).sort((a, b) => rankOf(teeth[a].fdi) - rankOf(teeth[b].fdi) || teeth[a].fdi - teeth[b].fdi);
  const done: Float32Array[] = new Array(teeth.length);
  const out: AdaptResult["teeth"] = new Array(teeth.length);
  for (const i of order) {
    const w = welded(teeth[i].positions);
    let bite = 0, contact = 0, deepest = 0;
    // Twice: the blend can carry a corner back in.
    if (near && antagonist) for (let round = 0; round < 2; round += 1) {
      const r = setBack(w, antagonist, occlusal, near, 1);
      if (!r.count) break;
      if (round === 0) { bite = r.count; deepest = r.deepest; }
      blend(w, r.moved);
    }
    if (options.contacts !== false) {
      const before = order.slice(0, order.indexOf(i)).map((k) => done[k]).filter((s) => s && boxesNear(teeth[i].positions, s, ADAPT_REACH));
      if (before.length) {
        const target = join(before);
        const nearTeeth = new NearestSurface(target, ADAPT_REACH);
        const r = setBack(w, target, approximal, nearTeeth, outwardOf(target));
        if (r.count) { contact = r.count; deepest = Math.max(deepest, r.deepest); blend(w, r.moved); }
      }
    }
    done[i] = soupOf(w);
    out[i] = { fdi: teeth[i].fdi, positions: done[i], bite, contact, deepest };
  }
  return { teeth: out };
}
