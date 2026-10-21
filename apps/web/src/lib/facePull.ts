/**
 * Fork (build 23): push/pull by dragging a face. The face is pulled along its own normal: how far is
 * where the pointer's ray passes closest to the line through the grabbed point along that normal.
 * Positive is out of the body (add material), negative into it (a pocket).
 */
type Vec = { x: number; y: number; z: number };

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (a: Vec) => Math.sqrt(dot(a, a));
const unit = (a: Vec) => {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * The distance along `normal` from `origin` to where the ray comes closest. Null when the ray runs
 * (almost) along the normal - looking straight at the face - where that point is not defined; the
 * caller then uses the pointer's screen movement instead.
 */
export function pullDistanceAlongNormal(origin: Vec, normal: Vec, rayOrigin: Vec, rayDirection: Vec): number | null {
  const n = unit(normal);
  const d = unit(rayDirection);
  const b = dot(n, d);
  const denominator = 1 - b * b;
  if (denominator < 0.0025) return null; // within about 3 degrees of the normal
  const w = sub(origin, rayOrigin);
  return (b * dot(d, w) - dot(n, w)) / denominator;
}

/** Snapped to the grid step, or to 0.1 mm while Shift is held; never a negative zero. */
export function snapPullDistance(distance: number, step: number, free: boolean): number {
  const grid = free || !(step > 0) ? 0.1 : step;
  const snapped = Math.round(distance / grid) * grid;
  const tidy = Number(snapped.toFixed(4));
  return Object.is(tidy, -0) ? 0 : tidy;
}

/** Out or in, and how deep, from a signed pull. */
export function pullToFaceTool(distance: number, minimum: number): { direction: "out" | "in"; depth: number } {
  return { direction: distance < 0 ? "in" : "out", depth: Math.max(minimum, Math.abs(distance)) };
}

/** A number typed during the drag ("12", "1.5", "-3"), or null while it is not one yet. */
export function typedPull(text: string): number | null {
  if (!/^-?\d*(\.\d*)?$/.test(text) || !/\d/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
