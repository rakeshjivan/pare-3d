"use client";

import { t } from "@/lib/i18n";
import { resizedShapeSize, shapeDepth, shapeHasTaper, shapeWidth } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * Fork: Print fit for holes. Printed holes come out a little small, so a peg, lid or bolt that
 * matches the drawing jams. One click makes the hole that much bigger - evenly on every side, so
 * its centre stays - with the usual clearances for a home printer. Switching between fits
 * replaces the earlier clearance instead of adding to it (remembered while the design is open).
 */
export const PRINT_FITS = [
  { id: "exact", clearance: 0, label: "printFit.exact", hint: "printFit.exactHint" },
  { id: "press", clearance: 0.1, label: "printFit.press", hint: "printFit.pressHint" },
  { id: "snug", clearance: 0.2, label: "printFit.snug", hint: "printFit.snugHint" },
  { id: "loose", clearance: 0.4, label: "printFit.loose", hint: "printFit.looseHint" },
] as const;

/**
 * For each hole, the sizes it has had through Print fit and the clearance each one carries. The
 * clearance in force is looked up from the hole's current size, so Undo, Redo and a resize by hand
 * all stay right: a size Print fit never made counts as the size as drawn.
 */
const fitHistory = new Map<string, Map<string, number>>();
const sizeKey = (width: number, depth: number) => `${width.toFixed(4)}x${depth.toFixed(4)}`;

function currentClearance(shape: WorkplaneShape) {
  return fitHistory.get(shape.id)?.get(sizeKey(shapeWidth(shape), shapeDepth(shape)));
}

/** Holes this works on: a single body whose width and depth are its own size. */
export function printFitSupported(shape: WorkplaneShape) {
  return Boolean(shape.hole) && !shape.groupedShapes?.length && !shapeHasTaper(shape);
}

export function printFitPatch(shape: WorkplaneShape, clearance: number): Partial<WorkplaneShape> {
  const previous = currentClearance(shape) ?? 0;
  const width = Math.max(0.1, shapeWidth(shape) - previous + clearance);
  const depth = Math.max(0.1, shapeDepth(shape) - previous + clearance);
  const patch: Partial<WorkplaneShape> = { width, depth, size: resizedShapeSize(width, depth) };
  if (typeof shape.baseRadius === "number") patch.baseRadius = Math.max(0.05, shape.baseRadius + (clearance - previous) / 2);
  return patch;
}

/** The patch for a fit, remembered so the next choice replaces this clearance instead of adding to it. */
export function applyPrintFit(shape: WorkplaneShape, clearance: number) {
  const previous = currentClearance(shape) ?? 0;
  const patch = printFitPatch(shape, clearance);
  const history = fitHistory.get(shape.id) ?? new Map<string, number>();
  history.set(sizeKey(shapeWidth(shape), shapeDepth(shape)), previous);
  history.set(sizeKey(patch.width ?? 0, patch.depth ?? 0), clearance);
  fitHistory.set(shape.id, history);
  return patch;
}

/** The clearance this hole has now, or undefined when its size is not one Print fit made. */
export function appliedPrintFit(shape: WorkplaneShape) {
  return currentClearance(shape);
}

export function PrintFitCard({
  shape,
  locked,
  onUpdate,
}: {
  shape: WorkplaneShape;
  locked: boolean;
  onUpdate: (patch: Partial<WorkplaneShape>) => void;
}) {
  if (!shape.hole) return null;
  if (!printFitSupported(shape)) {
    return <p className="print-fit-note">{t("printFit.unsupported")}</p>;
  }
  const current = currentClearance(shape);
  const choose = (clearance: number) => onUpdate(applyPrintFit(shape, clearance));
  return (
    <div className="print-fit-card" role="group" aria-label={t("printFit.title")}>
      <div className="print-fit-heading">
        <strong>{t("printFit.title")}</strong>
        <span>{t("printFit.intro")}</span>
      </div>
      <div className="print-fit-options">
        {PRINT_FITS.map((fit) => (
          <button
            key={fit.id}
            type="button"
            disabled={locked}
            className={current === fit.clearance ? "active" : ""}
            aria-pressed={current === fit.clearance}
            title={t(fit.hint)}
            onClick={() => choose(fit.clearance)}
          >
            <span>{t(fit.label)}</span>
            <small>{fit.clearance ? `+${fit.clearance.toFixed(1)} mm` : t("printFit.asDrawn")}</small>
          </button>
        ))}
      </div>
      {current ? <p className="print-fit-status">{t("printFit.applied", { mm: current.toFixed(1) })}</p> : null}
    </div>
  );
}
