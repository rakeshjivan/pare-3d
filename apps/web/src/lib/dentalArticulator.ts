/**
 * The printed articulator, made so it keeps the scanned bite (build 78; build 84 after Rakesh's prints
 * of builds 77 to 82).
 *
 * - Two ball condyles on the lower, as wide apart as the models allow, each dropping into a cup under
 *   the upper by a channel slanting down and back - builds 63-77's joint, which printed easily, located
 *   well and had the least play: the cup is the ball's shape CUP_FIT bigger all round, so nothing snaps,
 *   flexes or is forced (build 78-83's seats, grooves and snap keepers were stiff in resin and bulky).
 * - A split pin, as on a lab articulator: a 5 mm rod in two halves on arms along the bottom of each base,
 *   the upper half's dome in a shallow dish in the lower half's top - in front of the incisors, one each
 *   side in the premolar region (build 79), or none (build 82: the teeth stop the hinge).
 * - An opening above 0 makes the upper half longer: the upper turns open about the condyles' axis, as
 *   on an articulator, the front teeth parting by less than the pin and the back teeth by less again.
 *   Every part of the pin stands at least PIN_CLEAR in front of the teeth.
 * - Opening: the upper turns about the balls' axis up to 90 degrees, the necks swinging back through
 *   room left in the cups' blocks.
 */
import type { ManifoldRuntime, ManifoldSolid } from "@/lib/dentalMesh";
import { labelSection, labelText, labelWidth } from "@/lib/dentalLabel";

const deg = Math.PI / 180;

/** The ball condyles' radius, mm (10 mm across). */
export const CONDYLE_RADIUS = 5;
/**
 * Build 84: the drop-in cup, exactly as builds 63-77 made it (it printed easily, located well and had
 * the least play of any joint Pare 3D has made): the seat is the ball's own shape, CUP_FIT larger all
 * round, and the ball drops in by a channel - nothing snaps or is forced. The pin, not the cups, sets
 * the height of the bite.
 */
export const CUP_FIT = 0.1;
/** The cup's block: its wall beside the ball, how far it reaches in front of and behind the ball's centre, and below its equator, mm. */
export const CUP_WALL = 2.2;
export const CUP_HALF_Y = CONDYLE_RADIUS + 3;
export const CUP_UNDER = 3;
/** Half the block's width across the axis, mm. */
export const CUP_HALF_X = CONDYLE_RADIUS + CUP_FIT + CUP_WALL;
/** The channel the ball drops in by: degrees back from straight down (build 63's). */
export const DROP_IN_CHANNEL = 35;
const NECK = 2.5;
/** The pedestal's top stands this far below the balls' centres, mm - clear of the cup's block as it swings down past it when the models open (build 63's). */
const PEDESTAL = CONDYLE_RADIUS + 4;
/**
 * Build 84: the split pin, like a lab articulator's - a 5 mm rod in two halves, one on each model, on
 * 5 mm arms along the bottom of its base, meeting at the occlusal plane. The upper half ends in a dome
 * (its own radius, fully rounded); the lower half's top has a shallow dish a little wider than the dome,
 * so the dome settles in its middle every time without binding. To hold the bite open the upper half
 * is longer: the same pin in front of the incisors or one each side.
 */
export const PIN_RADIUS = 2.5;
export const PIN_DOME = PIN_RADIUS;
/** The dish in the lower half's top: the sphere it is cut by (radius) and its depth, mm. */
export const PIN_DISH = 3;
export const PIN_DISH_DEPTH = 0.5;
/** The removable set's cup column (build 79), mm. */
export const CUP_COLUMN = 3;
/** The pin and its arms are no wider than this either side of the pin's line, mm (for the teeth's clearance). */
export const PIN_HALF = PIN_RADIUS;

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
  return back + CUP_HALF_Y + 0.5;
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

/**
 * Build 84: the split pin at (x, y) - y its place in the upper's frame, the models closed - for an upper
 * standing turned open by `rest` (radians) about the axis at axisY. The upper half drops to its dome;
 * the lower half stands under where the dome comes to rest, its dish's floor just under the dome.
 * Returns each half, the dish to cut from the lower, and the lower half's y.
 */
function splitPin(runtime: ManifoldRuntime, x: number, y: number, rest: number, axisY: number, floorUpper: number, floorLower: number, keep: (solid: ManifoldSolid) => ManifoldSolid) {
  // The dome's centre in the upper's frame, so that turned open it stands PIN_DOME above the plane.
  const dy = y - axisY;
  const zc = (PIN_DOME + dy * Math.sin(rest)) / Math.cos(rest);
  const restY = axisY + dy * Math.cos(rest) + zc * Math.sin(rest);
  // A polygon's flats lie inside its sphere: the dish is grown by their depth, so their facets never cross.
  const dish = PIN_DISH / Math.cos(Math.PI / 64);
  return {
    upper: [
      keep(runtime.Manifold.cylinder(Math.max(0.01, floorUpper - zc), PIN_RADIUS, PIN_RADIUS, 64).translate([x, y, zc])),
      keep(runtime.Manifold.sphere(PIN_DOME, 64).translate([x, y, zc])),
    ],
    lower: [keep(runtime.Manifold.cylinder(PIN_DISH_DEPTH - floorLower, PIN_RADIUS, PIN_RADIUS, 64).translate([x, restY, floorLower]))],
    cut: keep(runtime.Manifold.sphere(dish, 64).translate([x, restY, dish - 0.01])),
    restY,
  };
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
  const half = Math.max(CUP_HALF_X, known ? (xMax - xMin) / 2 : 14);
  // As wide as the models allow: the cups' outer edges at the heels' outer edges.
  const centres = half >= 2 * CUP_HALF_X + 2
    ? [cx - half + CUP_HALF_X, cx + half - CUP_HALF_X]
    : [cx - CUP_HALF_X - 1, cx + CUP_HALF_X + 1];
  const made: ManifoldSolid[] = [];
  const keep = <T extends ManifoldSolid>(solid: T) => { made.push(solid); return solid; };
  const yBack = ay + CUP_HALF_Y;
  const lowerParts: ManifoldSolid[] = [];
  const upperParts: ManifoldSolid[] = [];
  const cuts: ManifoldSolid[] = [];
  const lowerCuts: ManifoldSolid[] = [];
  // A bar along the back of each base, reaching across every heel, with a strut to each heel.
  const span = (heels: ArticulatorHeel[] | undefined): [number, number] => {
    const xs = [centres[0] - CUP_HALF_X, centres[1] + CUP_HALF_X, ...(heels ?? []).flatMap((heel) => [heel.x - 4, heel.x + 4])];
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
  let pinY = front ? Math.min(Math.min(front.upperY, front.lowerY) - PIN_AHEAD, (front.teethY ?? Infinity) - PIN_HALF - PIN_CLEAR) : NaN;
  // Build 84: raised, the upper turns and the lower half stands a little behind the upper's: both clear.
  if (front && !front.sides && raise > 0) {
    for (let k = 0; k < 3; k += 1) {
      const rest = restAngle(raise, ay, pinY), dy = pinY - ay;
      const restY = ay + dy * Math.cos(rest) + ((PIN_DOME + dy * Math.sin(rest)) / Math.cos(rest)) * Math.sin(rest);
      const limit = Math.min(Math.min(front.upperY, front.lowerY) - PIN_AHEAD, (front.teethY ?? Infinity) - PIN_HALF - PIN_CLEAR);
      pinY = Math.min(pinY, limit - Math.max(0, restY - pinY));
    }
  }
  centres.forEach((c) => {
    // The lower: a pedestal from its bar, a neck and the ball, centred on the axis (y = ay, z = 0).
    // The pedestal stops below where the cup's block swings down past it as the models open.
    lowerParts.push(
      keep(box(runtime, c - 4, c + 4, ay - 4, ay + 4, floorLower, Math.max(floorLower + 1, -PEDESTAL))),
      keep(runtime.Manifold.cylinder(PEDESTAL + 0.5, NECK, NECK, 32).translate([c, ay, -PEDESTAL - 0.25])),
      keep(runtime.Manifold.sphere(R, 96).translate([c, ay, 0])),
    );
    // Build 84: the drop-in cup, as builds 63-77 made it - a small block round the ball, reaching
    // CUP_UNDER under its equator at the front and sides; the seat, the ball's own shape CUP_FIT larger
    // all round; and the channel the ball drops in by, as wide as the seat, slanting down and back out
    // of the block. A polygon's flats lie inside its sphere: the seat is grown by their depth.
    const top = (R + CUP_FIT) / Math.cos(Math.PI / 96);
    upperParts.push(keep(box(runtime, c - CUP_HALF_X, c + CUP_HALF_X, ay - CUP_HALF_Y, ay + CUP_HALF_Y, -CUP_UNDER, floorUpper)));
    const seat = keep(runtime.Manifold.sphere(top, 96).translate([c, ay, 0]));
    const tilt = DROP_IN_CHANNEL * deg, run = R + CUP_UNDER + 8;
    const out = keep(runtime.Manifold.sphere(top, 96).translate([c, ay + Math.sin(tilt) * run, -Math.cos(tilt) * run]));
    cuts.push(keep(runtime.Manifold.hull([seat, out])));
    // Room behind the ball for the neck as the models open (in the upper's frame it swings back).
    cuts.push(keep(box(runtime, c - NECK - 0.6, c + NECK + 0.6, ay, ay + CUP_HALF_Y + 1, -CUP_UNDER - 1, NECK + 1)));
  });
  let rest = 0;
  let bossTop = NaN;
  const lowerCut = (solid: ManifoldSolid) => lowerCuts.push(solid);
  if (front?.sides) {
    // Build 79: the pins either side. The opening is still set at the incisal pin's place in front of
    // the incisors (pinY), so it reads the same; each upper half is as long as that turn needs there.
    rest = restAngle(raise, ay, pinY);
    bossTop = Math.max(-BOSS_TOP, floorLower + 3);
    const { y, posts, bases } = front.sides;
    posts.forEach((x, side) => {
      const inward = (to: number) => [Math.min(x, to), Math.max(x, to)] as const;
      const [lx0, lx1] = inward(bases.lower[side] + (side === 0 ? 3 : -3));
      const [ux0, ux1] = inward(bases.upper[side] + (side === 0 ? 3 : -3));
      // Build 84: the split pin, each half on a 5 mm arm into its own base.
      const pin = splitPin(runtime, x, y, rest, ay, floorUpper, floorLower, keep);
      lowerParts.push(keep(box(runtime, lx0, lx1, pin.restY - PIN_RADIUS, pin.restY + PIN_RADIUS, floorLower, floorLower + 3)), ...pin.lower);
      upperParts.push(keep(box(runtime, ux0, ux1, y - PIN_RADIUS, y + PIN_RADIUS, floorUpper - 3, floorUpper)), ...pin.upper);
      lowerCut(pin.cut);
    });
  } else if (front) {
    const x = pinX;
    rest = restAngle(raise, ay, pinY);
    // The boss's top: BOSS_TOP below the occlusal plane, or less on a shallow base.
    bossTop = Math.max(-BOSS_TOP, floorLower + 3);
    const column = (radius: number, z0: number, z1: number, sides = 48) => runtime.Manifold.cylinder(z1 - z0, radius, radius, sides).translate([x, pinY, z0]);
    const bossRadius = PIN.disc + PIN.rimClear + PIN.rimWall;
    if (pinStyle === "set") {
      // The removable set (build 79): an arm and the boss on the lower, each pin's tip in a cup under the upper.
      lowerParts.push(keep(box(runtime, x - 2.5, x + 2.5, pinY - 4.5, front.lowerY + 3, floorLower, floorLower + 3)));
      lowerParts.push(keep(column(bossRadius, floorLower, bossTop)));
      // Maxwell's seat: three domes on the boss, under the three grooves of each pin's disc; and a rim
      // round the disc, clear of it, so a pin cannot be knocked off.
      for (const azimuth of [90, 210, 330]) {
        const a = azimuth * deg;
        lowerParts.push(keep(runtime.Manifold.sphere(PIN.dome, 96).translate([x + Math.cos(a) * PIN.seatRadius, pinY + Math.sin(a) * PIN.seatRadius, bossTop])));
      }
      lowerParts.push(keep(runtime.Manifold.difference(column(bossRadius, bossTop - 0.01, bossTop + PIN.rimHigh), keep(column(PIN.disc + PIN.rimClear, bossTop, bossTop + PIN.rimHigh + 1)))));
      const apex = PIN.tip * Math.SQRT2;
      upperParts.push(
        keep(runtime.Manifold.cylinder(floorUpper - 0.5, CUP_COLUMN, CUP_COLUMN, 48).translate([x, pinY, 0.5])),
        keep(box(runtime, x - 2.5, x + 2.5, pinY - 2.5, front.upperY + 3, floorUpper - 3, floorUpper)),
      );
      const mouth = apex + 1;
      // Its faces outside the true cone (a polygon's flats circumscribe it), so the tip's facets never cross them.
      cuts.push(keep(runtime.Manifold.cylinder(mouth, mouth / Math.cos(Math.PI / 64), 0, 64).translate([x, pinY, apex - mouth])));
    } else {
      // Build 84: the split pin in front of the incisors, each half on a 5 mm arm along the bottom of its
      // own base, reaching 3 mm into it at its front.
      const pin = splitPin(runtime, x, pinY, rest, ay, floorUpper, floorLower, keep);
      lowerParts.push(keep(box(runtime, x - PIN_RADIUS, x + PIN_RADIUS, Math.min(pin.restY, pinY) - PIN_RADIUS, front.lowerY + 3, floorLower, floorLower + 3)), ...pin.lower);
      upperParts.push(keep(box(runtime, x - PIN_RADIUS, x + PIN_RADIUS, pinY - PIN_RADIUS, front.upperY + 3, floorUpper - 3, floorUpper)), ...pin.upper);
      lowerCut(pin.cut);
    }
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
