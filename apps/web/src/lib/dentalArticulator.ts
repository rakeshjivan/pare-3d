/**
 * Build 78 (build 79: Kelvin's layout): the one printed articulator, made so it cannot change the
 * scanned bite.
 *
 * A kinematic coupling - Kelvin's clamp, as in precision instruments: the upper is located by
 * exactly six contacts and nothing else.
 * - At the front, the incisal pin's rounded tip in a cone-shaped cup under the upper (three
 *   constraints): it centres itself as the models close, like the pin and cup of a lab articulator.
 * - Behind, two ball condyles on the lower, set as wide apart as the models allow. Over the first a
 *   V-groove in the upper, aimed at the cup (two constraints): the ball can slide along it, so the
 *   distance from condyle to pin never has to match exactly, whatever the printer shrinks.
 * - Over the second, a flat (one constraint): it stops the upper rolling, and lets that ball sit
 *   wherever the print puts it.
 * Nothing else touches: no snap, clip or axle fit to fight the seats, so the models close to the
 * same place every time. The upper's own weight seats it (the groove faces and the cup slope at 45
 * degrees, so the ball and tip slide home whatever the friction of the resin, short of a coefficient
 * of 1), and a keeper - a lip round each ball below its equator, 0.3 mm clear of it - stops it lifting
 * off when the models are picked up or turned over. The keeper never touches while the models are
 * closed. The ball goes in by a channel running straight back: the models are parted by sliding the
 * upper forward off the balls, never pulled.
 *
 * Opening: the two balls lie on one line, so the upper turns about it like a hinge, up to 90 degrees;
 * every part of the seats stands clear of the balls' necks as it turns.
 *
 * The incisal pin (build 79) is either fused to the lower at the opening chosen (0 = the scanned
 * bite), or a set of removable pins, each engraved with how far it raises the bite at the pin. A
 * removable pin sits on its boss by Maxwell's three-groove seat: three domes on the boss, three
 * V-grooves under the pin's disc - located in all six directions with no clearance anywhere, so every
 * pin of the set stands exactly where the fused pin would. A rim round the disc, clear of it, only
 * keeps a pin from being knocked off. A raised pin turns the upper open about the condyles' axis, as
 * on an articulator: the front teeth part by less than the pin, the back teeth by less again.
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
/** The flat's block is this much longer each way along the axis, mm: the room the second ball may stand in. */
export const GROOVE_SLIDE = 3;
/** The room the balls may stand in the other ways (along the groove; front to back on the flat), mm. */
const GROOVE_PLAY = 1;
/** Half the size of the cup's block, mm. */
const CUP_HALF = 5;
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

/**
 * Build 79: the incisal pin - its rounded tip (radius), the cup it sits in (a 45-degree cone), the
 * fused pin's foot, and a removable pin's disc on its three-groove seat: the domes (radius, at
 * `seatRadius` from the pin's axis), the disc (radius, thickness, how far above the boss it stands
 * clear) and the rim round it (clear of the disc, its height).
 */
export const PIN = { tip: 1.75, foot: 3.5, footRise: 3, disc: 6.5, discThick: 2.5, dome: 1.75, seatRadius: 4, discClear: 0.5, rimClear: 0.5, rimWall: 1.5, rimHigh: 2, engrave: 0.4, text: 2.5 };
/** How the incisal pin is made: fused to the lower at the opening chosen, or a set of removable pins. */
export type PinStyle = "fused" | "set";
/** The pin boss's top stands this far below the occlusal plane, mm (less on a shallow base). */
const BOSS_TOP = 6;
/** The pin stands this far in front of the further-forward model, mm. */
const PIN_AHEAD = 6;
/** Build 79: the cup's block and the pin's boss stand at least this far in front of any tooth, mm. */
export const PIN_CLEAR = 2;
/** Build 79: across this half-width of the pin's line (mm) the teeth are looked at for the pin's place - wider than the cup's block and the boss. */
export const PIN_BAND = 8;
/** Raises the removable pin set offers, mm: the scanned bite and whole millimetres to 6. */
export const PIN_SET = [0, 1, 2, 3, 4, 5, 6] as const;
/** A pin raise is chosen in these steps, up to this, mm; above PIN_WARN the arc is unvalidated. */
export const PIN_STEP = 0.5;
export const PIN_MAX = 10;
export const PIN_WARN = 6;

/** The rearmost point of a model's base on one side of the midline, in the pair's frame. */
export type ArticulatorHeel = { x: number; y: number };
/**
 * Where the incisal pin goes: its x, the front of each model's base there (the pair's frame), and
 * (build 79) `teethY`, the furthest-forward point of either model - teeth, wax-up and all - across
 * the pin's band, so the pin and its cup stand clear of proclined incisors that overhang the base.
 */
export type ArticulatorFront = { x: number; upperY: number; lowerY: number; teethY?: number; sides?: ArticulatorSides };
/**
 * Build 79: the incisal pin's two posts either side, in the premolar region, instead of one in front of
 * the incisors: their y, each post's x (already clear of the teeth and bases), and where each side's
 * base reaches across at that y (x), for the arms that join the posts to the models.
 */
export type ArticulatorSides = { y: number; posts: [number, number]; bases: { upper: [number, number]; lower: [number, number] } };
/** Build 79: half the size of a side post's pad block, mm; the post's foot is PIN.foot. */
export const POST_HALF = 4;
/** Build 79: the side posts stand this far behind the front of the incisors, mm - about the premolars. */
export const POST_BACK = 16;

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
 * from below the block up to where the faces meet. Built as the hull of its corners. Three faces: a
 * trihedral seat; two: a V-groove running along `axis` (horizontal, unit), `reach` each way.
 */
function seatCavity(runtime: ManifoldRuntime, centre: [number, number, number], faces: Array<[number, number, number]>, low: number, groove?: { axis: [number, number]; reach: number }) {
  const R = CONDYLE_RADIUS;
  const offset = (d: [number, number, number]) => R + d[0] * centre[0] + d[1] * centre[1] + d[2] * centre[2];
  const points: Array<[number, number, number]> = [];
  if (!groove) {
    points.push(solve3(faces, faces.map(offset)));
    for (let i = 0; i < 3; i += 1) {
      const a = faces[i], b = faces[(i + 1) % 3];
      points.push(solve3([a, b, [0, 0, 1]], [offset(a), offset(b), low]));
    }
  } else {
    // The ridge where the two faces meet and their feet at z = low, at both ends.
    const plane: [number, number, number] = [groove.axis[0], groove.axis[1], 0];
    const along = plane[0] * centre[0] + plane[1] * centre[1];
    for (const at of [along - groove.reach, along + groove.reach]) {
      points.push(solve3([faces[0], faces[1], plane], [offset(faces[0]), offset(faces[1]), at]));
      points.push(solve3([faces[0], [0, 0, 1], plane], [offset(faces[0]), low, at]));
      points.push(solve3([faces[1], [0, 0, 1], plane], [offset(faces[1]), low, at]));
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
 * Build 79: where the pin tip's centre stands for a raise (y, z): the cup's centre - at the occlusal
 * plane, at pinY, with the models closed - turned open about the condyles' axis by the rest angle.
 */
export function pinTipAt(raise: number, axisY: number, pinY: number): [number, number] {
  const rest = restAngle(raise, axisY, pinY);
  const dy = pinY - axisY;
  return [axisY + dy * Math.cos(rest), -dy * Math.sin(rest)];
}

/** The tip and its stem from `z0` up: a cylinder of the tip's radius, flared to `foot` at the bottom, and the rounded tip. */
function pinStem(runtime: ManifoldRuntime, x: number, y: number, z0: number, tip: number, keep: (solid: ManifoldSolid) => ManifoldSolid, foot = PIN.foot) {
  const rise = Math.max(0.01, Math.min(PIN.footRise, tip - z0 - 0.5));
  return [
    keep(runtime.Manifold.cylinder(rise, foot, PIN.tip, 48).translate([x, y, z0])),
    keep(runtime.Manifold.cylinder(Math.max(0.01, tip - z0), PIN.tip, PIN.tip, 48).translate([x, y, z0])),
    keep(runtime.Manifold.sphere(PIN.tip, 48).translate([x, y, tip])),
  ];
}

/** The three V-grooves under a removable pin's disc, around its axis at (x, y), the disc's underside at z0. */
function pinGrooves(runtime: ManifoldRuntime, x: number, y: number, z0: number, keep: (solid: ManifoldSolid) => ManifoldSolid) {
  // 45-degree faces meeting at a ridge a dome's radius times root 2 above the domes' centres - the
  // domes touch each face at 45 degrees. The domes' centres are discClear + ridge - depth below z0.
  const ridge = PIN.dome * Math.SQRT2;
  const depth = ridge - PIN.discClear;
  return [90, 210, 330].map((azimuth) => {
    // A prism: a square turned 45 degrees about the groove's line, its top edge at the ridge.
    const length = PIN.disc + 1;
    const prism = runtime.Manifold.cube([length, depth * Math.SQRT2, depth * Math.SQRT2], true)
      .rotate([45, 0, 0])
      .translate([length / 2 + 0.5, 0, z0]);
    return keep(prism.rotate([0, 0, azimuth]).translate([x, y, 0]));
  });
}

/**
 * The removable pin set, laid out for printing on the plate (each standing on its disc, joined by a
 * snap-off bar), each disc engraved with its raise. `raises` in mm; `axisY`, `pinY`, `bossTop` as
 * the articulator was built.
 */
export function incisalPins(runtime: ManifoldRuntime, raises: number[], axisY: number, pinY: number, bossTop: number) {
  const made: ManifoldSolid[] = [];
  const keep = <T extends ManifoldSolid>(solid: T) => { made.push(solid); return solid; };
  const pins: ManifoldSolid[] = [];
  const spacing = 2 * PIN.disc + 4;
  // Built as it stands on its boss, then put down on the plate: its disc's underside at z = 0.
  const under = bossTop + PIN.discClear;
  raises.forEach((raise, index) => {
    const [tipY, tipZ] = pinTipAt(raise, axisY, pinY);
    const top = under + PIN.discThick;
    let pin: ManifoldSolid = keep(runtime.Manifold.union([
      keep(runtime.Manifold.cylinder(PIN.discThick, PIN.disc, PIN.disc, 64).translate([0, pinY, under])),
      ...pinStem(runtime, 0, tipY, top, tipZ, keep),
    ]));
    pin = keep(runtime.Manifold.difference(pin, keep(runtime.Manifold.union(pinGrooves(runtime, 0, pinY, under, keep)))));
    // The raise engraved on the disc's top, beside the stem.
    const text = labelText(raise.toFixed(raise % 1 ? 1 : 0));
    if (text && labelWidth(text, PIN.text) < PIN.disc - PIN.foot - 0.5) {
      const section = labelSection(runtime, text, PIN.text);
      const width = labelWidth(text, PIN.text);
      const cut = keep(section.extrude(PIN.engrave + 0.2).translate([PIN.foot + 0.3 + width / 2, pinY - 0.2 * PIN.text, top - PIN.engrave]));
      section.delete();
      pin = keep(runtime.Manifold.difference(pin, cut));
    }
    pins.push(keep(pin.translate([index * spacing, -pinY, -under])));
  });
  // The snap-off bar: thin necks between the discs' rims, on the plate.
  for (let i = 0; i + 1 < raises.length; i += 1) pins.push(keep(box(runtime, i * spacing + PIN.disc - 0.3, (i + 1) * spacing - PIN.disc + 0.3, -0.6, 0.6, 0, 1)));
  const set = runtime.Manifold.union(pins);
  made.forEach((solid) => solid.delete());
  return set;
}

/**
 * The articulator in the pair's frame (occlusal plane z = 0, back +y, the upper above): what joins
 * the upper, what joins the lower, the axis (y), the rest angle for `raise` (degrees), and where
 * the pin stands. `back`: the models' backs; `xMin`/`xMax`: across their heels; `floorUpper`/
 * `floorLower`: the bases' undersides (z); `backs`: each model's heels, for the bars; `pinStyle`:
 * the pin fused to the lower at `raise`, or a boss for the removable set.
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
  pinStyle: PinStyle = "fused",
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
  // The cup's place: in front of the further-forward model, on the midline of the models.
  const pinX = front ? front.x : cx;
  // Build 79: never on the teeth - clear of the furthest-forward tooth across the pin's band, as well as the bases.
  const pinY = front ? Math.min(Math.min(front.upperY, front.lowerY) - PIN_AHEAD, (front.teethY ?? Infinity) - Math.max(CUP_HALF, PIN.foot + 1) - PIN_CLEAR) : NaN;
  centres.forEach((c, index) => {
    // The lower: a pedestal from its bar, a neck and the ball, centred on the axis (y = ay, z = 0).
    // The pedestal stops at the neck behind, where the seat block swings down past it at 90 degrees.
    lowerParts.push(
      keep(box(runtime, c - 4, c + 4, ay - 4, ay + NECK, floorLower, Math.max(floorLower + 1, -PEDESTAL))),
      keep(runtime.Manifold.cylinder(PEDESTAL + 0.5, NECK, NECK, 32).translate([c, ay, -PEDESTAL - 0.25])),
      keep(runtime.Manifold.sphere(R, 96).translate([c, ay, 0])),
    );
    // The upper: the seat block, from SEAT_FLOOR above the ball's centre up into the upper's bar.
    // With the pin in the middle (Kelvin): the first ball in a V-groove aimed at the cup, the second on
    // a flat. With posts either side (build 79): a hinge - the first ball in a three-face seat, the
    // second in a groove along the axis; the posts only stop it closing, so nothing is held twice.
    // Build 82: with no pin at all, the hinge too - the condyles alone make a true hinge axis and the
    // teeth stop it closing (a Kelvin groove and flat would leave the upper free to slide without the cup).
    const sideMode = Boolean(front?.sides) || !front;
    const flat = !sideMode && index === 1;
    const along = sideMode && index === 1;
    const x0 = c - SEAT_HALF - (flat || along ? GROOVE_SLIDE : 0), x1 = c + SEAT_HALF + (flat || along ? GROOVE_SLIDE : 0);
    upperParts.push(keep(box(runtime, x0, x1, ay - SEAT_HALF, ay + SEAT_HALF, -KEEPER_LOW, floorUpper)));
    const centre: [number, number, number] = [c, ay, 0];
    // Where the ball may stand: along the groove, or anywhere about the flat.
    let room: Array<[number, number]>;
    if (sideMode && !along) {
      cuts.push(keep(seatCavity(runtime, centre, seatDirections([90, 210, 330]), SEAT_FLOOR - 0.5)));
      room = [[0, 0]];
    } else if (along) {
      cuts.push(keep(seatCavity(runtime, centre, seatDirections([90, 270]), SEAT_FLOOR - 0.5, { axis: [1, 0], reach: SEAT_HALF + GROOVE_SLIDE + 1 })));
      room = [[-GROOVE_SLIDE, 0], [GROOVE_SLIDE, 0]];
    } else if (!flat) {
      const toward = front ? [pinX - c, pinY - ay] : [0, -1];
      const n = Math.hypot(toward[0], toward[1]);
      const axis: [number, number] = [toward[0] / n, toward[1] / n];
      const azimuth = Math.atan2(axis[1], axis[0]) / deg;
      cuts.push(keep(seatCavity(runtime, centre, seatDirections([azimuth + 90, azimuth + 270]), SEAT_FLOOR - 0.5, { axis, reach: SEAT_HALF * 2 })));
      room = [[-axis[0] * GROOVE_PLAY, -axis[1] * GROOVE_PLAY], [axis[0] * GROOVE_PLAY, axis[1] * GROOVE_PLAY]];
    } else {
      // The flat: the ball's room, up to its top (z = R), clear all round of where it may stand.
      const spots: ManifoldSolid[] = [];
      for (const dx of [-GROOVE_SLIDE, GROOVE_SLIDE]) for (const dy of [-GROOVE_PLAY, GROOVE_PLAY]) spots.push(keep(runtime.Manifold.cylinder(R - SEAT_FLOOR + 1, R + 0.5, R + 0.5, 64).translate([c + dx, ay + dy, SEAT_FLOOR - 1])));
      cuts.push(keep(runtime.Manifold.hull(spots)));
      room = [[-GROOVE_SLIDE, -GROOVE_PLAY], [GROOVE_SLIDE, -GROOVE_PLAY], [-GROOVE_SLIDE, GROOVE_PLAY], [GROOVE_SLIDE, GROOVE_PLAY]];
    }
    // The keeper: the ball's room below the seats (KEEPER_FIT clear of it wherever it may stand) and
    // the channel it comes in by - only below SEAT_FLOOR, so the seat faces stay whole.
    const tilt = KEEPER_CHANNEL * deg, run = R + KEEPER_LOW + 6;
    const balls: ManifoldSolid[] = [];
    for (const [dx, dy] of room) {
      balls.push(keep(runtime.Manifold.sphere(R + KEEPER_FIT, 64).translate([c + dx, ay + dy, 0])));
      balls.push(keep(runtime.Manifold.sphere(R + KEEPER_FIT, 64).translate([c + dx, ay + dy + Math.sin(tilt) * run, -Math.cos(tilt) * run])));
    }
    const keeperRoom = keep(runtime.Manifold.hull(balls));
    cuts.push(keep(runtime.Manifold.intersection(keeperRoom, keep(box(runtime, x0 - 1, x1 + 1, ay - SEAT_HALF - 1, ay + SEAT_HALF + 1, -R - KEEPER_LOW - 10, SEAT_FLOOR)))));
  });
  let rest = 0;
  let bossTop = NaN;
  if (front?.sides) {
    // Build 79: the posts either side. The opening is still set at the incisal pin's place in front of
    // the incisors (pinY), so it reads the same; each post stands as high as that turn needs there.
    rest = restAngle(raise, ay, pinY);
    bossTop = Math.max(-BOSS_TOP, floorLower + 3);
    const { y, posts, bases } = front.sides;
    // The tip's centre, under the post's pad: one tip radius below it, the pad (flat, at the occlusal
    // plane when closed) turned open about the axis.
    const tipY = y;
    const tipZ = (ay - y) * Math.tan(rest) - PIN.tip / Math.cos(rest);
    posts.forEach((x, side) => {
      const inward = (to: number) => [Math.min(x, to), Math.max(x, to)] as const;
      const [lx0, lx1] = inward(bases.lower[side] + (side === 0 ? 3 : -3));
      const [ux0, ux1] = inward(bases.upper[side] + (side === 0 ? 3 : -3));
      lowerParts.push(
        keep(runtime.Manifold.cylinder(bossTop - floorLower, PIN.foot + 1, PIN.foot + 1, 48).translate([x, tipY, floorLower])),
        keep(box(runtime, lx0, lx1, tipY - 2.5, tipY + 2.5, floorLower, floorLower + 3)),
        ...pinStem(runtime, x, tipY, bossTop - 0.01, tipZ, keep),
      );
      upperParts.push(
        keep(box(runtime, x - POST_HALF, x + POST_HALF, y - POST_HALF, y + POST_HALF, 0, floorUpper)),
        keep(box(runtime, ux0, ux1, y - 2.5, y + 2.5, floorUpper - 3, floorUpper)),
      );
    });
  } else if (front) {
    const x = pinX;
    rest = restAngle(raise, ay, pinY);
    // The boss's top: BOSS_TOP below the occlusal plane, or less on a shallow base.
    bossTop = Math.max(-BOSS_TOP, floorLower + 3);
    const column = (radius: number, z0: number, z1: number, sides = 48) => runtime.Manifold.cylinder(z1 - z0, radius, radius, sides).translate([x, pinY, z0]);
    const bossRadius = pinStyle === "set" ? PIN.disc + PIN.rimClear + PIN.rimWall : PIN.foot + 1;
    // The lower: the boss, on an arm along the bottom of its base.
    lowerParts.push(
      keep(column(bossRadius, floorLower, bossTop)),
      keep(box(runtime, x - 2.5, x + 2.5, pinY - 4.5, front.lowerY + 3, floorLower, floorLower + 3)),
    );
    if (pinStyle === "set") {
      // Maxwell's seat: three domes on the boss, under the three grooves of each pin's disc; and a rim
      // round the disc, clear of it, so a pin cannot be knocked off.
      for (const azimuth of [90, 210, 330]) {
        const a = azimuth * deg;
        lowerParts.push(keep(runtime.Manifold.sphere(PIN.dome, 96).translate([x + Math.cos(a) * PIN.seatRadius, pinY + Math.sin(a) * PIN.seatRadius, bossTop])));
      }
      lowerParts.push(keep(runtime.Manifold.difference(column(bossRadius, bossTop - 0.01, bossTop + PIN.rimHigh), keep(column(PIN.disc + PIN.rimClear, bossTop, bossTop + PIN.rimHigh + 1)))));
    } else {
      // The pin itself, fused to the boss, its tip where the cup stands at this opening.
      const [tipY, tipZ] = pinTipAt(raise, ay, pinY);
      lowerParts.push(...pinStem(runtime, x, tipY, bossTop - 0.01, tipZ, keep));
    }
    // The upper: the cup's block, on an arm along the top of its base, with the cup - a 45-degree cone
    // whose faces touch the tip's sphere when its centre is at the occlusal plane - opening downwards.
    const apex = PIN.tip * Math.SQRT2;
    upperParts.push(
      keep(box(runtime, x - CUP_HALF, x + CUP_HALF, pinY - CUP_HALF, pinY + CUP_HALF, 0, floorUpper)),
      keep(box(runtime, x - 2.5, x + 2.5, pinY - 4, front.upperY + 3, floorUpper - 3, floorUpper)),
    );
    const mouth = apex + 1;
    // Its faces outside the true cone (a polygon's flats circumscribe it), so the tip's facets never cross them.
    cuts.push(keep(runtime.Manifold.cylinder(mouth, mouth / Math.cos(Math.PI / 64), 0, 64).translate([x, pinY, apex - mouth])));
  }
  const lowerJoined = keep(runtime.Manifold.union(lowerParts));
  const upperJoined = keep(runtime.Manifold.union(upperParts));
  const upper = runtime.Manifold.difference(upperJoined, keep(runtime.Manifold.union(cuts)));
  const lower = lowerCuts.length ? runtime.Manifold.difference(lowerJoined, keep(runtime.Manifold.union(lowerCuts))) : lowerJoined.translate([0, 0, 0]);
  made.forEach((solid) => solid.delete());
  return { upper, lower, axleY: ay, rest: rest / deg, pinY, bossTop, centres };
}

/** Build 82: the pin and the opening, as the panel sets them. */
export type ArticulatorPinSettings = { incisalPin?: boolean; pinRaise?: number };
/**
 * Build 82: the incisal pin and the opening go together - an opening above 0 mm is held by the pin,
 * so raising it turns the pin on; leaving the pin out closes the models to the scanned bite (0 mm).
 */
export function articulatorPinPatch(patch: ArticulatorPinSettings): ArticulatorPinSettings {
  if (patch.incisalPin === false) return { ...patch, pinRaise: 0 };
  if ((patch.pinRaise ?? 0) > 0) return { ...patch, incisalPin: true };
  return patch;
}
