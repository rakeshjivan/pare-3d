import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import type { ReadyPart } from "@/lib/readyParts";

/*
 * Fork (build 21): a fit test - a strip with five holes, each a little bigger than the peg, and
 * the peg to try in them. Printed once, it shows how much clearance this printer needs; that
 * number then becomes "My printer" in Print fit.
 */

export const FIT_TEST_CLEARANCES = [0.1, 0.2, 0.3, 0.4, 0.5] as const;
export const FIT_TEST_PEG = 6;
const STORAGE_KEY = "pare3d.myPrintFit";

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

export function fitTestParts(names: { strip: string; peg: string }): ReadyPart[] {
  const spacing = 12;
  const count = FIT_TEST_CLEARANCES.length;
  const length = spacing * count + 4;
  const plate = makeShapeFromAsset(asset("roundedBox"), { x: 0, z: 0, elevation: 0 }, { width: length, depth: 20, height: 4, cornerFillet: 2, topBottomFillet: 0 });
  const shapes = [{ ...plate, name: names.strip, color: "#4f7fa8" }];
  FIT_TEST_CLEARANCES.forEach((clearance, index) => {
    const x = -length / 2 + 2 + spacing / 2 + index * spacing;
    const diameter = FIT_TEST_PEG + clearance;
    const hole = makeShapeFromAsset(asset("cylinder"), { x, z: -3, elevation: -1 }, { width: diameter, depth: diameter, height: 6 });
    shapes.push({ ...hole, name: `${names.strip} +${clearance}`, hole: true });
    // The clearance cut into the top in front of its hole, 0.6 mm deep.
    const label = makeShapeFromAsset(asset("text"), { x, z: 5.5, elevation: 3.4 }, { text: String(clearance), width: 8, depth: 4, height: 1.6 });
    shapes.push({ ...label, text: String(clearance), name: `${names.strip} label ${clearance}`, hole: true });
  });
  const base = makeShapeFromAsset(asset("roundedBox"), { x: 0, z: 22, elevation: 0 }, { width: 14, depth: 14, height: 2, cornerFillet: 2, topBottomFillet: 0 });
  const peg = makeShapeFromAsset(asset("cylinder"), { x: 0, z: 22, elevation: 2 }, { width: FIT_TEST_PEG, depth: FIT_TEST_PEG, height: 10 });
  return [
    { name: names.strip, shapes, group: true },
    { name: names.peg, shapes: [{ ...base, name: names.peg, color: "#f08a24" }, { ...peg, name: names.peg, color: "#f08a24" }], group: true },
  ];
}

/** The clearance found with the fit test, if one was recorded. */
export function readMyPrintFit(): number | null {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 && value < 2 ? value : null;
  } catch {
    return null;
  }
}

export function saveMyPrintFit(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Only for this visit then.
  }
}
