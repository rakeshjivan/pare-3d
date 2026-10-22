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
  const points = new Set(profile.points.map((point) => point.id));
  return (profile.constraints ?? []).filter((constraint) => {
    if ("b" in constraint) return segments.has(constraint.a) && segments.has(constraint.b) && constraint.a !== constraint.b;
    if (constraint.kind === "pointOnLine") return points.has(constraint.pointId) && segments.has(constraint.segmentId);
    if (constraint.kind === "symmetric") return points.has(constraint.p) && points.has(constraint.q) && constraint.p !== constraint.q && segments.has(constraint.segmentId);
    return segments.has(constraint.segmentId);
  });
}

/** The lines a rule is shown on. */
export function constraintSegments(constraint: SketchConstraint): string[] {
  return "b" in constraint ? [constraint.a, constraint.b] : [constraint.segmentId];
}

/** The rules on one line. */
export function constraintsOnSegment(profile: SketchProfile, segmentId: string) {
  return liveConstraints(profile).filter((constraint) => constraintSegments(constraint).includes(segmentId));
}

/** The angle in degrees (0 to 180) between two lines as drawn, start to end. */
export function lineAngleDegrees(profile: SketchProfile, a: string, b: string) {
  const end = (id: string) => profile.segments.find((segment) => segment.id === id);
  const sa = end(a), sb = end(b);
  const pt = (id: string) => profile.points.find((point) => point.id === id);
  if (!sa || !sb) return 0;
  const a0 = pt(sa.startId), a1 = pt(sa.endId), b0 = pt(sb.startId), b1 = pt(sb.endId);
  if (!a0 || !a1 || !b0 || !b1) return 0;
  const da = { x: a1.x - a0.x, z: a1.z - a0.z };
  const db = { x: b1.x - b0.x, z: b1.z - b0.z };
  const cos = (da.x * db.x + da.z * db.z) / ((Math.hypot(da.x, da.z) * Math.hypot(db.x, db.z)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Adds a rule (replacing one it contradicts on the same line - horizontal against vertical, a
 * second length) and returns the new list.
 */
export function addConstraint(profile: SketchProfile, constraint: SketchConstraint): SketchConstraint[] {
  const existing = liveConstraints(profile);
  const lines = "b" in constraint ? [constraint.a, constraint.b] : [constraint.segmentId];
  const kept = existing.filter((other) => {
    if (constraint.kind === "pointOnLine") return !(other.kind === "pointOnLine" && other.pointId === constraint.pointId && other.segmentId === constraint.segmentId);
    if (constraint.kind === "symmetric") return !(other.kind === "symmetric" && [other.p, other.q].sort().join() === [constraint.p, constraint.q].sort().join());
    if (other.kind === "pointOnLine" || other.kind === "symmetric") return true;
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
    if (constraint.kind === "angle") return Math.abs(Math.acos(Math.max(-1, Math.min(1, dot))) - (constraint.value * Math.PI) / 180) * Math.min(la, lb);
    return (constraint.kind === "parallel" ? Math.abs(cross) : Math.abs(dot)) * Math.min(la, lb);
  }
  if (constraint.kind === "pointOnLine" || constraint.kind === "symmetric") {
    const e = ends(constraint.segmentId);
    if (!e) return 0;
    const s0 = at(e[0]), s1 = at(e[1]);
    if (constraint.kind === "pointOnLine") return distanceToLine(at(constraint.pointId), s0, s1);
    const m = mirrorPoint(at(constraint.q), s0, s1);
    const p = at(constraint.p);
    return Math.hypot(m.x - p.x, m.z - p.z);
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

/** The point on the line through s0 and s1 nearest r. */
function footOnLine(r: Vec, s0: Vec, s1: Vec): Vec {
  const d = sub(s1, s0);
  const l2 = d.x * d.x + d.z * d.z || 1e-12;
  const t = ((r.x - s0.x) * d.x + (r.z - s0.z) * d.z) / l2;
  return { x: s0.x + d.x * t, z: s0.z + d.z * t };
}
function distanceToLine(r: Vec, s0: Vec, s1: Vec) {
  const f = footOnLine(r, s0, s1);
  return Math.hypot(r.x - f.x, r.z - f.z);
}
/** r mirrored about the line through s0 and s1. */
function mirrorPoint(r: Vec, s0: Vec, s1: Vec): Vec {
  const f = footOnLine(r, s0, s1);
  return { x: 2 * f.x - r.x, z: 2 * f.z - r.z };
}
/** A direction mirrored about the line's direction (the reflection without its shift). */
function mirrorDirection(v: Vec, s0: Vec, s1: Vec): Vec {
  const d = sub(s1, s0);
  const l = Math.hypot(d.x, d.z) || 1;
  const u = { x: d.x / l, z: d.z / l };
  const along = v.x * u.x + v.z * u.z;
  return { x: 2 * along * u.x - v.x, z: 2 * along * u.z - v.z };
}

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
        } else if (constraint.kind === "pointOnLine") {
          const e = ends(constraint.segmentId);
          if (!e || e.includes(constraint.pointId)) continue;
          const r = at(constraint.pointId);
          const f = footOnLine(r, at(e[0]), at(e[1]));
          const wr = weight(constraint.pointId);
          const wl = (weight(e[0]) + weight(e[1])) / 2;
          if (wr + wl === 0) continue;
          const dx = f.x - r.x, dz = f.z - r.z;
          move(constraint.pointId, (dx * wr) / (wr + wl), (dz * wr) / (wr + wl));
          move(e[0], (-dx * wl) / (wr + wl), (-dz * wl) / (wr + wl));
          move(e[1], (-dx * wl) / (wr + wl), (-dz * wl) / (wr + wl));
        } else if (constraint.kind === "symmetric") {
          const e = ends(constraint.segmentId);
          if (!e) continue;
          const s0 = at(e[0]), s1 = at(e[1]);
          const p = at(constraint.p);
          const m = mirrorPoint(at(constraint.q), s0, s1);
          const wp = weight(constraint.p), wq = weight(constraint.q);
          if (wp + wq === 0) continue;
          const ex = m.x - p.x, ez = m.z - p.z;
          move(constraint.p, (ex * wp) / (wp + wq), (ez * wp) / (wp + wq));
          // q moves so that its mirror image moves the rest of the way back.
          const back = mirrorDirection({ x: (-ex * wq) / (wp + wq), z: (-ez * wq) / (wp + wq) }, s0, s1);
          move(constraint.q, back.x, back.z);
        } else if (!("b" in constraint)) {
          if (constraint.kind === "length") setLine(constraint.segmentId, null, Math.max(TOLERANCE, constraint.value));
        } else if (constraint.kind === "angle") {
          const da = lineVector(constraint.a);
          const db = lineVector(constraint.b);
          const la = Math.hypot(da.x, da.z);
          const lb = Math.hypot(db.x, db.z);
          if (la < TOLERANCE || lb < TOLERANCE) continue;
          const ma = lineMobility(constraint.a);
          const mb = lineMobility(constraint.b);
          if (ma + mb === 0) continue;
          const angleA = Math.atan2(da.z, da.x);
          let diff = Math.atan2(db.z, db.x) - angleA;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const want = ((diff >= 0 ? 1 : -1) * constraint.value * Math.PI) / 180;
          const error = diff - want;
          const rotate = (v: Vec, angle: number) => ({ x: v.x * Math.cos(angle) - v.z * Math.sin(angle), z: v.x * Math.sin(angle) + v.z * Math.cos(angle) });
          if (ma) setLine(constraint.a, rotate({ x: da.x / la, z: da.z / la }, (error * mb) / (ma + mb)), null);
          if (mb) setLine(constraint.b, rotate({ x: db.x / lb, z: db.z / lb }, (-error * ma) / (ma + mb)), null);
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
    case "angle": return "∠";
    case "pointOnLine": return "•";
    case "symmetric": return "⇔";
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
