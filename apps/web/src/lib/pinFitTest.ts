import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import { regularPolygonAspect } from "@/lib/regularPolygonFootprint";
import { PIN, PIN_FIT } from "@/lib/dentalArticulator";
import type { ReadyPart } from "@/lib/readyParts";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Build 78: the incisal pin fit test - the Dental Studio articulator's pin socket, once for each fit.
 * A block carries four keyed sockets, each `fit` larger all round than the pin; four pins, the same
 * as the models' pin 0, stand beside it. The socket the pin drops into to its shoulder and stands in
 * upright, without wobbling, is the fit to choose; Pare 3D remembers it and makes the models' socket
 * with it. (The articulator's seats need no fit: they touch by design.)
 *
 * Everything prints as it lies: the block socket-up, the pins standing on their shanks.
 */

const STORAGE_KEY = "pare3d.myPinFit";
/** The fits the test prints, mm a side. */
export const PIN_FITS = [0.05, 0.1, 0.15, 0.2] as const;
const SPACING = 14;
const FLOOR = 1.5;

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

const box = (x: number, z: number, elevation: number, width: number, depth: number, height: number) =>
  makeShapeFromAsset(asset("box"), { x, z, elevation }, { width, depth, height });

/** A hexagonal prism `flats` across its flats, standing up. */
function hexagon(x: number, z: number, elevation: number, flats: number, height: number): WorkplaneShape {
  const aspect = regularPolygonAspect(6);
  const scale = flats / Math.min(aspect.width, aspect.depth);
  return makeShapeFromAsset(asset("polygon"), { x, z, elevation }, { width: aspect.width * scale, depth: aspect.depth * scale, height, sides: 6 });
}

const cylinder = (x: number, z: number, elevation: number, radius: number, height: number) =>
  makeShapeFromAsset(asset("cylinder"), { x, z, elevation }, { width: radius * 2, depth: radius * 2, height });

function label(text: string, x: number, z: number, top: number) {
  const shape = makeShapeFromAsset(asset("text"), { x, z, elevation: top - 0.6 }, { text, width: 10, depth: 3.2, height: 1.6 });
  return { ...shape, text, hole: true };
}

export function pinFitTestParts(names: { block: string; pin: string }): ReadyPart[] {
  const count = PIN_FITS.length;
  const length = SPACING * count + 2;
  const centre = (index: number) => -length / 2 + 1 + SPACING / 2 + index * SPACING;
  const height = FLOOR + PIN.socketDepth;
  const block: WorkplaneShape[] = [{ ...box(0, 2, 0, length, 18, height), name: names.block, color: "#4f7fa8" }];
  PIN_FITS.forEach((fit, index) => {
    const c = centre(index);
    const keyDepth = PIN.key + fit;
    block.push(
      { ...hexagon(c, 0, FLOOR, PIN.flats + 2 * fit, PIN.socketDepth + 1), name: `${names.block} ${fit}`, hole: true },
      // The keyway, in front of the socket: the pin goes in one way only.
      { ...box(c, -(PIN.flats / 2 + keyDepth / 2 - 0.25), FLOOR, PIN.key + 2 * fit, keyDepth + 0.5, PIN.socketDepth + 1), name: `${names.block} ${fit} key`, hole: true },
      { ...label(String(fit), c, 7, height), name: `${names.block} ${fit} label` },
    );
  });
  const parts: ReadyPart[] = [{ name: names.block, shapes: block, group: true }];
  // The pins: shank, key, shoulder and rounded tip, as the models' pin 0 is.
  PIN_FITS.forEach((_, index) => {
    const c = centre(index), z = 22;
    const shoulder = PIN.shank + PIN.shoulder;
    parts.push({
      name: names.pin,
      group: true,
      shapes: [
        { ...hexagon(c, z, 0, PIN.flats, PIN.shank), name: names.pin, color: "#8b6fc9" },
        { ...box(c, z - (PIN.flats / 2 + PIN.key / 2 - 0.15), 0, PIN.key, PIN.key + 0.3, PIN.shank), name: names.pin, color: "#8b6fc9" },
        { ...cylinder(c, z, PIN.shank, PIN.shoulderRadius, PIN.shoulder), name: names.pin, color: "#8b6fc9" },
        { ...cylinder(c, z, shoulder, PIN.tip, 2.75), name: names.pin, color: "#8b6fc9" },
        { ...makeShapeFromAsset(asset("sphere"), { x: c, z, elevation: shoulder + 2.75 - PIN.tip }, { width: PIN.tip * 2, depth: PIN.tip * 2, height: PIN.tip * 2, steps: 32 }), name: names.pin, color: "#8b6fc9" },
      ],
    });
  });
  return parts;
}

/** The pin fit found with the test, if one was recorded; otherwise PIN_FIT. */
export function readMyPinFit(): number | null {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return (PIN_FITS as readonly number[]).includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveMyPinFit(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Only for this visit then.
  }
}

export { PIN_FIT };
