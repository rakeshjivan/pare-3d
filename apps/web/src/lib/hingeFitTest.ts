import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import { HINGE_AXLE_RADIUS, HINGE_FITS } from "@/lib/dentalBase";
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
const CLIP_HALF = 4.8;
const END_PLAY = 0.2;
const POST_WIDTH = 4.5;
const SNAP = 0.8;
const SPACING = 22;

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
  const shape = makeShapeFromAsset(asset("text"), { x, z, elevation: PLATE - 0.6 }, { text, width: 9, depth: 3.5, height: 1.6 });
  return { ...shape, text, hole: true };
}

const fitText = (fit: number) => fit.toFixed(2).replace(/0$/, "");

export function hingeFitTestParts(names: { strip: string; clip: string }): ReadyPart[] {
  const r = HINGE_AXLE_RADIUS;
  const postIn = CLIP_HALF + END_PLAY, postOut = postIn + POST_WIDTH;
  const count = HINGE_FITS.length;
  const length = SPACING * count + 2;
  const centre = (index: number) => -length / 2 + 1 + SPACING / 2 + index * SPACING;
  // The strip: posts 8 mm deep either side of each clip's place, the axle across them.
  const strip: WorkplaneShape[] = [{ ...box(0, 1.5, 0, length, 17, PLATE), name: names.strip, color: "#4f7fa8" }];
  HINGE_FITS.forEach((fit, index) => {
    const c = centre(index);
    const postHeight = AXLE + r + 2.5 - PLATE;
    for (const side of [-1, 1]) {
      strip.push({ ...box(c + side * (postIn + postOut) / 2, 0, PLATE, POST_WIDTH, 8, postHeight), name: `${names.strip} post`, color: "#4f7fa8" });
    }
    strip.push({ ...axle(c, 0, AXLE, r, postOut * 2), name: `${names.strip} axle`, color: "#4f7fa8" });
    strip.push({ ...label(fitText(fit), c, 7), name: `${names.strip} ${fitText(fit)}` });
  });
  const parts: ReadyPart[] = [{ name: names.strip, shapes: strip, group: true }];
  // The clips, a row in front of the strip, each with the fit cut into its tab.
  HINGE_FITS.forEach((fit, index) => {
    const c = centre(index);
    const bore = r + fit;
    const z = 22;
    const top = AXLE + bore + 1.8;
    const name = `${names.clip} ${fitText(fit)}`;
    parts.push({
      name,
      group: true,
      shapes: [
        { ...box(c, z - 2, 0, 14, 14, PLATE), name, color: "#f08a24" },
        { ...box(c, z, PLATE, CLIP_HALF * 2, 8, top - PLATE), name, color: "#f08a24" },
        { ...axle(c, z, AXLE, bore, CLIP_HALF * 2 + 2), name: `${name} bore`, hole: true },
        { ...box(c, z, AXLE, CLIP_HALF * 2 + 2, 2 * r - SNAP, top - AXLE + 1), name: `${name} opening`, hole: true },
        { ...label(fitText(fit), c, z - 6.5), name: `${name} label` },
      ],
    });
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
