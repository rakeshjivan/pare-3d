/**
 * Fork (build 36): rules a sketch keeps, as in Fusion or Shapr3D - a line stays horizontal or
 * vertical, two lines stay parallel, at right angles or of equal length, a line keeps the length
 * it was given. After every edit the sketch is moved the least it takes to keep them: the points
 * the person just moved (and locked points) stay where they are put, the others follow.
 *
 * The solver is a few rounds of projections - each rule in turn moves its points the shortest way
 * to being true - which settles in a handful of rounds for the small sketches people draw.
 */
import type { SketchConstraint, SketchPoint, SketchProfile } from "@/types/layerling";

export type { SketchConstraint };
export type SketchConstraintKind = SketchConstraint["kind"];

/** Rules on one line, and on a pair of lines. */
export const SINGLE_LINE_CONSTRAINTS = ["horizontal", "vertical", "length"] as const;
export const LINE_PAIR_CONSTRAINTS = ["parallel", "perpendicular", "equal"] as const;

const TOLERANCE = 1e-6;
const ROUNDS = 80;

type Vec = { x: number; z: number };

/** The rules whose lines are all still there (a line deleted takes its rules with it). */
export function liveConstraints(profile: SketchProfile): SketchConstraint[] {
  const segments = new Set(profile.segments.map((segment) => segment.id));
  return (profile.constraints ?? []).filter((constraint) => "b" in constraint
    ? segments.has(constraint.a) && segments.has(constraint.b) && constraint.a !== constraint.b
    : segments.has(constraint.segmentId));
}

/** The rules on one line. */
export function constraintsOnSegment(profile: SketchProfile, segmentId: string) {
  return liveConstraints(profile).filter((constraint) => ("b" in constraint ? constraint.a === segmentId || constraint.b === segmentId : constraint.segmentId === segmentId));
}

/**
 * Adds a rule (replacing one it contradicts on the same line - horizontal against vertical, a
 * second length) and returns the new list.
 */
export function addConstraint(profile: SketchProfile, constraint: SketchConstraint): SketchConstraint[] {
  const existing = liveConstraints(profile);
  const lines = "b" in constraint ? [constraint.a, constraint.b] : [constraint.segmentId];
  const kept = existing.filter((other) => {
    if ("b" in constraint) {
      // One relation per pair of lines.
      return !("b" in other && lines.includes(other.a) && lines.includes(other.b));
    }
    if ("b" in other || other.segmentId !== constraint.segmentId) return true;
    const axis = (kind: SketchConstraintKind) => kind === "horizontal" || kind === "vertical";
    if (axis(constraint.kind) && axis(other.kind)) return false;
    return other.kind !== constraint.kind;
  });
  return [...kept, constraint];
}

/** How far a rule is from true, in mm (or mm along the line for angles). */
function residual(constraint: SketchConstraint, at: (id: string) => Vec, ends: (segmentId: string) => [string, string] | null): number {
  if ("b" in constraint) {
    const a = ends(constraint.a);
    const b = ends(constraint.b);
    if (!a || !b) return 0;
    const da = sub(at(a[1]), at(a[0]));
    const db = sub(at(b[1]), at(b[0]));
    const la = Math.hypot(da.x, da.z);
    const lb = Math.hypot(db.x, db.z);
    if (la < TOLERANCE || lb < TOLERANCE) return 0;
    if (constraint.kind === "equal") return Math.abs(la - lb);
    const cross = (da.x * db.z - da.z * db.x) / (la * lb);
    const dot = (da.x * db.x + da.z * db.z) / (la * lb);
    return (constraint.kind === "parallel" ? Math.abs(cross) : Math.abs(dot)) * Math.min(la, lb);
  }
  const e = ends(constraint.segmentId);
  if (!e) return 0;
  const p = at(e[0]);
  const q = at(e[1]);
  if (constraint.kind === "horizontal") return Math.abs(q.z - p.z);
  if (constraint.kind === "vertical") return Math.abs(q.x - p.x);
  return constraint.kind === "length" ? Math.abs(Math.hypot(q.x - p.x, q.z - p.z) - constraint.value) : 0;
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, z: a.z - b.z });

export type SolveResult = { profile: SketchProfile; satisfied: boolean; worst: number };

/**
 * Moves the points so the rules hold. `pinned` points (those just moved by hand) and locked points
 * stay put while that is possible; when the rules cannot all hold with them where they are, they
 * are let go and everything moves a little.
 */
export function solveSketchConstraints(profile: SketchProfile, pinned: ReadonlySet<string> = new Set()): SolveResult {
  const constraints = liveConstraints(profile);
  if (constraints.length === 0) return { profile: (profile.constraints?.length ?? 0) ? { ...profile, constraints: [] } : profile, satisfied: true, worst: 0 };
  const attempt = (holdMoved: boolean) => {
    const positions = new Map<string, Vec>(profile.points.map((point) => [point.id, { x: point.x, z: point.z }]));
    const fixed = new Set(profile.points.filter((point) => point.locked || (holdMoved && pinned.has(point.id))).map((point) => point.id));
    const segmentEnds = new Map(profile.segments.map((segment) => [segment.id, [segment.startId, segment.endId] as [string, string]]));
    const ends = (id: string) => segmentEnds.get(id) ?? null;
    const at = (id: string) => positions.get(id) ?? { x: 0, z: 0 };
    // Points nearer what was just moved do the giving; those further off barely move (a hundredth
    // per line away), so dragging one corner of a rectangle leaves the opposite corner where it is.
    const hops = new Map<string, number>();
    const queue = [...pinned].filter((id) => positions.has(id));
    queue.forEach((id) => hops.set(id, 0));
    for (let i = 0; i < queue.length; i += 1) {
      const id = queue[i];
      for (const segment of profile.segments) {
        const next = segment.startId === id ? segment.endId : segment.endId === id ? segment.startId : null;
        if (next && !hops.has(next)) {
          hops.set(next, (hops.get(id) ?? 0) + 1);
          queue.push(next);
        }
      }
    }
    const weight = (id: string) => {
      if (fixed.has(id)) return 0;
      const away = hops.get(id);
      if (away === undefined) return 1;
      return away === 0 ? 1e-4 : Math.pow(0.01, away - 1);
    };
    const move = (id: string, dx: number, dz: number) => {
      const point = positions.get(id);
      if (!point || fixed.has(id)) return;
      point.x += dx;
      point.z += dz;
    };
    /** Sets a line to `direction` and `length`, turning and stretching it about the point that may not move. */
    const setLine = (segmentId: string, direction: Vec | null, length: number | null) => {
      const e = ends(segmentId);
      if (!e) return;
      const [s, t] = e;
      const p = at(s);
      const q = at(t);
      const d = sub(q, p);
      const current = Math.hypot(d.x, d.z);
      if (current < TOLERANCE && !direction) return;
      const unit = direction ?? { x: d.x / current, z: d.z / current };
      const wantLength = length ?? current;
      const ws = weight(s);
      const wt = weight(t);
      if (ws + wt === 0) return;
      // The point the line turns about: the fixed end, or the middle.
      const share = ws / (ws + wt); // how much of the change the start takes
      const pivot = { x: p.x + d.x * share, z: p.z + d.z * share };
      const newP = { x: pivot.x - unit.x * wantLength * share, z: pivot.z - unit.z * wantLength * share };
      const newQ = { x: pivot.x + unit.x * wantLength * (1 - share), z: pivot.z + unit.z * wantLength * (1 - share) };
      move(s, newP.x - p.x, newP.z - p.z);
      move(t, newQ.x - q.x, newQ.z - q.z);
    };
    const lineVector = (segmentId: string) => {
      const e = ends(segmentId);
      return e ? sub(at(e[1]), at(e[0])) : { x: 0, z: 0 };
    };
    const lineMobility = (segmentId: string) => {
      const e = ends(segmentId);
      return e ? weight(e[0]) + weight(e[1]) : 0;
    };
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const constraint of constraints) {
        if (!("b" in constraint) && (constraint.kind === "horizontal" || constraint.kind === "vertical")) {
          const d = lineVector(constraint.segmentId);
          const length = Math.hypot(d.x, d.z);
          if (length < TOLERANCE) continue;
          const sign = constraint.kind === "horizontal" ? Math.sign(d.x) || 1 : Math.sign(d.z) || 1;
          setLine(constraint.segmentId, constraint.kind === "horizontal" ? { x: sign, z: 0 } : { x: 0, z: sign }, null);
        } else if (!("b" in constraint)) {
          if (constraint.kind === "length") setLine(constraint.segmentId, null, Math.max(TOLERANCE, constraint.value));
        } else {
          const da = lineVector(constraint.a);
          const db = lineVector(constraint.b);
          const la = Math.hypot(da.x, da.z);
          const lb = Math.hypot(db.x, db.z);
          if (la < TOLERANCE || lb < TOLERANCE) continue;
          const ma = lineMobility(constraint.a);
          const mb = lineMobility(constraint.b);
          if (ma + mb === 0) continue;
          if (constraint.kind === "equal") {
            const target = (la * ma + lb * mb) / (ma + mb);
            if (ma) setLine(constraint.a, null, target);
            if (mb) setLine(constraint.b, null, target);
            continue;
          }
          // Parallel: both turn towards their shared direction; at right angles: b against a turned a quarter.
          const ua = { x: da.x / la, z: da.z / la };
          let ub = { x: db.x / lb, z: db.z / lb };
          if (constraint.kind === "perpendicular") ub = { x: ub.z, z: -ub.x };
          if (ua.x * ub.x + ua.z * ub.z < 0) ub = { x: -ub.x, z: -ub.z };
          const angleA = Math.atan2(ua.z, ua.x);
          let angleB = Math.atan2(ub.z, ub.x);
          while (angleB - angleA > Math.PI) angleB -= 2 * Math.PI;
          while (angleB - angleA < -Math.PI) angleB += 2 * Math.PI;
          const shared = (angleA * ma + angleB * mb) / (ma + mb);
          const turnA = shared - angleA;
          const turnB = shared - angleB;
          const rotate = (v: Vec, angle: number) => ({ x: v.x * Math.cos(angle) - v.z * Math.sin(angle), z: v.x * Math.sin(angle) + v.z * Math.cos(angle) });
          if (ma) {
            const r = rotate({ x: da.x / la, z: da.z / la }, turnA);
            setLine(constraint.a, r, null);
          }
          if (mb) {
            const r = rotate({ x: db.x / lb, z: db.z / lb }, turnB);
            setLine(constraint.b, r, null);
          }
        }
      }
      const worst = Math.max(...constraints.map((constraint) => residual(constraint, at, ends)));
      if (worst < TOLERANCE) break;
    }
    const worst = Math.max(...constraints.map((constraint) => residual(constraint, at, ends)));
    return { positions, worst };
  };
  let solved = attempt(true);
  if (solved.worst > 1e-3 && pinned.size > 0) {
    const loose = attempt(false);
    if (loose.worst < solved.worst) solved = loose;
  }
  const points: SketchPoint[] = profile.points.map((point) => {
    const next = solved.positions.get(point.id);
    if (!next || (Math.abs(next.x - point.x) < 1e-12 && Math.abs(next.z - point.z) < 1e-12)) return point;
    const dx = next.x - point.x;
    const dz = next.z - point.z;
    // Curve handles travel with their point.
    return {
      ...point,
      x: next.x,
      z: next.z,
      ...(point.handleIn ? { handleIn: { x: point.handleIn.x + dx, z: point.handleIn.z + dz } } : {}),
      ...(point.handleOut ? { handleOut: { x: point.handleOut.x + dx, z: point.handleOut.z + dz } } : {}),
    };
  });
  return { profile: { ...profile, points, constraints }, satisfied: solved.worst < 1e-3, worst: solved.worst };
}

/** The points whose place differs between two versions of a sketch. */
export function movedPointIds(before: SketchProfile, after: SketchProfile): Set<string> {
  const old = new Map(before.points.map((point) => [point.id, point]));
  const moved = new Set<string>();
  for (const point of after.points) {
    const was = old.get(point.id);
    if (!was || Math.abs(was.x - point.x) > 1e-9 || Math.abs(was.z - point.z) > 1e-9) moved.add(point.id);
  }
  return moved;
}

/** The short mark shown on a line for a rule. */
export function constraintGlyph(constraint: SketchConstraint): string {
  switch (constraint.kind) {
    case "horizontal": return "H";
    case "vertical": return "V";
    case "length": return "⟷";
    case "parallel": return "∥";
    case "perpendicular": return "⊥";
    case "equal": return "=";
  }
}

let counter = 0;
export function newConstraintId() {
  counter += 1;
  return `c${Date.now().toString(36)}${counter.toString(36)}`;
}
