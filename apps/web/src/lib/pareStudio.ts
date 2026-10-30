/*
 * Build 104: Pare 3D has two studios on one engine.
 *
 * CAD Studio is Pare 3D as it always was. Dental Studio holds the work made from intraoral scans
 * (Model Builder and, in test builds, Wax-up). Every design belongs to one of them; the Home page
 * shows both, and each studio's page shows only its own. A design can be sent from one studio to
 * the other at any time: the studio is a label on the design, never a copy of it.
 */
import type { WorkplaneShape } from "@/types/layerling";

export type PareStudio = "cad" | "dental";

export const PARE_STUDIOS: readonly PareStudio[] = ["cad", "dental"];

export function isPareStudio(value: unknown): value is PareStudio {
  return value === "cad" || value === "dental";
}

/** File names a scanner gives its arches (and the names Dental Studio gives what it makes). */
const SCAN_NAME = /(upper|lower|maxill|mandib|jaw|bite|occlus|intraoral|\bscan\b)/i;

/** Big enough to be a scan rather than a part someone modelled: about 20,000 triangles. */
const SCAN_MIN_POSITIONS = 9 * 20000;

/**
 * Whether a part belongs to dental work: a model, wax-up tooth or scan that Dental Studio has used,
 * a design it made, or an imported mesh that is plainly an intraoral scan (named like one, and dense).
 */
export function shapeIsDental(shape: WorkplaneShape): boolean {
  if (shape.dental || shape.dentalSource || shape.waxFor) return true;
  const mesh = shape.importedMesh;
  if (mesh && (mesh.positions?.length ?? 0) >= SCAN_MIN_POSITIONS && SCAN_NAME.test(shape.name ?? "")) return true;
  return Boolean(shape.groupedShapes?.some(shapeIsDental));
}

/** The studio a design's parts belong in: Dental when any part is dental work, CAD otherwise. */
export function studioOfShapes(shapes: readonly WorkplaneShape[]): PareStudio {
  return shapes.some(shapeIsDental) ? "dental" : "cad";
}

/**
 * The one place that decides whether Dental Studio may be opened. Today it always may. When Pare 3D
 * is served from its own website, this is where a sign-in check goes (on the server: a check in the
 * page alone can be bypassed).
 */
export function dentalStudioAvailable(): boolean {
  return true;
}

/** Whether Dental Studio has worked on any of the parts (a scan it used, a model or tooth it made). */
export function dentalWorkIn(shapes: readonly WorkplaneShape[]): boolean {
  const worked = (shape: WorkplaneShape): boolean => Boolean(shape.dental || shape.dentalSource || shape.waxFor || shape.groupedShapes?.some(worked));
  return shapes.some(worked);
}
