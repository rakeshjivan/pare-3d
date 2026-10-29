/**
 * Build 94: occlusion for a wax-up at an increased vertical dimension (build 101: or at the patient's
 * own bite, unopened - the default; the wax then fits the bite as it is) - a virtual articulator, the
 * posterior wax brought into even contact at the opened bite, and the jaw moved through protrusion
 * and both lateral excursions to find (and carve away) wax interferences.
 *
 * Frame: the pair frame (lib/dentalArch pairFrame) - the lower's teeth up, the occlusal plane at
 * z = 0, the midline on x = 0, the front at -y. The upper stays put; the mandible moves.
 *
 * The articulator is an average-value one, from the literature (see the Wax-up Studio report):
 * - Bonwill's triangle: incisal point to each condyle ~105 mm, intercondylar ~105 mm;
 * - Balkwill's angle between the occlusal plane and Bonwill's triangle ~25 deg (condyles above the plane);
 * - condylar guidance ~30 deg to the occlusal plane, Bennett angle ~15 deg; no immediate side shift.
 * Opening is a rotation about the condylar axis; protrusion moves both condyles down their paths;
 * a lateral excursion turns the mandible about the working condyle while the other (non-working)
 * condyle travels forward, down and in. At each step the jaw opens just enough for the teeth not to
 * pass through each other: the teeth that touch then are the guidance.
 */
import * as THREE from "three";
import { cleanScan, pairFrame } from "@/lib/dentalArch";
import { PointGrid, transformSoup } from "@/lib/dentalMesh";

export type Articulator = { intercondylar: number; bonwill: number; balkwill: number; condylarGuidance: number; bennett: number };
export const AVERAGE_ARTICULATOR: Articulator = { intercondylar: 105, bonwill: 105, balkwill: 25, condylarGuidance: 30, bennett: 15 };
/** Teeth closer than this touch, mm. */
export const CONTACT = 0.05;
/** Posterior wax brought to within this of the opposing teeth at the opened bite, mm (even contact). */
export const STATIC_TARGET = 0.02;
const STATIC_ROUNDS = 8;
/** The most wax is carved back for an excursion, mm: past it the guidance, not the cusp, is at fault (reported). */
export const CARVE_MAX = 0.5;
/** Wax this close to the opposing teeth at the opened bite is a centric stop, mm. */
export const CENTRIC_STOP = 0.15;
/** What a carved interference keeps clear of the opposing teeth in the movements, mm. */
export const EXCURSION_CLEAR = 0.1;
/** How far the condyles travel in the sweep, mm, and in what steps. */
export const SWEEP_TRAVEL = 5;
export const SWEEP_STEP = 0.5;
/** Wax this little inside the opposing teeth is touching, not in them, mm. */
export const FIT_TOLERANCE = 0.01;
/** How deep inside the opposing teeth wax is looked for, mm. */
const FIT_REACH = 3;
/** Rounds of the fit to the bite (the second catches what the first one's trims brought near). */
const FIT_ROUNDS = 3;
/** How far a trim against the opposing teeth is feathered into the wax around it, mm. */
export const FEATHER = 0.8;
/** The most the opening at the incisors may be raised, mm (Abduo & Lyons 2012). */
export const OVD_MAX = 5;

export type Guidance = "canine" | "group";

/** A surface as points: triangle centres with their (outward) normals, and the tooth (FDI, 0 none) each belongs to. */
export type Surface = { p: Float32Array; n: Float32Array; fdi: Uint8Array; wax: Uint8Array };

/** One arch's soups as a surface: the scan (its triangles' FDI, if found) and each wax tooth (its FDI). */
export function surfaceOf(scan: Float32Array, scanFdi: Uint8Array | null, wax: Array<{ fdi: number; positions: Float32Array }>, keep: (z: number) => boolean): Surface {
  const p: number[] = [], n: number[] = [], f: number[] = [], w: number[] = [];
  const add = (soup: Float32Array, fdiOf: (t: number) => number, isWax: number) => {
    for (let t = 0; t < soup.length / 9; t += 1) {
      const o = t * 9;
      const cx = (soup[o] + soup[o + 3] + soup[o + 6]) / 3, cy = (soup[o + 1] + soup[o + 4] + soup[o + 7]) / 3, cz = (soup[o + 2] + soup[o + 5] + soup[o + 8]) / 3;
      if (!keep(cz)) continue;
      const ux = soup[o + 3] - soup[o], uy = soup[o + 4] - soup[o + 1], uz = soup[o + 5] - soup[o + 2];
      const vx = soup[o + 6] - soup[o], vy = soup[o + 7] - soup[o + 1], vz = soup[o + 8] - soup[o + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      p.push(cx, cy, cz); n.push(nx / l, ny / l, nz / l); f.push(fdiOf(t)); w.push(isWax);
    }
  };
  add(scan, (t) => (scanFdi ? scanFdi[t] : 0), 0);
  for (const tooth of wax) add(tooth.positions, () => tooth.fdi, 1);
  return { p: Float32Array.from(p), n: Float32Array.from(n), fdi: Uint8Array.from(f), wax: Uint8Array.from(w) };
}

/** Normals turned to face `toward` (+1: +z, the lower's teeth; -1: -z, the upper's) on the whole. */
export function orientSurface(s: Surface, toward: 1 | -1) {
  let sum = 0;
  for (let i = 2; i < s.n.length; i += 3) sum += s.n[i];
  if (sum * toward < 0) for (let i = 0; i < s.n.length; i += 1) s.n[i] = -s.n[i];
}

/** The articulator's points in the pair frame: the incisal point and the two condyles (x > 0 first). */
export function articulatorPoints(incisal: [number, number, number], a: Articulator = AVERAGE_ARTICULATOR) {
  const half = a.intercondylar / 2;
  const reach = Math.sqrt(Math.max(1, a.bonwill * a.bonwill - half * half));
  const b = (a.balkwill * Math.PI) / 180;
  const y = incisal[1] + reach * Math.cos(b), z = incisal[2] + reach * Math.sin(b);
  return { incisal, condyles: [new THREE.Vector3(half, y, z), new THREE.Vector3(-half, y, z)] as [THREE.Vector3, THREE.Vector3] };
}

/** The opening about the condylar axis that parts the incisal point by `mm` (vertically), radians. */
export function openingFor(mm: number, incisal: [number, number, number], a: Articulator = AVERAGE_ARTICULATOR) {
  const { condyles } = articulatorPoints(incisal, a);
  const dy = incisal[1] - condyles[0].y, dz = incisal[2] - condyles[0].z;
  const r = Math.hypot(dy, dz);
  // Turned by alpha the incisal point drops by r (sin(phi + alpha) - sin(phi)) where phi is its angle.
  const phi = Math.atan2(dz, dy);
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 50; i += 1) {
    const m = (lo + hi) / 2;
    const drop = dz - r * Math.sin(phi + m);
    if (drop < mm) lo = m; else hi = m;
  }
  void dy;
  return (lo + hi) / 2;
}

export type Movement = { kind: "rest" } | { kind: "protrusion"; travel: number } | { kind: "lateral"; toward: 1 | -1; travel: number };

/** The mandible's move for a movement and an opening (radians about the condylar axis there). */
export function mandiblePose(move: Movement, opening: number, incisal: [number, number, number], a: Articulator = AVERAGE_ARTICULATOR): THREE.Matrix4 {
  const { condyles } = articulatorPoints(incisal, a);
  const g = (a.condylarGuidance * Math.PI) / 180, b = (a.bennett * Math.PI) / 180;
  const open = (pivot: THREE.Vector3, axis: THREE.Vector3) => new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), opening)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  if (move.kind === "rest") return open(condyles[0], new THREE.Vector3(1, 0, 0));
  if (move.kind === "protrusion") {
    const t = new THREE.Vector3(0, -Math.cos(g), -Math.sin(g)).multiplyScalar(move.travel);
    const pivot = condyles[0].clone().add(t);
    return open(pivot, new THREE.Vector3(1, 0, 0)).multiply(new THREE.Matrix4().makeTranslation(t.x, t.y, t.z));
  }
  // Lateral towards `toward` (+1: +x): the working condyle on that side turns in place; the other
  // travels forward, down and towards the midline.
  const working = move.toward > 0 ? condyles[0] : condyles[1], other = move.toward > 0 ? condyles[1] : condyles[0];
  const medial = -Math.sign(other.x);
  const path = new THREE.Vector3(medial * Math.sin(b), -Math.cos(b) * Math.cos(g), -Math.cos(b) * Math.sin(g)).normalize();
  const moved = other.clone().addScaledVector(path, move.travel);
  const from = other.clone().sub(working).normalize(), to = moved.clone().sub(working).normalize();
  const align = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(from, to));
  const turn = new THREE.Matrix4().makeTranslation(working.x, working.y, working.z).multiply(align).multiply(new THREE.Matrix4().makeTranslation(-working.x, -working.y, -working.z));
  // The axis has turned; the opening is about the new axis (sign kept: +x-ward axis opens as at rest).
  const axis = to.clone().multiplyScalar(Math.sign(to.x) || 1);
  return open(working, axis).multiply(turn);
}

/** Point-to-plane signed distance of each of `pts` (moved by `m`) to `surface` (nearest centre), Infinity beyond reach. */
function distances(pts: Float32Array, m: THREE.Matrix4, surface: Surface, grid: PointGrid, out: Float32Array, nearestOut?: Int32Array) {
  const e = m.elements;
  for (let i = 0; i < pts.length / 3; i += 1) {
    const x0 = pts[i * 3], y0 = pts[i * 3 + 1], z0 = pts[i * 3 + 2];
    const x = e[0] * x0 + e[4] * y0 + e[8] * z0 + e[12], y = e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13], z = e[2] * x0 + e[6] * y0 + e[10] * z0 + e[14];
    const hit = grid.nearest(x, y, z);
    if (!hit) { out[i] = Infinity; if (nearestOut) nearestOut[i] = -1; continue; }
    const q = hit[0] * 3;
    out[i] = (x - surface.p[q]) * surface.n[q] + (y - surface.p[q + 1]) * surface.n[q + 1] + (z - surface.p[q + 2]) * surface.n[q + 2];
    if (nearestOut) nearestOut[i] = hit[0];
  }
}

export type PoseContact = { lower: number; upper: number; distance: number };
export type PoseResult = { opening: number; contacts: PoseContact[] };

/**
 * The jaw at a movement: opened just enough (from `least` up) for the points `use` picks of the lower
 * surface to clear the upper by 0 (CONTACT counts as touching). Returns the opening and the contacts
 * (lower and upper tooth numbers) of all points within CONTACT then.
 */
export function solvePose(move: Movement, least: number, lower: Surface, upper: Surface, grid: PointGrid, incisal: [number, number, number], a: Articulator, use: (i: number, upperIndex: number) => boolean = () => true): PoseResult {
  const n = lower.p.length / 3;
  const d = new Float32Array(n), near = new Int32Array(n);
  const worst = (opening: number) => {
    distances(lower.p, mandiblePose(move, opening, incisal, a), upper, grid, d, near);
    let w = Infinity;
    for (let i = 0; i < n; i += 1) if (d[i] < w && near[i] >= 0 && use(i, near[i])) w = d[i];
    return w;
  };
  let lo = least, hi = least + 0.25;
  if (worst(lo) >= 0) hi = lo;
  else for (let k = 0; k < 18; k += 1) { const mid = (lo + hi) / 2; if (worst(mid) < 0) lo = mid; else hi = mid; }
  distances(lower.p, mandiblePose(move, hi, incisal, a), upper, grid, d, near);
  const contacts: PoseContact[] = [];
  for (let i = 0; i < n; i += 1) if (near[i] >= 0 && d[i] < CONTACT) contacts.push({ lower: lower.fdi[i], upper: upper.fdi[near[i]], distance: d[i] });
  return { opening: hi, contacts };
}

/** Kind of tooth from its FDI number: 1-2 incisors, 3 canine, 4-5 premolars, 6-8 molars. */
const rank = (fdi: number) => fdi % 10;
/** Which side of the midline a tooth is, in the pair frame (lower teeth up): +1 at +x. Lower right (4x) and upper right (1x) are at -x. */
export const sideOf = (fdi: number) => { const q = Math.floor(fdi / 10); return q === 1 || q === 4 ? -1 : q ? 1 : 0; };

/** Whether a contact between teeth `l` (lower) and `u` (upper) guides `move` under `scheme`. */
export function guides(move: Movement, scheme: Guidance, l: number, u: number) {
  const front = (f: number) => f > 0 && rank(f) <= 2;
  const canine = (f: number) => f > 0 && rank(f) === 3;
  if (move.kind === "protrusion") return front(l) || front(u) || ((canine(l) || canine(u)) && scheme === "group");
  if (move.kind === "lateral") {
    // The incisors may share a lateral excursion's guidance (anterior group); they are never an interference here.
    if (front(l) || front(u)) return true;
    const onWorking = (f: number) => f > 0 && sideOf(f) === move.toward;
    if (scheme === "canine") return (canine(u) && onWorking(u)) || (canine(l) && onWorking(l));
    return (onWorking(u) && rank(u) >= 3) || (onWorking(l) && rank(l) >= 3);
  }
  return true;
}

export type SweepFinding = { move: Movement; lower: number; upper: number; distance: number; kind: "interference" | "nonworking"; wax: boolean };
export type SweepReport = { findings: SweepFinding[]; guidanceMissing: Movement[] };

/** Every so many points of a surface, at most `cap`. */
export function thin(s: Surface, cap: number): Surface {
  const n = s.p.length / 3;
  if (n <= cap) return s;
  const step = n / cap;
  const keep: number[] = [];
  for (let k = 0; k < cap; k += 1) keep.push(Math.floor(k * step));
  const pick = <T extends Float32Array | Uint8Array>(a: T, w: number) => { const out = new (a.constructor as { new (n: number): T })(keep.length * w); keep.forEach((i, k) => { for (let j = 0; j < w; j += 1) out[k * w + j] = a[i * w + j]; }); return out; };
  return { p: pick(s.p, 3), n: pick(s.n, 3), fdi: pick(s.fdi, 1), wax: pick(s.wax, 1) };
}

/**
 * Build 101: lines straight along z through a triangle soup - where a point is inside the surface
 * (crossed an odd number of times going one way along z) and how far it is to where it comes out.
 */
export class VerticalCaster {
  private cells = new Map<number, number[]>();
  constructor(private soup: Float32Array, private cell = 0.6) {
    for (let t = 0; t < soup.length / 9; t += 1) {
      const o = t * 9;
      const x0 = Math.floor(Math.min(soup[o], soup[o + 3], soup[o + 6]) / cell), x1 = Math.floor(Math.max(soup[o], soup[o + 3], soup[o + 6]) / cell);
      const y0 = Math.floor(Math.min(soup[o + 1], soup[o + 4], soup[o + 7]) / cell), y1 = Math.floor(Math.max(soup[o + 1], soup[o + 4], soup[o + 7]) / cell);
      for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) {
        const k = ix * 1000003 + iy;
        const list = this.cells.get(k);
        if (list) list.push(t); else this.cells.set(k, [t]);
      }
    }
  }
  /** Inside: the distance along `dir` (+1 up, -1 down) to the surface's nearest crossing; -1 outside (or past `reach`). */
  exit(px: number, py: number, pz: number, dir: 1 | -1, reach: number): number {
    // A hair off any shared edge or corner, so a crossing is counted once.
    const x = px + 1.3e-5, y = py + 0.7e-5;
    const list = this.cells.get(Math.floor(x / this.cell) * 1000003 + Math.floor(y / this.cell));
    if (!list) return -1;
    const s = this.soup;
    let crossings = 0, nearest = Infinity;
    for (const t of list) {
      const o = t * 9;
      const ax = s[o], ay = s[o + 1], bx = s[o + 3], by = s[o + 4], cx = s[o + 6], cy = s[o + 7];
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-12) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
      const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
      const w = 1 - u - v;
      if (u < 0 || v < 0 || w < 0) continue;
      const z = u * s[o + 2] + v * s[o + 5] + w * s[o + 8];
      const along = (z - pz) * dir;
      if (along <= 0) continue;
      crossings += 1;
      if (along < nearest) nearest = along;
    }
    return crossings % 2 === 1 && nearest <= reach ? nearest : -1;
  }
}

export type WaxTooth = { fdi: number; positions: Float32Array };
export type OcclusionInput = {
  upperScan: Float32Array; upperFdi: Uint8Array | null; lowerScan: Float32Array; lowerFdi: Uint8Array | null;
  upperWax: WaxTooth[]; lowerWax: WaxTooth[];
  /** The opening at the incisors, mm (the pin raised). */
  raise: number;
  articulator?: Articulator;
  scheme?: Guidance;
};
export type ToothContact = { fdi: number; gap: number; wax: boolean };
export type OcclusionResult = {
  upperWax: WaxTooth[]; lowerWax: WaxTooth[];
  /** The opening at the incisors and at each lower tooth (mm) - a hinge opens the back teeth less. */
  openings: Array<{ fdi: number; mm: number }>;
  /** At the opened bite: each tooth's closest approach to the opposing teeth after the posterior wax was brought into contact. */
  rest: ToothContact[];
  sweep: SweepReport;
  /** Wax carved away, mm at most, per tooth. */
  carved: Array<{ fdi: number; mm: number }>;
  /** Build 101: wax trimmed back to the opposing teeth at the bite it is made for, mm at most, per tooth. */
  fitted: Array<{ fdi: number; mm: number }>;
  /** Build 95: the lower's move to the opened bite (the designed vertical dimension), in the input's frame, column-major. */
  lowerPose?: number[];
};

/** The lower's incisal point: its frontmost tooth point near the midline at the occlusal plane. */
export function incisalPoint(lowerScan: Float32Array): [number, number, number] {
  let front = Infinity, z = 0;
  for (let i = 0; i < lowerScan.length; i += 3) {
    if (Math.abs(lowerScan[i]) > 4 || lowerScan[i + 2] < -3) continue;
    if (lowerScan[i + 1] < front) { front = lowerScan[i + 1]; z = lowerScan[i + 2]; }
  }
  return [0, Number.isFinite(front) ? front : -25, Number.isFinite(front) ? Math.max(z, -1) : 0];
}

/**
 * Build 94: the occlusion of a wax-up at an opened bite (pair frame). 1. The jaw opened `raise` mm
 * at the incisors about the condylar axis. 2. Each posterior wax tooth's occlusal surface raised or
 * lowered (scaled along z about its cervical end) until its closest point is STATIC_TARGET from the
 * opposing teeth - half each where both opposing teeth are wax - over a few rounds. 3. The jaw moved
 * through protrusion and both lateral excursions to SWEEP_TRAVEL; at each step opened just enough
 * for the guiding teeth (the scheme's) to clear; every other contact closer than EXCURSION_CLEAR is
 * an interference (on the non-working side, always a fault), and wax there is carved straight back
 * (smoothly) until it clears. The patient's own teeth are never changed: their interferences are reported.
 */
export function occlusionWork(input: OcclusionInput): OcclusionResult {
  const a = input.articulator ?? AVERAGE_ARTICULATOR;
  const scheme = input.scheme ?? "canine";
  const incisal = incisalPoint(input.lowerScan);
  const rest = openingFor(Math.max(0, Math.min(OVD_MAX * 2, input.raise)), incisal, a);
  const restPose = mandiblePose({ kind: "rest" }, rest, incisal, a);
  let upperWax: WaxTooth[] = input.upperWax.map((t) => ({ fdi: t.fdi, positions: Float32Array.from(t.positions) }));
  let lowerWax: WaxTooth[] = input.lowerWax.map((t) => ({ fdi: t.fdi, positions: Float32Array.from(t.positions) }));
  const keepLower = (z: number) => z > -7, keepUpper = (z: number) => z < 7;
  const surfaces = (full = false) => {
    const all = surfaceOf(input.lowerScan, input.lowerFdi, lowerWax, keepLower);
    const lower = full ? all : thin(all, 30000);
    const upper = surfaceOf(input.upperScan, input.upperFdi, upperWax, keepUpper);
    orientSurface(lower, 1); orientSurface(upper, -1);
    return { lower, upper, upperGrid: new PointGrid(upper.p, 1.5), lowerGrid: new PointGrid(lower.p, 1.5) };
  };
  const waxOf = (list: WaxTooth[]) => new Set(list.map((t) => t.fdi));
  // 2. Even contact at the opened bite.
  const posterior = (fdi: number) => fdi % 10 >= 4;
  for (let round = 0; round < STATIC_ROUNDS; round += 1) {
    const { lower, upper, upperGrid, lowerGrid } = surfaces();
    const upperWaxSet = waxOf(upperWax), lowerWaxSet = waxOf(lowerWax);
    const inverse = restPose.clone().invert();
    const adjust = (tooth: WaxTooth, isUpper: boolean) => {
      // The front teeth touch lightly too (shimstock), for anterior guidance: the lower's wax is
      // lengthened (or shortened) to meet the upper's palatal surfaces; the upper's (the smile) is kept.
      if (!posterior(tooth.fdi) && isUpper) return tooth;
      const pts = tooth.positions;
      // Its corners' distances to the opposing teeth at the opened bite.
      const d = new Float32Array(pts.length / 3), near = new Int32Array(pts.length / 3);
      if (isUpper) distances(pts, inverse, lower, lowerGrid, d, near);
      else distances(pts, restPose, upper, upperGrid, d, near);
      let gap = Infinity, at = -1;
      for (let i = 0; i < d.length; i += 1) if (near[i] >= 0 && d[i] < gap) { gap = d[i]; at = i; }
      if (at < 0 || !Number.isFinite(gap)) return tooth;
      const opposite = isUpper ? lower : upper;
      const shared = posterior(tooth.fdi) && opposite.wax[near[at]] && (isUpper ? lowerWaxSet : upperWaxSet).has(opposite.fdi[near[at]]) ? 0.5 : 1;
      const move = (gap - STATIC_TARGET) * shared;
      if (Math.abs(move) < 0.005) return tooth;
      let lo = Infinity, hi = -Infinity;
      for (let i = 2; i < pts.length; i += 3) { lo = Math.min(lo, pts[i]); hi = Math.max(hi, pts[i]); }
      // Lower teeth up: cervical at lo, the gap point rises; upper teeth down: cervical at hi, it drops.
      const cerv = isUpper ? hi : lo, h = pts[at * 3 + 2] - cerv;
      if (Math.abs(h) < 1) return tooth;
      const k = 1 + (isUpper ? -move : move) / h;
      const out = Float32Array.from(pts);
      for (let i = 2; i < out.length; i += 3) out[i] = cerv + (out[i] - cerv) * k;
      return { fdi: tooth.fdi, positions: out };
    };
    lowerWax = lowerWax.map((t) => adjust(t, false));
    upperWax = upperWax.map((t) => adjust(t, true));
  }
  // 2b. Build 101: the wax complies with the bite - no wax inside the opposing teeth (or their wax)
  // at the bite it is made for (the original bite unless the user opened it). Wax that would be
  // is trimmed back to the opposing surface, just touching (feathered over FEATHER mm); the front
  // teeth too, on the side facing the opposing arch (the smile's labial side never meets it).
  const fitted = new Map<number, number>();
  for (let round = 0; round < FIT_ROUNDS; round += 1) {
    const inverse = restPose.clone().invert();
    // Each arch whole (scan and wax), as triangles. Wax is inside the opposing arch where a line from it
    // straight through the occlusal plane, away from that arch, crosses the arch's surface an odd number
    // of times; it is trimmed back along that line to where it comes out - the way the articulator closes,
    // as a technician grinds wax in. (A nearest-point reading takes a thin incisal edge's far side.)
    const join = (scan: Float32Array, wax: WaxTooth[]) => { const all = new Float32Array(scan.length + wax.reduce((n, w) => n + w.positions.length, 0)); all.set(scan); let at = scan.length; for (const w of wax) { all.set(w.positions, at); at += w.positions.length; } return all; };
    const lowerCast = new VerticalCaster(join(input.lowerScan, lowerWax)), upperCast = new VerticalCaster(join(input.upperScan, upperWax));
    const fit = (tooth: WaxTooth, isUpper: boolean): WaxTooth => {
      const pts = tooth.positions;
      const count = pts.length / 3;
      // Into the opposing arch's frame (the upper stays; the lower is at the rest pose).
      const to = isUpper ? inverse : restPose, back = isUpper ? restPose : inverse;
      const te = to.elements;
      // Upper wax in the lower comes out upwards; lower wax in the upper, downwards.
      const dir = isUpper ? 1 : -1;
      const cast = isUpper ? lowerCast : upperCast;
      const push = new Float32Array(count * 3);
      const inside: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const x0 = pts[i * 3], y0 = pts[i * 3 + 1], z0 = pts[i * 3 + 2];
        const x = te[0] * x0 + te[4] * y0 + te[8] * z0 + te[12], y = te[1] * x0 + te[5] * y0 + te[9] * z0 + te[13], z = te[2] * x0 + te[6] * y0 + te[10] * z0 + te[14];
        const depth = cast.exit(x, y, z, dir, FIT_REACH);
        if (!(depth > FIT_TOLERANCE)) continue;
        push[i * 3 + 2] = dir * depth;
        inside.push(i);
      }
      if (!inside.length) return tooth;
      // Feathered: corners near a trimmed one move part of the way, so no step is left.
      const moved = new Float32Array(push);
      const size = new Float32Array(count);
      for (const i of inside) size[i] = Math.hypot(push[i * 3], push[i * 3 + 1], push[i * 3 + 2]);
      // The corners in cells FEATHER across, to find those near a trimmed one.
      const cellOf = (j: number) => `${Math.floor(pts[j * 3] / FEATHER)},${Math.floor(pts[j * 3 + 1] / FEATHER)},${Math.floor(pts[j * 3 + 2] / FEATHER)}`;
      const cells = new Map<string, number[]>();
      for (let j = 0; j < count; j += 1) { const key = cellOf(j); const list = cells.get(key); if (list) list.push(j); else cells.set(key, [j]); }
      const around = (i: number) => {
        const cx = Math.floor(pts[i * 3] / FEATHER), cy = Math.floor(pts[i * 3 + 1] / FEATHER), cz = Math.floor(pts[i * 3 + 2] / FEATHER);
        const found: number[] = [];
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) { const list = cells.get(`${cx + dx},${cy + dy},${cz + dz}`); if (list) for (const j of list) found.push(j); }
        return found;
      };
      // Largest trims first, so each corner keeps the strongest pull on it.
      inside.sort((x, y) => size[y] - size[x]);
      const pulled = new Float32Array(count);
      for (const i of inside) pulled[i] = size[i];
      for (const i of inside) {
        for (const j of around(i)) {
          if (pulled[j] >= size[i]) continue;
          const r = Math.hypot(pts[j * 3] - pts[i * 3], pts[j * 3 + 1] - pts[i * 3 + 1], pts[j * 3 + 2] - pts[i * 3 + 2]);
          if (r >= FEATHER) continue;
          const f = 1 - r / FEATHER;
          if (size[i] * f > pulled[j]) { pulled[j] = size[i] * f; for (let k = 0; k < 3; k += 1) moved[j * 3 + k] = push[i * 3 + k] * f; }
        }
      }
      // Pushes are in the opposing frame: rotate them back (directions only).
      const rot = new THREE.Matrix3().setFromMatrix4(back);
      const e = rot.elements;
      const out = Float32Array.from(pts);
      let most = 0;
      for (let j = 0; j < count; j += 1) {
        const x = moved[j * 3], y = moved[j * 3 + 1], z = moved[j * 3 + 2];
        if (!x && !y && !z) continue;
        out[j * 3] += e[0] * x + e[3] * y + e[6] * z;
        out[j * 3 + 1] += e[1] * x + e[4] * y + e[7] * z;
        out[j * 3 + 2] += e[2] * x + e[5] * y + e[8] * z;
        most = Math.max(most, Math.hypot(x, y, z));
      }
      fitted.set(tooth.fdi, Math.max(fitted.get(tooth.fdi) ?? 0, most));
      return { fdi: tooth.fdi, positions: out };
    };
    upperWax = upperWax.map((t) => fit(t, true));
    lowerWax = lowerWax.map((t) => fit(t, false));
  }
  // 3. The movements.
  const findings: SweepFinding[] = [];
  const guidanceMissing: Movement[] = [];
  const lowerShift = lowerWax.map((t) => new Float32Array(t.positions.length / 3));
  const upperShift = upperWax.map((t) => new Float32Array(t.positions.length / 3));
  const { lower, upper, upperGrid, lowerGrid } = surfaces();
  // The centric stops (wax corners touching at the opened bite) are kept: carving them would lose
  // the even contact; an interference there is the guidance's to cure (reported).
  const restPoseInverse = restPose.clone().invert();
  const stopsOf = (list: WaxTooth[], isUpper: boolean) => list.map((tooth) => {
    const dd = new Float32Array(tooth.positions.length / 3), nn = new Int32Array(tooth.positions.length / 3);
    if (isUpper) distances(tooth.positions, restPoseInverse, lower, lowerGrid, dd, nn);
    else distances(tooth.positions, restPose, upper, upperGrid, dd, nn);
    return Uint8Array.from(dd, (v, i) => (nn[i] >= 0 && v < CENTRIC_STOP ? 1 : 0));
  });
  const lowerStops = stopsOf(lowerWax, false), upperStops = stopsOf(upperWax, true);
  const moves: Movement[] = [];
  for (let travel = SWEEP_STEP; travel <= SWEEP_TRAVEL + 1e-9; travel += SWEEP_STEP) moves.push({ kind: "protrusion", travel }, { kind: "lateral", toward: 1, travel }, { kind: "lateral", toward: -1, travel });
  for (const move of moves) {
    const guided = solvePose(move, rest - 0.05, lower, upper, upperGrid, incisal, a, (i, u) => guides(move, scheme, lower.fdi[i], upper.fdi[u]));
    const touched = guided.contacts.some((c) => guides(move, scheme, c.lower, c.upper));
    if (!touched) guidanceMissing.push(move);
    const pose = mandiblePose(move, guided.opening, incisal, a);
    const inverse = pose.clone().invert();
    // Everything else within EXCURSION_CLEAR at that pose.
    const n = lower.p.length / 3;
    const d = new Float32Array(n), near = new Int32Array(n);
    distances(lower.p, pose, upper, upperGrid, d, near);
    for (let i = 0; i < n; i += 1) {
      if (near[i] < 0 || d[i] >= EXCURSION_CLEAR) continue;
      const l = lower.fdi[i], u = upper.fdi[near[i]];
      // Gum and tissue (no tooth) are left out; a guiding contact is the guidance.
      if (!l || !u || guides(move, scheme, l, u)) continue;
      // Non-working: a posterior tooth on the side the jaw moves away from.
      const nonworking = move.kind === "lateral" && l % 10 >= 4 && sideOf(l) === -move.toward;
      findings.push({ move, lower: l, upper: u, distance: d[i], kind: nonworking ? "nonworking" : "interference", wax: Boolean(lower.wax[i] || upper.wax[near[i]]) });
    }
    // Carving: wax corners too close, straight back from the opposing arch.
    const carve = (list: WaxTooth[], shifts: Float32Array[], isUpper: boolean) => list.forEach((tooth, k) => {
      const pts = tooth.positions;
      const stops = (isUpper ? upperStops : lowerStops)[k];
      // The front teeth's wax is the smile and the guidance: never carved by the sweep (their contacts are reported).
      if (tooth.fdi % 10 <= 3) return;
      const dd = new Float32Array(pts.length / 3), nn = new Int32Array(pts.length / 3);
      if (isUpper) distances(pts, inverse, lower, lowerGrid, dd, nn);
      else distances(pts, pose, upper, upperGrid, dd, nn);
      for (let i = 0; i < dd.length; i += 1) {
        if (nn[i] < 0 || dd[i] >= EXCURSION_CLEAR) continue;
        const other = isUpper ? lower.fdi[nn[i]] : upper.fdi[nn[i]];
        if (!other || stops[i] || guides(move, scheme, isUpper ? other : tooth.fdi, isUpper ? tooth.fdi : other)) continue;
        shifts[k][i] = Math.max(shifts[k][i], Math.min(CARVE_MAX, EXCURSION_CLEAR - dd[i]));
      }
    });
    carve(lowerWax, lowerShift, false);
    carve(upperWax, upperShift, true);
  }
  // Smoothed (the carve feathered over 0.6 mm), then applied: lower wax down, upper wax up.
  const apply = (list: WaxTooth[], shifts: Float32Array[], sign: number) => list.map((tooth, k) => {
    const s = shifts[k];
    if (!s.some((v) => v > 0)) return { tooth, mm: 0 };
    const pts = tooth.positions;
    const grid = new PointGrid(pts, 0.6);
    const out = Float32Array.from(pts);
    let most = 0;
    const carved: number[] = [];
    for (let i = 0; i < s.length; i += 1) if (s[i] > 0) carved.push(i);
    const smooth = new Float32Array(s.length);
    for (const i of carved) {
      // Spread to corners within 0.6 mm, falling off linearly.
      for (let j = 0; j < s.length; j += 1) {
        const dx = pts[j * 3] - pts[i * 3], dy = pts[j * 3 + 1] - pts[i * 3 + 1], dz = pts[j * 3 + 2] - pts[i * 3 + 2];
        const r = Math.hypot(dx, dy, dz);
        if (r < 0.6) smooth[j] = Math.max(smooth[j], s[i] * (1 - r / 0.6));
      }
    }
    void grid;
    for (let i = 0; i < s.length; i += 1) { const v = Math.max(s[i], smooth[i]); out[i * 3 + 2] += sign * v; most = Math.max(most, v); }
    return { tooth: { fdi: tooth.fdi, positions: out }, mm: most };
  });
  const lowerDone = apply(lowerWax, lowerShift, -1), upperDone = apply(upperWax, upperShift, 1);
  lowerWax = lowerDone.map((x) => x.tooth); upperWax = upperDone.map((x) => x.tooth);
  // The result at the opened bite, per tooth.
  const final = surfaces();
  const n = final.lower.p.length / 3;
  const d = new Float32Array(n), near = new Int32Array(n);
  distances(final.lower.p, restPose, final.upper, final.upperGrid, d, near);
  // Build 101: a point-to-plane reading is a clearance only; inside the opposing teeth (by the vertical
  // line, as the fit reads it) the gap is how deep, below 0 - so the readout matches what is made.
  {
    const join = (scan: Float32Array, wax: WaxTooth[]) => { const all = new Float32Array(scan.length + wax.reduce((m, w) => m + w.positions.length, 0)); all.set(scan); let at = scan.length; for (const w of wax) { all.set(w.positions, at); at += w.positions.length; } return all; };
    const cast = new VerticalCaster(join(input.upperScan, upperWax));
    const e = restPose.elements;
    for (let i = 0; i < n; i += 1) {
      if (near[i] < 0) continue;
      const x0 = final.lower.p[i * 3], y0 = final.lower.p[i * 3 + 1], z0 = final.lower.p[i * 3 + 2];
      const x = e[0] * x0 + e[4] * y0 + e[8] * z0 + e[12], y = e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13], z = e[2] * x0 + e[6] * y0 + e[10] * z0 + e[14];
      const depth = cast.exit(x, y, z, -1, FIT_REACH);
      d[i] = depth > 0 ? -depth : Math.max(0, d[i]);
    }
  }
  const best = new Map<number, ToothContact>();
  for (let i = 0; i < n; i += 1) {
    const fdi = final.lower.fdi[i];
    if (!fdi || near[i] < 0) continue;
    const was = best.get(fdi);
    if (!was || d[i] < was.gap) best.set(fdi, { fdi, gap: d[i], wax: Boolean(final.lower.wax[i] || final.upper.wax[near[i]]) });
  }
  // Openings: how far each lower tooth moves at the opened bite.
  const openings: Array<{ fdi: number; mm: number }> = [{ fdi: 0, mm: input.raise }];
  const centre = new Map<number, number[]>();
  for (let i = 0; i < lower.p.length / 3; i += 1) { const f = lower.fdi[i]; if (!f) continue; const c = centre.get(f) ?? [0, 0, 0, 0]; c[0] += lower.p[i * 3]; c[1] += lower.p[i * 3 + 1]; c[2] += lower.p[i * 3 + 2]; c[3] += 1; centre.set(f, c); }
  for (const [fdi, c] of centre) {
    const v = new THREE.Vector3(c[0] / c[3], c[1] / c[3], c[2] / c[3]);
    const w = v.clone().applyMatrix4(restPose);
    openings.push({ fdi, mm: Math.round((v.z - w.z) * 100) / 100 });
  }
  return {
    upperWax, lowerWax, openings: openings.sort((x, y) => x.fdi - y.fdi),
    rest: [...best.values()].sort((x, y) => x.fdi - y.fdi),
    sweep: { findings, guidanceMissing },
    carved: [...lowerDone.map((x, k) => ({ fdi: lowerWax[k].fdi, mm: x.mm })), ...upperDone.map((x, k) => ({ fdi: upperWax[k].fdi, mm: x.mm }))].filter((x) => x.mm > 0),
    fitted: [...fitted].filter(([, mm]) => mm > 0.005).map(([fdi, mm]) => ({ fdi, mm })).sort((x, y) => x.fdi - y.fdi),
  };
}

/** Build 94: occlusionWork on soups in any one frame (the studio's): into the pair frame and back. */
export function occlusionInScanFrame(input: OcclusionInput): OcclusionResult {
  const { frame } = pairFrame(cleanScan(input.upperScan), cleanScan(input.lowerScan));
  const back = frame.clone().invert();
  const move = (list: WaxTooth[], m: THREE.Matrix4) => list.map((t) => ({ fdi: t.fdi, positions: transformSoup(t.positions, m) }));
  const result = occlusionWork({ ...input, upperScan: transformSoup(input.upperScan, frame), lowerScan: transformSoup(input.lowerScan, frame), upperWax: move(input.upperWax, frame), lowerWax: move(input.lowerWax, frame) });
  const incisal = incisalPoint(transformSoup(input.lowerScan, frame));
  const a = input.articulator ?? AVERAGE_ARTICULATOR;
  const pose = mandiblePose({ kind: "rest" }, openingFor(Math.max(0, Math.min(OVD_MAX * 2, input.raise)), incisal, a), incisal, a);
  const lowerPose = back.clone().multiply(pose).multiply(frame).toArray();
  return { ...result, upperWax: move(result.upperWax, back), lowerWax: move(result.lowerWax, back), lowerPose };
}
