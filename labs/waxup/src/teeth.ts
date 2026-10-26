/**
 * Wax-up lab: finding the patient's teeth on an arch scan (no colour, no AI).
 *
 * Every vertex is projected onto the arch curve (arc length s, offset across the arch d, height z).
 * Along s, the crown band - the top 3 mm of the teeth - narrows and dips at each interproximal
 * contact (the buccal and lingual embrasures, the incisal or occlusal embrasure) and is widest at a
 * tooth's height of contour. The contacts are chosen as the minima of that signal that best fit a
 * run of natural tooth widths outward from the midline (dynamic programming, one side at a time,
 * with one overall size factor). Each tooth then gets its mesial and distal contact, its crown (the
 * vertices between its contacts down to a natural crown height), its long axis and its width.
 */
import * as THREE from "three";
import type { ArchCurve } from "./arch";

type Jaw = "upper" | "lower";

/** Mean mesiodistal crown widths (mm), central incisor to third molar (Wheeler's Dental Anatomy). */
const WIDTH: Record<Jaw, number[]> = {
  upper: [8.5, 6.5, 7.5, 7.0, 6.5, 10.0, 9.0, 8.5],
  lower: [5.0, 5.5, 7.0, 7.0, 7.0, 11.0, 10.5, 10.0],
};
/** Mean anatomic crown heights (mm), central incisor to third molar (Wheeler's). */
const CROWN: Record<Jaw, number[]> = {
  upper: [10.5, 9.0, 10.0, 8.5, 8.5, 7.5, 7.0, 6.5],
  lower: [9.0, 9.5, 11.0, 8.5, 8.0, 7.5, 7.0, 7.0],
};
const QUADRANTS: Record<Jaw, [number, number]> = { upper: [1, 2], lower: [4, 3] };

export type FoundTooth = {
  fdi: number;
  position: number;
  /** Which side of the midline, as the search runs (-1: toward the curve's start). */
  side: -1 | 1;
  /** Arc length of the mesial and distal contacts along the arch curve. */
  sMesial: number;
  sDistal: number;
  /** Mesiodistal width along the arch curve (mm). */
  width: number;
  /** Contact points in the arch frame. */
  mesial: THREE.Vector3;
  distal: THREE.Vector3;
  /** Crown centre, highest point (cusp tip or incisal edge) and long axis (unit, occlusal). */
  centre: THREE.Vector3;
  tip: THREE.Vector3;
  axis: THREE.Vector3;
  /** Height of the crown found (mm) and how clearly the contacts showed (0 none - 1 strong). */
  height: number;
  confidence: number;
};

export type FoundTeeth = {
  teeth: FoundTooth[];
  /** The tooth each vertex belongs to (index into teeth), -1 for gum and the rest. */
  vertexTooth: Int16Array;
  /** Overall size relative to the mean widths. */
  size: number;
  signal: { s: number[]; cost: number[]; width: number[]; height: number[] };
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return NaN;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
};

/** Each point's arc length along the curve, signed offset across it (+ outward) and height. */
export function projectOnCurve(points: Float32Array, curve: ArchCurve) {
  const n = points.length / 3;
  const s = new Float32Array(n), d = new Float32Array(n);
  const pts = curve.pts, cs = curve.s;
  for (let i = 0; i < n; i += 1) {
    const x = points[i * 3], y = points[i * 3 + 1];
    let best = Infinity, bs = 0, bd = 0;
    for (let k = 1; k < pts.length; k += 1) {
      const ax = pts[k - 1][0], ay = pts[k - 1][1], bx = pts[k][0], by = pts[k][1];
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-9;
      let t = ((x - ax) * ex + (y - ay) * ey) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t * ex, py = ay + t * ey, dist = (x - px) ** 2 + (y - py) ** 2;
      if (dist < best) {
        best = dist;
        bs = cs[k - 1] + t * (cs[k] - cs[k - 1]);
        // Outward: away from the curve's centre.
        const l = Math.sqrt(l2);
        let nx = ey / l, ny = -ex / l;
        if (nx * (px - curve.centre[0]) + ny * (py - curve.centre[1]) < 0) { nx = -nx; ny = -ny; }
        bd = (x - px) * nx + (y - py) * ny;
      }
    }
    s[i] = bs; d[i] = bd;
  }
  return { s, d };
}

/**
 * The curve moved onto the middle of the crowns: at each curve point, the median offset of the top
 * 3 mm of crown under it (within 1 mm along the curve). On incisors that is the incisal edge. Arc
 * lengths along a curve that runs labially of the teeth are too long, so widths come out too big.
 */
export function centreCurve(points: Float32Array, curve: ArchCurve, passes = 2): ArchCurve {
  let c = curve;
  for (let pass = 0; pass < passes; pass += 1) {
    const { s, d } = projectOnCurve(points, c);
    const k = c.pts.length;
    const ds: number[][] = Array.from({ length: k }, () => []), zs: number[][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < s.length; i += 1) {
      if (Math.abs(d[i]) > 8) continue;
      // Nearest curve point by arc length.
      let lo = 0, hi = k - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.s[m] < s[i]) lo = m; else hi = m; }
      const j = s[i] - c.s[lo] < c.s[hi] - s[i] ? lo : hi;
      if (Math.abs(c.s[j] - s[i]) > 1) continue;
      ds[j].push(d[i]); zs[j].push(points[i * 3 + 2]);
    }
    const shift = ds.map((list, j) => {
      if (list.length < 10) return 0;
      const top = percentile(zs[j], 0.95);
      const band = list.filter((_, q) => zs[j][q] > top - 3);
      return band.length >= 5 ? Math.max(-3, Math.min(3, percentile(band, 0.5))) : 0;
    });
    // Smooth the shifts (they are noisy where the band is thin), then move each point along its normal.
    // Only canine to canine (tapering off by the premolars): further back the crown band spans the
    // buccal and lingual cusps and its middle zigzags, while the curve there already runs over the cusps.
    const sm = shift.map((_, j) => {
      let sum = 0, w = 0;
      for (let q = Math.max(0, j - 6); q <= Math.min(k - 1, j + 6); q += 1) { sum += shift[q]; w += 1; }
      const fromMid = Math.abs(c.s[j] - c.sMid);
      return (sum / w) * Math.max(0, Math.min(1, (26 - fromMid) / 8));
    });
    const pts = c.pts.map((p, j) => {
      const a = c.pts[Math.max(0, j - 1)], b = c.pts[Math.min(k - 1, j + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      let nx = ty / l, ny = -tx / l;
      if (nx * (p[0] - c.centre[0]) + ny * (p[1] - c.centre[1]) < 0) { nx = -nx; ny = -ny; }
      return [p[0] + nx * sm[j], p[1] + ny * sm[j]] as [number, number];
    });
    const cs = [0];
    for (let j = 1; j < k; j += 1) cs.push(cs[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    let sMid = cs[k - 1] / 2;
    for (let j = 1; j < k; j += 1) {
      if ((pts[j - 1][0] <= 0 && pts[j][0] >= 0) || (pts[j - 1][0] >= 0 && pts[j][0] <= 0)) {
        const t = pts[j][0] === pts[j - 1][0] ? 0 : -pts[j - 1][0] / (pts[j][0] - pts[j - 1][0]);
        sMid = cs[j - 1] + t * (cs[j] - cs[j - 1]);
        break;
      }
    }
    c = { ...c, pts, s: cs, length: cs[k - 1], sMid };
  }
  return c;
}

/**
 * `sizeRange`: the overall size factor's range. For the second arch of a pair, pass the first arch's
 * size +-0.1: tooth sizes are in proportion between the arches (Bolton's anterior ratio, 77.2%, which
 * the two width tables already carry), and crowded lower incisors otherwise read as half or double size.
 */
export type Pin = { s: number; side: -1 | 1; k: number };
export type FindOptions = {
  lastPosition?: number;
  sizeRange?: [number, number];
  /** The mesh's triangles (indices into points): with them, crowns are grown over the surface up to the creases. */
  faces?: Uint32Array;
  /** Concavity per vertex (see concavity()), computed once per arch. */
  crease?: Float32Array;
  /**
   * Contacts the dentist placed: arc length along the found curve, the side of the midline (-1: toward
   * the curve's start) and which contact it is counting from the midline (0 = the midline, 1 = between
   * the central and lateral...). The search passes through each exactly there.
   */
  pins?: Pin[];
  /** The centred curve from an earlier search, so pinned arc lengths keep their meaning. */
  centred?: ArchCurve;
};
/** Crease threshold: the 82nd percentile of the scan's own concavity (0.06 mm on a sharp scan, lower on smoother ones). */
const CREASE_SHARE = 0.82;

export function findTeeth(points: Float32Array, rawCurve: ArchCurve, jaw: Jaw, rightSide: number, options: FindOptions = {}): FoundTeeth & { curve: ArchCurve } {
  const lastPosition = options.lastPosition ?? 7, sizeRange = options.sizeRange ?? [0.8, 1.25];
  const crease = options.crease;
  let CREASE = 0.06;
  if (crease) { const sample: number[] = []; for (let i = 0; i < crease.length; i += 7) sample.push(crease[i]); CREASE = Math.min(0.06, percentile(sample, CREASE_SHARE)); }
  const curve = options.centred ?? centreCurve(points, rawCurve);
  const n = points.length / 3;
  const { s, d } = projectOnCurve(points, curve);
  const STEP = 0.25, BAND = 3, HALF = 7.5;
  const bins = Math.max(1, Math.ceil(curve.length / STEP) + 1);
  // Local top of the teeth (p95 height within +-2.5 mm of each bin), so the band follows the curve of Spee.
  const zByBin: number[][] = Array.from({ length: bins }, () => []);
  const dByBin: number[][] = Array.from({ length: bins }, () => []);
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(d[i]) > HALF) continue;
    const b = Math.round(s[i] / STEP);
    if (b < 0 || b >= bins) continue;
    zByBin[b].push(points[i * 3 + 2]);
    dByBin[b].push(d[i]);
  }
  const win = Math.round(2.5 / STEP);
  const localTop = new Float64Array(bins);
  for (let b = 0; b < bins; b += 1) {
    const zs: number[] = [];
    for (let k = Math.max(0, b - win); k <= Math.min(bins - 1, b + win); k += 1) for (const z of zByBin[k]) zs.push(z);
    localTop[b] = zs.length ? percentile(zs, 0.95) : NaN;
  }
  // Share of crease vertices in the top 5 mm of crown at each bin: an interproximal contact has the
  // groove on both its buccal and lingual sides; a groove on the occlusal surface runs along the curve.
  const creaseShare = new Float64Array(bins);
  if (crease) {
    const hit = new Float64Array(bins), all = new Float64Array(bins);
    for (let i = 0; i < n; i += 1) {
      if (Math.abs(d[i]) > HALF) continue;
      const b = Math.round(s[i] / STEP);
      if (b < 0 || b >= bins || !(points[i * 3 + 2] > localTop[b] - 5)) continue;
      all[b] += 1;
      if (crease[i] > CREASE) hit[b] += 1;
    }
    for (let b = 0; b < bins; b += 1) creaseShare[b] = all[b] ? hit[b] / all[b] : 0;
  }
  const width = new Float64Array(bins), height = new Float64Array(bins);
  for (let b = 0; b < bins; b += 1) {
    const ds: number[] = [], zs: number[] = [];
    zByBin[b].forEach((z, k) => { if (z > localTop[b] - BAND) { ds.push(dByBin[b][k]); zs.push(z); } });
    width[b] = ds.length >= 3 ? percentile(ds, 0.95) - percentile(ds, 0.05) : 0;
    height[b] = zs.length ? percentile(zs, 0.97) : localTop[b] - BAND;
  }
  // Contact likelihood: narrow and low relative to the neighbourhood (+-4 mm). Lower cost = more contact-like.
  const around = Math.round(4 / STEP);
  const cost = new Float64Array(bins);
  for (let b = 0; b < bins; b += 1) {
    let wMax = 1e-6, hMax = -Infinity;
    for (let k = Math.max(0, b - around); k <= Math.min(bins - 1, b + around); k += 1) { wMax = Math.max(wMax, width[k]); hMax = Math.max(hMax, height[k]); }
    const wn = width[b] / wMax;
    const hn = Number.isFinite(hMax) ? Math.max(0, Math.min(1, (hMax - height[b]) / 2.5)) : 0;
    // On incisors and canines the band is thin and widens at a contact (both neighbours in it): there
    // the incisal embrasure (the dip) is the cue. From the premolars back the band narrows at each
    // contact (buccal and lingual embrasures), so width joins in.
    const fromMid = Math.abs(b * STEP - curve.sMid);
    const back = Math.max(0, Math.min(1, (fromMid - 18) / 6));
    let cMax = 1e-6;
    for (let k = Math.max(0, b - around); k <= Math.min(bins - 1, b + around); k += 1) cMax = Math.max(cMax, creaseShare[k]);
    cost[b] = back * wn - hn * (2 - back) - (crease ? creaseShare[b] / cMax : 0);
  }
  const smoothCost = Float64Array.from(cost, (_, b) => (cost[Math.max(0, b - 1)] + 2 * cost[b] + cost[Math.min(bins - 1, b + 1)]) / 4);
  const pinAt = (side: number, k: number) => {
    const pin = (options.pins ?? []).find((p) => p.k === k && (k === 0 || p.side === side));
    return pin ? Math.max(0, Math.min(bins - 1, Math.round(pin.s / STEP))) : null;
  };

  // One side outward from a midline contact: Viterbi over bins, tooth k between contacts k-1 and k.
  const widths = WIDTH[jaw];
  const side = (mid: number, dir: 1 | -1, size: number) => {
    let prev = new Map<number, { cost: number; path: number[] }>([[mid, { cost: 0, path: [mid] }]]);
    let best: { cost: number; path: number[] } = { cost: 0, path: [mid] };
    for (let k = 0; k < lastPosition; k += 1) {
      const w = widths[k] * size / STEP;
      const next = new Map<number, { cost: number; path: number[] }>();
      for (const [b0, state] of prev) {
        const pinned = pinAt(dir, k + 1);
        // A pinned contact may make its tooth any width from 40% to 200% of the usual.
        const lo = pinned === null ? Math.round(w * 0.72) : 1, hi = pinned === null ? Math.round(w * 1.3) : Math.round(w * 2);
        for (let len = lo; len <= hi; len += 1) {
          const b = b0 + dir * len;
          if (b < 0 || b >= bins || (pinned !== null && b !== pinned)) continue;
          const dev = (len - w) / w;
          const c = state.cost + smoothCost[b] + 2.5 * dev * dev;
          const old = next.get(b);
          if (!old || c < old.cost) next.set(b, { cost: c, path: [...state.path, b] });
        }
      }
      if (!next.size) {
        // A pinned contact that cannot be reached rules this midline and size out.
        if (pinAt(dir, k + 1) !== null) return { cost: Infinity, path: [mid] };
        break;
      }
      prev = next;
      let top: { cost: number; path: number[] } | null = null;
      for (const v of next.values()) if (!top || v.cost < top.cost) top = v;
      best = top!;
    }
    return best;
  };
  // The midline and the overall size together: every midline contact within 6 mm of where the curve
  // crosses x = 0, every size factor; a natural arch is near-symmetric, so the left and right teeth
  // of each type should match in width.
  const midBin = Math.round(curve.sMid / STEP);
  let bestSize = 1, bestPaths: [number[], number[]] = [[midBin], [midBin]], bestScore = Infinity;
  const midPin = pinAt(0, 0);
  const midFrom = midPin ?? Math.max(0, midBin - 24), midTo = midPin ?? Math.min(bins - 1, midBin + 24);
  for (let mid = midFrom; mid <= midTo; mid += 1) {
    for (let size = sizeRange[0]; size <= sizeRange[1] + 0.001; size += 0.025) {
      const a = side(mid, -1, size), b = side(mid, 1, size);
      if (!Number.isFinite(a.cost) || !Number.isFinite(b.cost)) continue;
      const teethCount = a.path.length + b.path.length - 2;
      if (teethCount < 2) continue;
      let asym = 0;
      const pairs = Math.min(a.path.length, b.path.length) - 1;
      for (let k = 1; k <= pairs; k += 1) {
        const wa = Math.abs(a.path[k] - a.path[k - 1]), wb = Math.abs(b.path[k] - b.path[k - 1]);
        asym += ((wa - wb) / ((wa + wb) / 2)) ** 2;
      }
      const score = (a.cost + b.cost + smoothCost[mid] + 3 * asym) / teethCount;
      if (score < bestScore) { bestScore = score; bestSize = size; bestPaths = [a.path, b.path]; }
    }
  }
  const mid = bestPaths[0][0];

  const [rightQ, leftQ] = QUADRANTS[jaw];
  const at = (b: number) => {
    const sv = Math.max(0, Math.min(curve.length, b * STEP));
    let k = 1;
    while (k < curve.s.length - 1 && curve.s[k] < sv) k += 1;
    const t = (sv - curve.s[k - 1]) / (curve.s[k] - curve.s[k - 1] || 1);
    const p = curve.pts[k - 1], q = curve.pts[k];
    return new THREE.Vector3(p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), height[Math.max(0, Math.min(bins - 1, b))] - 1);
  };
  const teeth: FoundTooth[] = [];
  const vertexTooth = new Int16Array(n).fill(-1);
  const adjacency = options.faces ? neighbours(n, options.faces) : null;
  for (const [sideIndex, path] of bestPaths.entries()) {
    // The curve runs from its x < 0 end, so the first path is the x < 0 side.
    const sideSign = sideIndex === 0 ? -1 : 1;
    for (let k = 1; k < path.length; k += 1) {
      const b0 = path[k - 1], b1 = path[k];
      const s0 = Math.min(b0, b1) * STEP, s1 = Math.max(b0, b1) * STEP;
      const position = k;
      const mesialPoint = at(b0), distalPoint = at(b1);
      const fdi = (sideSign === rightSide ? rightQ : leftQ) * 10 + position;
      // The crown: vertices between the contacts, across the arch, down to a natural crown height.
      let top = -Infinity;
      for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b += 1) if (Number.isFinite(localTop[b])) top = Math.max(top, localTop[b]);
      const floor = top - CROWN[jaw][position - 1] * bestSize;
      const index = teeth.length;
      const crown: number[] = [];
      if (adjacency && crease) {
        // Grown over the surface from the top of the crown, stopping at creases (the gingival margin and
        // the interproximal grooves), within the contacts (+-0.75 mm) and above the natural crown height.
        const inside = (i: number) => s[i] > s0 - 0.75 && s[i] < s1 + 0.75 && Math.abs(d[i]) < HALF + 1 && points[i * 3 + 2] > floor && points[i * 3 + 2] < top + 1.5;
        // The crease line thickened by two rings of vertices, so growth cannot slip through gaps in it.
        let wall = new Uint8Array(n);
        for (let i = 0; i < n; i += 1) if (crease[i] > CREASE) wall[i] = 1;
        for (let ring = 0; ring < 2; ring += 1) {
          const grown = wall.slice();
          for (let i = 0; i < n; i += 1) if (wall[i]) for (let e = adjacency.start[i]; e < adjacency.start[i + 1]; e += 1) grown[adjacency.next[e]] = 1;
          wall = grown;
        }
        const queue: number[] = [];
        for (let i = 0; i < n; i += 1) {
          if (vertexTooth[i] >= 0 || s[i] < s0 + 0.5 || s[i] > s1 - 0.5 || Math.abs(d[i]) > HALF) continue;
          if (points[i * 3 + 2] > top - 1.5 && !wall[i]) { vertexTooth[i] = index; queue.push(i); }
        }
        for (let q = 0; q < queue.length; q += 1) {
          const i = queue[q];
          crown.push(i);
          if (wall[i]) continue; // the crease itself belongs to the crown, but growth stops there
          for (let e = adjacency.start[i]; e < adjacency.start[i + 1]; e += 1) {
            const j = adjacency.next[e];
            if (vertexTooth[j] >= 0 || !inside(j)) continue;
            vertexTooth[j] = index;
            queue.push(j);
          }
        }
      } else {
        for (let i = 0; i < n; i += 1) {
          if (s[i] < s0 || s[i] > s1 || Math.abs(d[i]) > HALF) continue;
          const z = points[i * 3 + 2];
          if (z < floor || z > top + 1.5) continue;
          vertexTooth[i] = index;
          crown.push(i);
        }
      }
      const centre = new THREE.Vector3(), tip = new THREE.Vector3(0, 0, -Infinity);
      const upper = new THREE.Vector3(), lower = new THREE.Vector3();
      let nu = 0, nl = 0;
      for (const i of crown) {
        const z = points[i * 3 + 2];
        centre.x += points[i * 3]; centre.y += points[i * 3 + 1]; centre.z += z;
        if (z > tip.z) tip.set(points[i * 3], points[i * 3 + 1], z);
        if (z > top - 2.5) { upper.x += points[i * 3]; upper.y += points[i * 3 + 1]; upper.z += z; nu += 1; }
        if (z < floor + 2.5) { lower.x += points[i * 3]; lower.y += points[i * 3 + 1]; lower.z += z; nl += 1; }
      }
      if (crown.length) centre.divideScalar(crown.length);
      const axis = nu && nl ? upper.divideScalar(nu).sub(lower.divideScalar(nl)).normalize() : new THREE.Vector3(0, 0, 1);
      if (axis.z < 0.5) axis.set(0, 0, 1);
      const confidence = Math.max(0, Math.min(1, -(smoothCost[b0] + smoothCost[b1]) / 2 + 0.5));
      teeth.push({ fdi, position, side: sideSign as -1 | 1, sMesial: b0 * STEP, sDistal: b1 * STEP, width: Math.abs(b1 - b0) * STEP, mesial: mesialPoint, distal: distalPoint, centre, tip, axis, height: top - floor, confidence });
    }
  }
  return {
    curve,
    teeth,
    vertexTooth,
    size: bestSize,
    signal: { s: Array.from({ length: bins }, (_, b) => b * STEP), cost: Array.from(smoothCost), width: Array.from(width), height: Array.from(height) },
  };
}

/** Vertex normals of an indexed mesh (area-weighted). */
export function vertexNormals(points: Float32Array, faces: Uint32Array): Float32Array {
  const nrm = new Float32Array(points.length);
  for (let t = 0; t < faces.length; t += 3) {
    const a = faces[t] * 3, b = faces[t + 1] * 3, c = faces[t + 2] * 3;
    const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2];
    const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { nrm[i] += nx; nrm[i + 1] += ny; nrm[i + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return nrm;
}

/**
 * How concave the surface is at each vertex: the mean height, along the vertex normal, of the surface
 * within `radius` mm (positive = the surface rises all round it: a crease, such as the gingival margin
 * or an interproximal groove; negative = a convexity, such as a cusp or an incisal edge).
 */
export function concavity(points: Float32Array, faces: Uint32Array, radius = 0.8): Float32Array {
  const n = points.length / 3;
  const nrm = vertexNormals(points, faces);
  const cell = radius;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i += 1) {
    const key = `${Math.floor(points[i * 3] / cell)},${Math.floor(points[i * 3 + 1] / cell)},${Math.floor(points[i * 3 + 2] / cell)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  }
  const out = new Float32Array(n);
  const r2 = radius * radius;
  for (let i = 0; i < n; i += 1) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
    let sum = 0, count = 0;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      const list = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
      if (!list) continue;
      for (const j of list) {
        const ex = points[j * 3] - x, ey = points[j * 3 + 1] - y, ez = points[j * 3 + 2] - z;
        if (ex * ex + ey * ey + ez * ez > r2 || j === i) continue;
        sum += ex * nrm[i * 3] + ey * nrm[i * 3 + 1] + ez * nrm[i * 3 + 2];
        count += 1;
      }
    }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

/** Vertex neighbours of an indexed mesh, compressed (start[i]..start[i+1] in next). */
function neighbours(n: number, faces: Uint32Array) {
  const count = new Uint32Array(n + 1);
  for (let t = 0; t < faces.length; t += 1) count[faces[t] + 1] += 2;
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i += 1) start[i + 1] = start[i] + count[i + 1];
  const fill = start.slice(0, n);
  const next = new Uint32Array(start[n]);
  for (let t = 0; t < faces.length; t += 3) {
    const a = faces[t], b = faces[t + 1], c = faces[t + 2];
    next[fill[a]++] = b; next[fill[a]++] = c;
    next[fill[b]++] = a; next[fill[b]++] = c;
    next[fill[c]++] = a; next[fill[c]++] = b;
  }
  return { start, next };
}
