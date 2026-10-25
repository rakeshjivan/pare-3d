import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import { BALL_SNAP, DROP_IN_CHANNEL, HINGE_AXLE_RADIUS, HINGE_BALL_RADIUS, HINGE_CLIP_HALF, HINGE_FITS, HINGE_POST_WIDTH, HINGE_TEST_FITS, TONGUE } from "@/lib/dentalBase";
import type { ReadyPart } from "@/lib/readyParts";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork (build 60): a hinge fit test - the Dental Studio articulator's bearing printed small, once for
 * each fit it offers. A strip carries five pairs of posts with their axles, the same size as the
 * models' hinge; five clips, one for each fit, snap over them. The clip that snaps on and turns
 * without play is the fit to choose under Hinge fit, and Pare 3D remembers it.
 *
 * Both print as they lie: the strip axles up, the clips opening up, like the models' hinge does on
 * the plate. The clip turns over to snap down onto its axle.
 */

const STORAGE_KEY = "pare3d.myHingeFit";
const PLATE = 3;
/** The axle's centre above the bed, mm: 6 mm over the plate - room under the clip and over the posts. */
const AXLE = PLATE + 6;
// Build 62: the models' bearing as it is now - a 14 mm clip, with the fit as room along the axle too.
const CLIP_HALF = HINGE_CLIP_HALF;
const POST_WIDTH = HINGE_POST_WIDTH;
const SNAP = 0.8;
const SPACING = 26;

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

const box = (x: number, z: number, elevation: number, width: number, depth: number, height: number) =>
  makeShapeFromAsset(asset("box"), { x, z, elevation }, { width, depth, height });

/** A cylinder lying along x, centred at (x, z) with its axis `elevation` above the plate. */
function axle(x: number, z: number, elevation: number, radius: number, length: number): WorkplaneShape {
  const shape = makeShapeFromAsset(asset("cylinder"), { x, z, elevation: elevation - length / 2 }, { width: radius * 2, depth: radius * 2, height: length });
  // Stood on its end and turned onto its side about its own middle.
  return { ...shape, rotationZ: 90 };
}

function label(text: string, x: number, z: number) {
  const shape = makeShapeFromAsset(asset("text"), { x, z, elevation: PLATE - 0.6 }, { text, width: 11, depth: 3.5, height: 1.6 });
  return { ...shape, text, hole: true };
}

const fitText = (fit: number) => String(fit);

export function hingeFitTestParts(names: { strip: string; clip: string }): ReadyPart[] {
  const r = HINGE_AXLE_RADIUS;
  const count = HINGE_TEST_FITS.length;
  const length = SPACING * count + 2;
  const centre = (index: number) => -length / 2 + 1 + SPACING / 2 + index * SPACING;
  // The strip: posts 8 mm deep either side of each clip's place, the axle across them.
  const strip: WorkplaneShape[] = [{ ...box(0, 1.5, 0, length, 17, PLATE), name: names.strip, color: "#4f7fa8" }];
  HINGE_TEST_FITS.forEach((fit, index) => {
    const c = centre(index);
    // Each axle's posts stand the fit clear of its own clip's ends.
    const postIn = CLIP_HALF + fit, postOut = postIn + POST_WIDTH;
    const postHeight = AXLE + r + 2.5 - PLATE;
    for (const side of [-1, 1]) {
      strip.push({ ...box(c + side * (postIn + postOut) / 2, 0, PLATE, POST_WIDTH, 8, postHeight), name: `${names.strip} post`, color: "#4f7fa8" });
    }
    strip.push({ ...axle(c, 0, AXLE, r, postOut * 2), name: `${names.strip} axle`, color: "#4f7fa8" });
    strip.push({ ...label(fitText(fit), c, 7), name: `${names.strip} ${fitText(fit)}` });
  });
  const parts: ReadyPart[] = [{ name: names.strip, shapes: strip, group: true }];
  // The clips, a row in front of the strip, each with the fit cut into its tab.
  HINGE_TEST_FITS.forEach((fit, index) => {
    const c = centre(index);
    const bore = r + fit;
    const z = 22;
    const top = AXLE + bore + 1.8;
    const name = `${names.clip} ${fitText(fit)}`;
    parts.push({
      name,
      group: true,
      shapes: [
        { ...box(c, z - 2, 0, 18, 14, PLATE), name, color: "#f08a24" },
        { ...box(c, z, PLATE, CLIP_HALF * 2, 8, top - PLATE), name, color: "#f08a24" },
        { ...axle(c, z, AXLE, bore, CLIP_HALF * 2 + 2), name: `${name} bore`, hole: true },
        { ...box(c, z, AXLE, CLIP_HALF * 2 + 2, 2 * r - SNAP, top - AXLE + 1), name: `${name} opening`, hole: true },
        { ...label(fitText(fit), c, z - 6.5), name: `${name} label` },
      ],
    });
  });
  return parts;
}

/**
 * Build 63: the ball condyle fit test - the models' ball joint, once for each fit. A strip of five
 * balls on their necks, and five cups, each with its two tongues, printed opening up as the upper's
 * hinge prints; turned over, each cup snaps down onto its ball.
 */
export function ballFitTestParts(names: { strip: string; clip: string }, joint: "ball" | "dropin" = "ball"): ReadyPart[] {
  const R = HINGE_BALL_RADIUS;
  const spacing = 2 * (R + 0.2 + TONGUE.thick) + 8;
  const count = HINGE_TEST_FITS.length;
  const length = spacing * count + 2;
  const centre = (index: number) => -length / 2 + 1 + spacing / 2 + index * spacing;
  const sphere = (x: number, z: number, centreY: number, radius: number) =>
    makeShapeFromAsset(asset("sphere"), { x, z, elevation: centreY - radius }, { width: radius * 2, depth: radius * 2, height: radius * 2, steps: 64 });
  // The strip: the ball's centre R + 4 over the plate (the plate stands where the models' pedestal
  // does), on a 5 mm neck.
  const ball = PLATE + R + 4;
  const strip: WorkplaneShape[] = [{ ...box(0, 1.5, 0, length, 17, PLATE), name: names.strip, color: "#4f7fa8" }];
  HINGE_TEST_FITS.forEach((fit, index) => {
    const c = centre(index);
    strip.push(
      { ...makeShapeFromAsset(asset("cylinder"), { x: c, z: 0, elevation: PLATE }, { width: 5, depth: 5, height: ball - PLATE }), name: `${names.strip} neck`, color: "#4f7fa8" },
      { ...sphere(c, 0, ball, R), name: `${names.strip} ball`, color: "#4f7fa8" },
      { ...label(fitText(fit), c, 7), name: `${names.strip} ${fitText(fit)}` },
    );
  });
  const parts: ReadyPart[] = [{ name: names.strip, shapes: strip, group: true }];
  HINGE_TEST_FITS.forEach((fit, index) => {
    const c = centre(index);
    const z = 26;
    const outer = R + fit + TONGUE.thick;
    // The cup's centre sits R + 3 over the plate: the block reaches up to it, the tongues past it.
    const cupY = PLATE + R + 3;
    const lip = Math.sqrt(Math.max(0, (R + fit) ** 2 - (R - BALL_SNAP) ** 2));
    const name = `${names.clip} ${fitText(fit)}`;
    const shapes: WorkplaneShape[] = [
      { ...box(c, z - 2, 0, outer * 2 + 4, 2 * (R + 3) + 6, PLATE), name, color: "#f08a24" },
      { ...box(c, z, PLATE, outer * 2, 2 * (R + 3), cupY - PLATE + (joint === "dropin" ? 3 : 0)), name, color: "#f08a24" },
    ];
    if (joint === "dropin") {
      // The drop-in cup: the block 3 mm past the cup's centre all round, the seat, and the channel
      // slanting out of it (up and back as it prints) that the ball comes in by.
      const tilt = (DROP_IN_CHANNEL * Math.PI) / 180, run = R + 8;
      const mid = { z: z + (Math.sin(tilt) * run) / 2, y: cupY + (Math.cos(tilt) * run) / 2 };
      const channel = makeShapeFromAsset(asset("cylinder"), { x: c, z: mid.z, elevation: mid.y - run / 2 }, { width: (R + fit) * 2, depth: (R + fit) * 2, height: run });
      shapes.push(
        { ...sphere(c, z, cupY, R + fit), name: `${name} cup`, hole: true },
        { ...channel, rotationX: DROP_IN_CHANNEL, name: `${name} channel`, hole: true },
        { ...box(c, z + (R + 3) / 2 + 0.5, cupY - 3.5, 6.2, R + 4, 7.5), name: `${name} neck room`, hole: true },
        { ...label(fitText(fit), c, z - (R + 3) - 1.5), name: `${name} label` },
      );
      parts.push({ name, group: true, shapes });
      return;
    }
    for (const side of [-1, 1]) {
      const xin = R + fit - 0.6;
      // The tongue, from the plate up past the cup's centre by the lip.
      shapes.push({ ...box(c + side * (xin + outer) / 2, z, PLATE, outer - xin, TONGUE.width, cupY + lip - PLATE), name, color: "#f08a24" });
      // Slits either side of it and between it and the cup.
      const sx0 = R + fit - 1.2, sx1 = outer + 0.5;
      for (const dz of [-1, 1]) shapes.push({ ...box(c + side * (sx0 + sx1) / 2, z + dz * (TONGUE.width + TONGUE.slit) / 2, PLATE, sx1 - sx0, TONGUE.slit, cupY + lip + 1 - PLATE), name: `${name} slit`, hole: true });
      shapes.push({ ...box(c + side * (R + fit - 0.9), z, PLATE, 0.6, TONGUE.width, cupY + lip + 1 - PLATE), name: `${name} slit`, hole: true });
    }
    shapes.push(
      { ...sphere(c, z, cupY, R + fit), name: `${name} cup`, hole: true },
      // Room for the neck to swing as it opens.
      { ...box(c, z + (R + 3) / 2 + 0.5, cupY - 3.5, 6.2, R + 4, 4.5), name: `${name} neck room`, hole: true },
      { ...label(fitText(fit), c, z - (R + 3) - 1.5), name: `${name} label` },
    );
    parts.push({ name, group: true, shapes });
  });
  return parts;
}

/** The hinge fit found with the test, if one was recorded. */
export function readMyHingeFit(): number | null {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return (HINGE_FITS as readonly number[]).includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveMyHingeFit(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Only for this visit then.
  }
}
