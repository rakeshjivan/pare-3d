import type { ManifoldToplevel } from "manifold-3d";
import type { SketchProfile } from "@/types/layerling";
import { cadSketchRegions, silhouetteSketchProfile, type OrderedCadSketchPath } from "@/lib/sketchCadProfile";
import { sampledPath } from "@/lib/sketchStroke";

/**
 * The cookie cutter (#982): the outline of a sketch as the wall of a cutter and a flat rim round its foot. Both are the sketch
 * body's own fill modes (#197), so the parts stay editable one by one: the wall is a line outside the outline, the rim a wider
 * line outside its silhouette (the outline without its holes), low, so the cutter stands on it and the thumb has something to
 * press. The wall's top runs in to a cutting edge, and the outline is mirrored: the cutter is printed on its rim and turned
 * over to cut, so a text or a logo would come out the wrong way round otherwise. Holes in the outline - the inside of an e or
 * an a - get walls of their own, a body of their own as well, held to the outer wall by bridges at the rim, on the side the hand
 * presses. Lower than the outer wall, they only press the inside into the dough instead of cutting it out.
 */

/**
 * The wall's thickness, how high the cutter stands, how far the rim reaches beyond the wall and how high it is, and how wide
 * the cutting edge on top of the wall is (0 for a flat top), in mm; whether the outline is mirrored left to right; whether
 * holes get walls of their own, how much lower than the outer wall they are (0: they cut through), how many bridges hold each
 * of them and how wide and how high those are, in mm.
 */
export type CookieCutterOptions = {
  wall: number;
  height: number;
  rim: number;
  rimHeight: number;
  edge: number;
  mirror: boolean;
  inner: boolean;
  imprint: number;
  bridgeCount: number;
  bridge: number;
  bridgeHeight: number;
};

type CookieCutterSize = Exclude<keyof CookieCutterOptions, "mirror" | "inner">;

export const COOKIE_CUTTER_DEFAULTS: CookieCutterOptions = {
  wall: 1.2,
  height: 15,
  rim: 4,
  rimHeight: 2,
  edge: 0.4,
  mirror: true,
  inner: true,
  imprint: 0,
  bridgeCount: 2,
  bridge: 4,
  bridgeHeight: 3,
};

const LIMITS: Record<CookieCutterSize, readonly [number, number]> = {
  wall: [0.4, 10],
  height: [2, 100],
  rim: [0.5, 30],
  rimHeight: [0.4, 20],
  edge: [0, 10],
  imprint: [0, 100],
  bridgeCount: [1, 8],
  bridge: [0.8, 20],
  bridgeHeight: [0.4, 20],
};

/** The options with a missing, mistyped or out-of-range value replaced by the nearest allowed one. */
export function normalizeCookieCutterOptions(value?: Partial<Record<keyof CookieCutterOptions, unknown>> | null): CookieCutterOptions {
  const result = { ...COOKIE_CUTTER_DEFAULTS };
  for (const key of Object.keys(LIMITS) as CookieCutterSize[]) {
    const number = Number(value?.[key]);
    if (value?.[key] === undefined || value?.[key] === null || value?.[key] === "" || !Number.isFinite(number)) continue;
    const [min, max] = LIMITS[key];
    result[key] = Math.min(max, Math.max(min, number));
  }
  if (typeof value?.mirror === "boolean") result.mirror = value.mirror;
  if (typeof value?.inner === "boolean") result.inner = value.inner;
  result.bridgeCount = Math.round(result.bridgeCount);
  // The rim and the bridges cannot be higher than the cutter itself: they would then be the cutter.
  result.rimHeight = Math.min(result.rimHeight, result.height);
  result.bridgeHeight = Math.min(result.bridgeHeight, result.height);
  // The inner walls stay at least as high as the bridges that hold them.
  result.imprint = Math.min(result.imprint, result.height - result.bridgeHeight);
  // An edge as wide as the wall, or wider, is the flat top.
  if (result.edge >= result.wall) result.edge = 0;
  return result;
}

/**
 * The outline a cutter is made of: the sketch's points and segments, without a fill mode, key ring or face tool of its own;
 * mirrored left to right when asked, the curves' handles with their points.
 */
function outlineOf(profile: SketchProfile, mirror: boolean): SketchProfile {
  const flip = (place: { x: number; z: number }) => (mirror ? { x: -place.x || 0, z: place.z } : { ...place });
  return {
    points: profile.points.map((point) => ({
      ...point,
      ...flip(point),
      ...(point.handleIn ? { handleIn: flip(point.handleIn) } : {}),
      ...(point.handleOut ? { handleOut: flip(point.handleOut) } : {}),
    })),
    segments: profile.segments.map((segment) => ({ ...segment })),
  };
}

type Vec = { x: number; z: number };

/** The point of a closed polyline nearest to `point`. */
function nearestOnLoop(loop: readonly Vec[], point: Vec): { point: Vec; distance: number } {
  let best = { point: loop[0], distance: Number.POSITIVE_INFINITY };
  loop.forEach((start, index) => {
    const end = loop[(index + 1) % loop.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = dx * dx + dz * dz;
    const along = length > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / length)) : 0;
    const candidate = { x: start.x + dx * along, z: start.z + dz * along };
    const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
    if (distance < best.distance) best = { point: candidate, distance };
  });
  return best;
}

/** Whether `point` lies inside a closed polyline (even-odd). */
function insideLoop(loop: readonly Vec[], point: Vec) {
  let inside = false;
  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index, index += 1) {
    const a = loop[index];
    const b = loop[previous];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** A closed polyline with a point at least every `step` mm along it, so a long straight side offers places for a bridge too. */
function densified(loop: readonly Vec[], step: number): Vec[] {
  const result: Vec[] = [];
  loop.forEach((start, index) => {
    const end = loop[(index + 1) % loop.length];
    const pieces = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) / step));
    for (let piece = 0; piece < pieces; piece += 1) {
      const t = piece / pieces;
      result.push({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t });
    }
  });
  return result;
}

/** No more places than this are tried round one loop for its bridges. */
const MAX_BRIDGE_PLACES = 400;

/**
 * Where the bridges between two loops go: `count` places along `from`, each the one closest to `to` within its share of the
 * loop, the first share starting where the two come closest of all, so the bridges hold the piece from all sides. A place
 * much farther off than the closest one is left out: a long bar holds less than it costs. The bars run from `from` to `to`.
 */
function bridgePlaces(from: readonly Vec[], to: readonly Vec[], count: number): Array<{ a: Vec; b: Vec; distance: number }> {
  let perimeter = 0;
  from.forEach((point, index) => {
    const next = from[(index + 1) % from.length];
    perimeter += Math.hypot(next.x - point.x, next.z - point.z);
  });
  const places = densified(from, Math.max(perimeter / MAX_BRIDGE_PLACES, 0.5));
  const candidates = places.map((point) => {
    const near = nearestOnLoop(to, point);
    return { a: point, b: near.point, distance: near.distance };
  });
  let first = 0;
  candidates.forEach((candidate, index) => {
    if (candidate.distance < candidates[first].distance) first = index;
  });
  const closest = candidates[first].distance;
  const reach = Math.max(closest * 3, closest + 15);
  const result: Array<{ a: Vec; b: Vec; distance: number }> = [];
  for (let share = 0; share < count; share += 1) {
    // Share 0 is centred on the closest place; the others follow round the loop.
    const middle = first + Math.round((share * candidates.length) / count);
    const half = Math.floor(candidates.length / (2 * count));
    let best: { a: Vec; b: Vec; distance: number } | null = null;
    for (let offset = -half; offset <= half; offset += 1) {
      const candidate = candidates[(((middle + offset) % candidates.length) + candidates.length) % candidates.length];
      if (!best || candidate.distance < best.distance) best = candidate;
    }
    if (best && best.distance > 1e-6 && best.distance <= reach) result.push(best);
  }
  return result;
}

/**
 * The bridges that hold the inner walls (#982): `count` straight bars for each hole of the outline, from the hole to the outline
 * round it, spread round the hole, and as many for each piece lying inside another's hole (the dot in a ring), to that hole.
 * Between a hole and the outline round it lies the dough, and the walls stand on its far sides: those bars reach a wall's
 * thickness past both ends, into both walls. Between a piece and the hole round it there is no dough, and both walls stand in
 * the gap: those bars end on the outlines, so they do not reach into the piece. Null when the outline has nothing inside.
 */
export function cookieCutterBridges(outline: SketchProfile, wall: number, width: number, count = 1): SketchProfile | null {
  let regions: ReturnType<typeof cadSketchRegions>;
  try {
    regions = cadSketchRegions(outline);
  } catch {
    return null;
  }
  const polyline = (path: OrderedCadSketchPath) => sampledPath(path);
  const holes = regions.flatMap((region) => region.holes.map((hole) => ({ hole: polyline(hole), outer: polyline(region.outer) })));
  const pairs: Array<{ from: Vec[]; to: Vec[]; past: number }> = holes.map(({ hole, outer }) => ({ from: hole, to: outer, past: wall }));
  regions.forEach((region) => {
    const outer = polyline(region.outer);
    const around = outer.length ? holes.find(({ hole }) => insideLoop(hole, outer[0])) : undefined;
    if (around) pairs.push({ from: outer, to: around.hole, past: 0 });
  });
  const bars: Vec[][] = [];
  for (const { from, to, past } of pairs) {
    if (from.length < 3 || to.length < 3) continue;
    for (const { a, b, distance } of bridgePlaces(from, to, count)) {
      const dx = (b.x - a.x) / distance;
      const dz = (b.z - a.z) / distance;
      const start = { x: a.x - dx * past, z: a.z - dz * past };
      const end = { x: b.x + dx * past, z: b.z + dz * past };
      const side = { x: -dz * (width / 2), z: dx * (width / 2) };
      bars.push([
        { x: start.x + side.x, z: start.z + side.z },
        { x: end.x + side.x, z: end.z + side.z },
        { x: end.x - side.x, z: end.z - side.z },
        { x: start.x - side.x, z: start.z - side.z },
      ]);
    }
  }
  if (!bars.length) return null;
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  const profile: SketchProfile = { points: [], segments: [] };
  bars.forEach((bar, barIndex) => {
    bar.forEach((corner, index) => profile.points.push({ id: `b${barIndex}-${index}`, x: round(corner.x), z: round(corner.z), mode: "corner" }));
    bar.forEach((_, index) => profile.segments.push({ id: `bs${barIndex}-${index}`, startId: `b${barIndex}-${index}`, endId: `b${barIndex}-${(index + 1) % 4}`, kind: "line" }));
  });
  return profile;
}

/** The outline without its silhouette: every hole, and every piece inside one, or null when there is none. */
function innerOutline(outline: SketchProfile): SketchProfile | null {
  const kept = new Set(silhouetteSketchProfile(outline).segments.map((segment) => segment.id));
  const segments = outline.segments.filter((segment) => !kept.has(segment.id));
  if (!segments.length) return null;
  const used = new Set(segments.flatMap((segment) => [segment.startId, segment.endId]));
  return { ...outline, points: outline.points.filter((point) => used.has(point.id)), segments };
}

/**
 * The sketches a cutter is built from: the wall - a line `wall` mm wide outside the silhouette, with its cutting edge - and the
 * rim, a line `wall + rim` mm wide outside the silhouette as well, which holds the wall's foot; with inner walls, those as a
 * sketch of their own and the bridges that hold them. Without the silhouette the holes are the outermost outlines, so the inner
 * walls are a line inside them: into the hole, and outside a piece lying in it, as they were in the whole outline. Round
 * corners, so a thin wall does not run to a point.
 */
export function cookieCutterProfiles(source: SketchProfile, options: CookieCutterOptions): { wall: SketchProfile; rim: SketchProfile; inner: SketchProfile | null; bridges: SketchProfile | null } {
  const outline = outlineOf(source, options.mirror);
  const line = (from: SketchProfile, width: number, align: "outside" | "inside", silhouette: boolean, edge?: number): SketchProfile => ({
    ...from,
    points: from.points.map((point) => ({ ...point })),
    segments: from.segments.map((segment) => ({ ...segment })),
    ...(silhouette ? { silhouette: true } : {}),
    stroke: { width, align, join: "round", cap: "flat", ...(edge ? { edge } : {}) },
  });
  const holes = options.inner ? innerOutline(outline) : null;
  return {
    wall: line(outline, options.wall, "outside", true, options.edge),
    rim: line(outline, options.wall + options.rim, "outside", true),
    inner: holes ? line(holes, options.wall, "inside", false, options.edge) : null,
    bridges: holes ? cookieCutterBridges(outline, options.wall, options.bridge, options.bridgeCount) : null,
  };
}

/** Closer than this, in mm, two points of a cut outline are one: a smooth surface cut by the plane has no use for more. */
const MIN_POINT_GAP = 0.05;
/** An outline of more points than this is refused: the kernel could not build a wall along it in time. */
export const MAX_COOKIE_CUTTER_POINTS = 6000;

type OutlineLoop = { points: ReadonlyArray<{ u: number; v: number }>; closed: boolean };

/**
 * What several bodies stand on together (#982): each body's closed outlines - holes inside it by the even-odd rule, whichever
 * way they run - united with the others', so two shapes that overlap give one outline round both, not two walls crossing
 * in the middle. Open lines and specks are left out. The outlines come back closed, in the same u/v.
 */
export function unitedFootprint(runtime: ManifoldToplevel, bodies: ReadonlyArray<readonly OutlineLoop[]>): OutlineLoop[] {
  const sections = bodies
    .map((loops) => loops.filter((loop) => loop.closed && loop.points.length >= 3).map((loop) => loop.points.map((point) => [point.u, point.v] as [number, number])))
    .filter((polygons) => polygons.length)
    .map((polygons) => new runtime.CrossSection(polygons, "EvenOdd"));
  if (!sections.length) return [];
  const united = runtime.CrossSection.union(sections);
  try {
    return united.toPolygons().map((polygon) => ({ points: polygon.map(([u, v]) => ({ u, v })), closed: true }));
  } finally {
    united.delete();
    sections.forEach((section) => section.delete());
  }
}

/**
 * What a body stands on - the closed outlines the workplane cuts through it, seen from above (u across, v towards the front, as
 * in sketch mode) - as a sketch round the middle of its box, and that middle in the world. Null when nothing closed is left.
 * Throws when the outline has too many points.
 */
export function outlineFromLoops(loops: readonly OutlineLoop[]): { profile: SketchProfile; x: number; z: number } | null {
  const rings = loops
    .filter((loop) => loop.closed)
    .map((loop) => loop.points.filter((point, index, all) => index === 0 || Math.hypot(point.u - all[index - 1].u, point.v - all[index - 1].v) >= MIN_POINT_GAP))
    // The closing edge: the last point may lie on the first.
    .map((ring) => (ring.length > 1 && Math.hypot(ring[0].u - ring[ring.length - 1].u, ring[0].v - ring[ring.length - 1].v) < MIN_POINT_GAP ? ring.slice(0, -1) : ring))
    .filter((ring) => ring.length >= 3);
  if (!rings.length) return null;
  const total = rings.reduce((sum, ring) => sum + ring.length, 0);
  if (total > MAX_COOKIE_CUTTER_POINTS) throw new Error("cookie-cutter-outline-too-complex");
  const all = rings.flat();
  const us = all.map((point) => point.u);
  const vs = all.map((point) => point.v);
  const x = (Math.min(...us) + Math.max(...us)) / 2;
  const z = (Math.min(...vs) + Math.max(...vs)) / 2;
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  const profile: SketchProfile = { points: [], segments: [] };
  rings.forEach((ring, ringIndex) => {
    const ids = ring.map((point, index) => {
      const id = `p${ringIndex}-${index}`;
      profile.points.push({ id, x: round(point.u - x), z: round(point.v - z), mode: "corner" });
      return id;
    });
    ids.forEach((id, index) => profile.segments.push({ id: `s${ringIndex}-${index}`, startId: id, endId: ids[(index + 1) % ids.length], kind: "line" }));
  });
  return { profile, x, z };
}

/** A closed outline of lines and Bézier curves seen from above (x across, z towards the front), as a text's glyphs give it. */
export type CurveLoop = {
  x: number;
  z: number;
  segments: ReadonlyArray<{ kind: "line" | "bezier"; x: number; z: number; controls?: ReadonlyArray<{ x: number; z: number }> }>;
};

/** How many straight pieces a curve is cut into to tell whether outlines overlap; the cutter itself keeps the curves. */
const CURVE_SAMPLES = 8;

/** A curve outline as points, its curves cut into short straight pieces, for the overlap test. */
export function sampledCurveLoop(loop: CurveLoop): OutlineLoop {
  const points: Array<{ u: number; v: number }> = [{ u: loop.x, v: loop.z }];
  let from = { x: loop.x, z: loop.z };
  for (const segment of loop.segments) {
    const controls = segment.controls ?? [];
    if (segment.kind === "bezier" && controls.length) {
      const [c1, c2] = cubicControls(from, controls, segment);
      for (let step = 1; step <= CURVE_SAMPLES; step += 1) {
        const t = step / CURVE_SAMPLES;
        const s = 1 - t;
        points.push({
          u: s * s * s * from.x + 3 * s * s * t * c1.x + 3 * s * t * t * c2.x + t * t * t * segment.x,
          v: s * s * s * from.z + 3 * s * s * t * c1.z + 3 * s * t * t * c2.z + t * t * t * segment.z,
        });
      }
    } else {
      points.push({ u: segment.x, v: segment.z });
    }
    from = { x: segment.x, z: segment.z };
  }
  // The last piece ends on the start point; the polygon does not repeat it.
  points.pop();
  return { points, closed: true };
}

/** The two control points of a cubic curve: a quadratic one's single control raised to the cubic that draws the same curve. */
function cubicControls(from: { x: number; z: number }, controls: ReadonlyArray<{ x: number; z: number }>, to: { x: number; z: number }) {
  if (controls.length >= 2) return [controls[0], controls[1]] as const;
  const [control] = controls;
  return [
    { x: from.x + ((control.x - from.x) * 2) / 3, z: from.z + ((control.z - from.z) * 2) / 3 },
    { x: to.x + ((control.x - to.x) * 2) / 3, z: to.z + ((control.z - to.z) * 2) / 3 },
  ] as const;
}

/**
 * Curve outlines as one sketch round the middle of their box, and that middle (#982): the curves stay Bézier curves, as a
 * text's letters are drawn, so the cutter's wall follows them exactly and can take its cutting edge - a text's outline cut
 * from its triangles is hundreds of short pieces the kernel cannot chamfer. Null when nothing closed is left.
 */
export function outlineFromCurves(loops: readonly CurveLoop[]): { profile: SketchProfile; x: number; z: number } | null {
  const usable = loops.filter((loop) => loop.segments.length >= 2);
  if (!usable.length) return null;
  const all = usable.flatMap((loop) => sampledCurveLoop(loop).points);
  const us = all.map((point) => point.u);
  const vs = all.map((point) => point.v);
  const x = (Math.min(...us) + Math.max(...us)) / 2;
  const z = (Math.min(...vs) + Math.max(...vs)) / 2;
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  const at = (place: { x: number; z: number }) => ({ x: round(place.x - x), z: round(place.z - z) });
  const profile: SketchProfile = { points: [], segments: [] };
  usable.forEach((loop, loopIndex) => {
    const ids: string[] = [];
    const points: SketchProfile["points"] = [{ id: `g${loopIndex}-0`, ...at(loop), mode: "corner" }];
    ids.push(points[0].id);
    let from = { x: loop.x, z: loop.z };
    loop.segments.forEach((segment, index) => {
      const last = index === loop.segments.length - 1;
      const startPoint = points[points.length - 1];
      const endPoint = last ? points[0] : { id: `g${loopIndex}-${index + 1}`, ...at(segment), mode: "corner" as const };
      if (!last) {
        points.push(endPoint);
        ids.push(endPoint.id);
      }
      const controls = segment.controls ?? [];
      const curved = segment.kind === "bezier" && controls.length > 0;
      if (curved) {
        const [c1, c2] = cubicControls(from, controls, segment);
        startPoint.handleOut = at(c1);
        endPoint.handleIn = at(c2);
      }
      profile.segments.push({ id: `gs${loopIndex}-${index}`, startId: startPoint.id, endId: endPoint.id, kind: curved ? "bezier" : "line" });
      from = { x: segment.x, z: segment.z };
    });
    profile.points.push(...points);
  });
  return { profile, x, z };
}
