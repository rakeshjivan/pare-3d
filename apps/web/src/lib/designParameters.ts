/**
 * Fork (build 37): named values for a design - wall = 2, width = 60 - that any number field can
 * use: "width", "wall * 2 + 0.4". Change a value once and every field that uses it follows, as
 * in OpenSCAD's customiser or Fusion's parameters. Values are in the design's own unit.
 */
import type { DesignParameter } from "@/types/layerling";

export type { DesignParameter };

export const MAX_DESIGN_PARAMETERS = 60;
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
/** Words a field already reads otherwise: units and the multiplication sign. */
const RESERVED = new Set(["x", "X", "mm", "cm", "in", "ft"]);

let values = new Map<string, number>();

/** The parameters the fields read from now: the open design's. */
export function setActiveParameters(parameters: readonly DesignParameter[] | undefined) {
  values = new Map((parameters ?? []).filter((parameter) => Number.isFinite(parameter.value)).map((parameter) => [parameter.name, parameter.value]));
}

/** A parameter's value, or undefined for a name the design does not have. */
export function parameterValue(name: string): number | undefined {
  return values.get(name);
}

/** Why a name cannot be used, or null when it can. */
export function parameterNameProblem(name: string, others: readonly DesignParameter[]): "empty" | "invalid" | "reserved" | "taken" | null {
  if (!name) return "empty";
  if (!NAME.test(name)) return "invalid";
  if (RESERVED.has(name)) return "reserved";
  if (others.some((parameter) => parameter.name === name)) return "taken";
  return null;
}

/** Whether a field's formula uses the parameter. */
export function formulaUsesParameter(formula: string, name: string) {
  return new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`).test(formula);
}

/** The formula with one parameter renamed. */
export function renameInFormula(formula: string, from: string, to: string) {
  return formula.replace(new RegExp(`(^|[^A-Za-z0-9_])${from}(?=[^A-Za-z0-9_]|$)`, "g"), `$1${to}`);
}

/** A design's parameters from saved settings: well-formed, unique, finite. */
export function normalizeDesignParameters(raw: unknown): DesignParameter[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: DesignParameter[] = [];
  for (const entry of raw.slice(0, MAX_DESIGN_PARAMETERS)) {
    if (!entry || typeof entry !== "object") continue;
    const { name, value, note } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !NAME.test(name) || RESERVED.has(name) || seen.has(name)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    seen.add(name);
    out.push({ name, value, ...(typeof note === "string" && note.trim() ? { note: note.trim().slice(0, 80) } : {}) });
  }
  return out.length ? out : undefined;
}
