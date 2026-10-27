/**
 * Build 78: the one printed articulator, made so it cannot change the scanned bite.
 *
 * A kinematic coupling (Kelvin's three-groove principle, as in precision instruments): the upper
 * model is located by exactly six contacts and nothing else.
 * - Two ball condyles on the lower, set as wide apart as the models allow - one behind each heel.
 * - Over the first ball, a trihedral seat in the upper: three flat faces touching the ball at three
 *   points (three constraints). Over the second, a V-groove running along the hinge axis: two faces,
 *   two points (two constraints) - the ball can slide along it, so the width between the balls never
 *   has to match the seats exactly, whatever the printer shrinks.
 * - In front of the incisors, an incisal pin on the lower, its rounded tip on a flat pad under the
 *   upper (the sixth constraint).
 * Nothing else touches: there is no snap, clip or axle fit to fight the seats, so the models close to
 * the same place every time. The upper's own weight seats it (the faces slope at 45 degrees, so the
 * ball slides home whatever the friction of the resin, short of a coefficient of 1), and a keeper - a
 * lip round each ball below its equator, 0.3 mm clear of it - stops it lifting off when the models
 * are picked up or turned over. The keeper never touches while the models are closed. The ball goes
 * in by a channel running straight back: the models are parted by sliding the upper forward off the
 * balls, never pulled.
 *
 * Opening: the two balls lie on one line, so the upper turns about it like a hinge, up to 90 degrees;
 * every part of the seats stands clear of the balls' necks as it turns.
 *
 * The incisal pin is a separate printed part that drops into a hexagonal socket in the lower and seats
 * on its shoulder. Pins come in a set - 0 (the scanned bite) and raised in steps - each engraved with
 * how far it raises the bite at the pin, in mm. A raised pin turns the upper open about the condyles'
 * axis, as on an articulator: the front teeth part by less than the pin, the back teeth by less again.
 */
import type { ManifoldRuntime, ManifoldSolid } from "@/lib/dentalMesh";
import { labelSection, labelText, labelWidth } from "@/lib/dentalLabel";

const deg = Math.PI / 180;

/** The ball condyles' radius, mm (10 mm across). */
export const CONDYLE_RADIUS = 5;
/** Where each seat face touches its ball: this many degrees above the ball's equator. */
export const SEAT_LATITUDE = 45;
/** The seat blocks' undersides stand this far above the balls' centres, mm - clear of the necks as it opens. */
export const SEAT_FLOOR = 3;
/** Half the size of a seat block, mm. */
export const SEAT_HALF = 9.5;
/** The V-groove's block is this much longer each way along the axis, mm: the room the ball has to slide. */
export const GROOVE_SLIDE = 3;
const NECK = 2.5;
/** The pedestal's top stands this far below the balls' centres, mm - clear of the keepers as it opens. */
const PEDESTAL = SEAT_HALF + 1.5;
/**
 * Build 78: the keeper - a lip round the ball below its equator, reaching KEEPER_LOW below its
 * centre, KEEPER_FIT clear of it all round, so it never touches while the models are closed and only
 * stops the upper lifting off. The ball goes in (and comes out) by a channel running straight back
 * (KEEPER_CHANNEL degrees from straight down) - the same channel the neck swings into as the models
 * open, so the keeper never meets it.
 */
export const KEEPER_LOW = 4;
export const KEEPER_FIT = 0.3;
export const KEEPER_CHANNEL = 90;

/** The incisal pin: socket across flats, its depth, the pin's shoulder and rounded tip, mm. */
export const PIN = { key: 1.2, flats: 4, socketDepth: 5.5, shank: 5, shoulder: 1.5, shoulderRadius: 3.5, tip: 1.75, tab: { length: 9, width: 5 }, engrave: 0.5 };
/** The fit round the pin's shank in its socket, mm a side: it only has to drop in and stand up. */
export const PIN_FIT = 0.1;
/** The socket's top stands this far below the occlusal plane, mm (less on a shallow base). */
const BOSS_TOP = 6;
/** The pin stands this far in front of the further-forward model, mm. */
const PIN_AHEAD = 6;
/** Raises the pin set offers, mm: the scanned bite and whole millimetres to 6. */
export const PIN_SET = [0, 1, 2, 3, 4, 5, 6] as const;
/** A pin raise is chosen in these steps, up to this, mm; above PIN_WARN the arc is unvalidated. */
export const PIN_STEP = 0.5;
export const PIN_MAX = 10;
export const PIN_WARN = 6;

/** The rearmost point of a model's base on one side of the midline, in the pair's frame. */
export type ArticulatorHeel = { x: number; y: number };
/** Where the incisal pin goes: its x, and the front of each model's base there (the pair's frame). */
export type ArticulatorFront = { x: number; upperY: number; lowerY: number };

const box = (runtime: ManifoldRuntime, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  runtime.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);

/** Where the condyles' axis runs (y; z = 0, the occlusal plane), for models whose backs reach `back`. */
export function condyleAxisY(back: number) {
  return back + SEAT_HALF + 0.5;
}

/** The seat faces' outward directions from a ball's centre, at SEAT_LATITUDE. */
function seatDirections(azimuths: number[]) {
  const c = Math.cos(SEAT_LATITUDE * deg), s = Math.sin(SEAT_LATITUDE * deg);
  return azimuths.map((a) => [c * Math.cos(a * deg), c * Math.sin(a * deg), s] as [number, number, number]);
}

/** Solves the 3 x 3 system rows . p = rhs. */
function solve3(rows: number[][], rhs: number[]): [number, number, number] {
  const [a, b, c] = rows;
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det([a, b, c]);
  const col = (k: number) => [a, b, c].map((row, i) => row.map((v, j) => (j === k ? rhs[i] : v)));
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

/**
 * The cavity a seat is cut by: everything on the ball's side of each face (face d . (p - centre) = R),
 * from below the block up to where the faces meet. Built as the hull of its corners.
 */
function seatCavity(runtime: ManifoldRuntime, centre: [number, number, number], faces: Array<[number, number, number]>, low: number, along?: [number, number]) {
  const R = CONDYLE_RADIUS;
  const offset = (d: [number, number, number]) => R + d[0] * centre[0] + d[1] * centre[1] + d[2] * centre[2];
  const points: Array<[number, number, number]> = [];
  if (!along) {
    // Trihedral: the apex where the three faces meet, and the triangle where they cross z = low.
    points.push(solve3(faces, faces.map(offset)));
    for (let i = 0; i < 3; i += 1) {
      const a = faces[i], b = faces[(i + 1) % 3];
      points.push(solve3([a, b, [0, 0, 1]], [offset(a), offset(b), low]));
    }
  } else {
    // V-groove along x: the ridge where the two faces meet and their feet at z = low, at both ends.
    for (const x of along) {
      const plane: [number, number, number] = [1, 0, 0];
      points.push(solve3([faces[0], faces[1], plane], [offset(faces[0]), offset(faces[1]), x]));
      points.push(solve3([faces[0], [0, 0, 1], plane], [offset(faces[0]), low, x]));
      points.push(solve3([faces[1], [0, 0, 1], plane], [offset(faces[1]), low, x]));
    }
  }
  const corners = points.map((p) => runtime.Manifold.cube([0.001, 0.001, 0.001], true).translate(p));
  const hull = runtime.Manifold.hull(corners);
  corners.forEach((corner) => corner.delete());
  return hull;
}

/** The pin raise's rest: how far the upper turns open about the axis, radians, for a raise at the pin. */
export function restAngle(raise: number, axisY: number, pinY: number) {
  return Math.atan2(Math.max(0, raise), axisY - pinY);
}

/**
 * The pin set, laid out for printing on the plate (shanks down, on a snap-off bar), each pin's tab
 * engraved with its raise. `raises` in mm; `axisY`, `pinY`, `bossTop` as the articulator was built.
 */
export function incisalPins(runtime: ManifoldRuntime, raises: number[], axisY: number, pinY: number, bossTop: number) {
  const made: ManifoldSolid[] = [];
  const keep = <T extends ManifoldSolid>(solid: T) => { made.push(solid); return solid; };
  const hex = (flats: number, z0: number, z1: number) => runtime.Manifold.cylinder(z1 - z0, flats / Math.sqrt(3), flats / Math.sqrt(3), 6).translate([0, 0, z0]);
  const pins: ManifoldSolid[] = [];
  const spacing = PIN.tab.length + PIN.shoulderRadius + 3;
  raises.forEach((raise, index) => {
    // Upright, the pin's shoulder sits on the socket's top: z = bossTop there.
    const rest = restAngle(raise, axisY, pinY);
    // The tip's centre: one tip radius below the pad, the pad turned open about the axis by `rest`.
    const centre = ((axisY - pinY) * Math.sin(rest) - PIN.tip) / Math.cos(rest);
    const shoulderTop = bossTop + PIN.shoulder;
    const parts: ManifoldSolid[] = [
      keep(hex(PIN.flats, bossTop - PIN.shank, bossTop)),
      // The key: a rib on the front of the shank, so the pin goes in one way only - its tab to the side.
      keep(box(runtime, -PIN.key / 2, PIN.key / 2, -PIN.flats / 2 - PIN.key, -PIN.flats / 2 + 0.3, bossTop - PIN.shank, bossTop)),
      keep(runtime.Manifold.cylinder(PIN.shoulder, PIN.shoulderRadius, PIN.shoulderRadius, 32).translate([0, 0, bossTop])),
      keep(box(runtime, 0, PIN.tab.length + PIN.shoulderRadius, -PIN.tab.width / 2, PIN.tab.width / 2, bossTop, shoulderTop)),
      keep(runtime.Manifold.cylinder(Math.max(0.01, centre - shoulderTop), PIN.tip, PIN.tip, 32).translate([0, 0, shoulderTop])),
      keep(runtime.Manifold.sphere(PIN.tip, 32).translate([0, 0, centre])),
    ];
    let pin: ManifoldSolid = keep(runtime.Manifold.union(parts));
    // The raise engraved on the tab, reading along it.
    const text = labelText(raise.toFixed(raise % 1 ? 1 : 0));
    const height = 3;
    if (text && labelWidth(text, height) < PIN.tab.length - 1) {
      const section = labelSection(runtime, text, height);
      const cut = keep(section.extrude(PIN.engrave + 0.2).translate([PIN.shoulderRadius + PIN.tab.length / 2, 0, shoulderTop - PIN.engrave]));
      section.delete();
      pin = keep(runtime.Manifold.difference(pin, cut));
    }
    // Printed standing up from its shank's foot, on a thin neck to the bar.
    pins.push(keep(pin.translate([index * spacing, 0, -(bossTop - PIN.shank) + 1.2])));
    pins.push(keep(runtime.Manifold.cylinder(1.3, 0.6, 0.6, 16).translate([index * spacing, 0, -0.05])));
  });
  pins.push(keep(box(runtime, -2, (raises.length - 1) * spacing + 2, -1.5, 1.5, -1.5, 0)));
  const set = runtime.Manifold.union(pins);
  made.forEach((solid) => solid.delete());
  return set;
}

/**
 * The articulator in the pair's frame (occlusal plane z = 0, back +y, the upper above): what joins
 * the upper, what joins the lower, the axis (y), the rest angle for `raise` (degrees), and where
 * the pin stands. `back`: the models' backs; `xMin`/`xMax`: across their heels; `floorUpper`/
 * `floorLower`: the bases' undersides (z); `backs`: each model's heels, for the bars.
 */
export function articulatorParts(
  runtime: ManifoldRuntime,
  back: number,
  xMin: number,
  xMax: number,
  floorUpper: number,
  floorLower: number,
  front: ArticulatorFront | null,
  raise = 0,
  backs: { upper: ArticulatorHeel[]; lower: ArticulatorHeel[] } | null = null,
  pinFit = PIN_FIT,
) {
  const R = CONDYLE_RADIUS;
  const ay = condyleAxisY(back);
  const known = Number.isFinite(xMin) && Number.isFinite(xMax);
  const cx = known ? (xMin + xMax) / 2 : 0;
  const half = Math.max(SEAT_HALF + GROOVE_SLIDE, known ? (xMax - xMin) / 2 : 14);
  // As wide as the models allow: the seats' outer edges at the heels' outer edges.
  const centres = half >= 2 * (SEAT_HALF + GROOVE_SLIDE) + 2
    ? [cx - half + SEAT_HALF, cx + half - SEAT_HALF - GROOVE_SLIDE]
    : [cx - SEAT_HALF - GROOVE_SLIDE - 1, cx + SEAT_HALF + GROOVE_SLIDE + 1];
  const made: ManifoldSolid[] = [];
  const keep = <T extends ManifoldSolid>(solid: T) => { made.push(solid); return solid; };
  const yBack = ay + SEAT_HALF;
  const lowerParts: ManifoldSolid[] = [];
  const upperParts: ManifoldSolid[] = [];
  const cuts: ManifoldSolid[] = [];
  const lowerCuts: ManifoldSolid[] = [];
  // A bar along the back of each base, reaching across every heel, with a strut to each heel.
  const span = (heels: ArticulatorHeel[] | undefined): [number, number] => {
    const xs = [centres[0] - SEAT_HALF, centres[1] + SEAT_HALF + GROOVE_SLIDE, ...(heels ?? []).flatMap((heel) => [heel.x - 4, heel.x + 4])];
    return [Math.min(...xs), Math.max(...xs)];
  };
  const backOf = (heels: ArticulatorHeel[] | undefined) => (heels?.length ? Math.max(...heels.map((heel) => heel.y)) : back);
  for (const [heels, parts, z0, z1] of [[backs?.lower, lowerParts, floorLower, floorLower + 4], [backs?.upper, upperParts, floorUpper - 4, floorUpper]] as const) {
    const [x0, x1] = span(heels);
    parts.push(keep(box(runtime, x0, x1, Math.min(back, backOf(heels)) - 4, yBack, z0, z1)));
    for (const heel of heels ?? []) parts.push(keep(box(runtime, heel.x - 4, heel.x + 4, heel.y - 4, yBack, z0, z1)));
  }
  centres.forEach((c, index) => {
    // The lower: a pedestal from its bar, a neck and the ball, centred on the axis (y = ay, z = 0).
    // The pedestal stops at the neck behind, where the seat block swings down past it at 90 degrees.
    lowerParts.push(
      keep(box(runtime, c - 4, c + 4, ay - 4, ay + NECK, floorLower, Math.max(floorLower + 1, -PEDESTAL))),
      keep(runtime.Manifold.cylinder(PEDESTAL + 0.5, NECK, NECK, 32).translate([c, ay, -PEDESTAL - 0.25])),
      keep(runtime.Manifold.sphere(R, 96).translate([c, ay, 0])),
    );
    // The upper: the seat block, from SEAT_FLOOR above the ball's centre up into the upper's bar.
    const groove = index === 1;
    const x0 = c - SEAT_HALF, x1 = c + SEAT_HALF + (groove ? GROOVE_SLIDE : 0);
    const x0g = groove ? c - SEAT_HALF - GROOVE_SLIDE : x0;
    // Build 78: down to the keeper's lip below the ball's equator.
    upperParts.push(keep(box(runtime, x0g, x1, ay - SEAT_HALF, ay + SEAT_HALF, -KEEPER_LOW, floorUpper)));
    const centre: [number, number, number] = [c, ay, 0];
    cuts.push(keep(groove
      ? seatCavity(runtime, centre, seatDirections([90, 270]), SEAT_FLOOR - 0.5, [x0g - 1, x1 + 1])
      : seatCavity(runtime, centre, seatDirections([90, 210, 330]), SEAT_FLOOR - 0.5)));
    // The keeper: the ball's room below the seats (KEEPER_FIT clear of it, sliding along the groove on
    // that side) and the channel it comes in by - only below SEAT_FLOOR, so the seat faces stay whole.
    const tilt = KEEPER_CHANNEL * deg, run = R + KEEPER_LOW + 6;
    const slide = groove ? GROOVE_SLIDE : 0;
    const balls: ManifoldSolid[] = [];
    for (const dx of slide ? [-slide, slide] : [0]) {
      balls.push(keep(runtime.Manifold.sphere(R + KEEPER_FIT, 64).translate([c + dx, ay, 0])));
      balls.push(keep(runtime.Manifold.sphere(R + KEEPER_FIT, 64).translate([c + dx, ay + Math.sin(tilt) * run, -Math.cos(tilt) * run])));
    }
    const room = keep(runtime.Manifold.hull(balls));
    cuts.push(keep(runtime.Manifold.intersection(room, keep(box(runtime, x0g - 1, x1 + 1, ay - SEAT_HALF - 1, ay + SEAT_HALF + 1, -R - KEEPER_LOW - 10, SEAT_FLOOR)))));
  });
  let rest = 0;
  let pinY = NaN;
  let bossTop = NaN;
  if (front) {
    const x = front.x;
    pinY = Math.min(front.upperY, front.lowerY) - PIN_AHEAD;
    rest = restAngle(raise, ay, pinY);
    // The socket's top: BOSS_TOP below the occlusal plane, or less on a base too shallow for the socket.
    bossTop = Math.max(-BOSS_TOP, floorLower + PIN.socketDepth + 1.5);
    const column = (radius: number, z0: number, z1: number, sides = 32) => runtime.Manifold.cylinder(z1 - z0, radius, radius, sides).translate([x, pinY, z0]);
    // The lower: the boss with the socket, on an arm along the bottom of its base.
    lowerParts.push(
      keep(column(4.5, floorLower, bossTop)),
      keep(box(runtime, x - 2.5, x + 2.5, pinY - 4.5, front.lowerY + 3, floorLower, floorLower + 3)),
    );
    const socket = PIN.flats + 2 * pinFit;
    lowerCuts.push(keep(runtime.Manifold.cylinder(PIN.socketDepth + 1, socket / Math.sqrt(3), socket / Math.sqrt(3), 6).translate([x, pinY, bossTop - PIN.socketDepth])));
    // The keyway for the pin's rib, at the front: the pin goes in one way only, its tab to the side, clear of the teeth.
    lowerCuts.push(keep(box(runtime, x - PIN.key / 2 - pinFit, x + PIN.key / 2 + pinFit, pinY - PIN.flats / 2 - PIN.key - pinFit, pinY - PIN.flats / 2 + 0.5, bossTop - PIN.socketDepth, bossTop + 1)));
    // The upper: the pad, flat underneath at the occlusal plane, on an arm along the top of its base.
    upperParts.push(
      keep(box(runtime, x - 3.5, x + 3.5, pinY - 4, pinY + 4, 0, floorUpper)),
      keep(box(runtime, x - 2.5, x + 2.5, pinY - 4, front.upperY + 3, floorUpper - 3, floorUpper)),
    );
  }
  const lowerJoined = keep(runtime.Manifold.union(lowerParts));
  const upperJoined = keep(runtime.Manifold.union(upperParts));
  const upper = runtime.Manifold.difference(upperJoined, keep(runtime.Manifold.union(cuts)));
  const lower = lowerCuts.length ? runtime.Manifold.difference(lowerJoined, keep(runtime.Manifold.union(lowerCuts))) : lowerJoined.translate([0, 0, 0]);
  made.forEach((solid) => solid.delete());
  return { upper, lower, axleY: ay, rest: rest / deg, pinY, bossTop, centres };
}
