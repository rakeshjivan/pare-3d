/**
 * Fork (build 33): two tools that work on the selected parts as solids.
 *
 * Hull - one smooth body wrapped tight round all of them, like OpenSCAD's hull(): two cylinders
 * become a rounded slot, a few spheres an organic bracket.
 *
 * Fit check - where parts overlap (they would fuse or collide) and where they come closer than a
 * clearance (they would fuse when printed in place, or bind when they move), as Fusion's
 * Interference does. Each pair is tested once; parts whose boxes lie further apart than the
 * clearance are skipped without touching their geometry.
 */
import { getManifoldRuntime, meshAabb, meshForShape } from "@/lib/editorMeshCore";
import { disposeManifold, shapeToManifoldSolid } from "@/lib/editorBooleans";
import type { WorkplaneShape } from "@/types/layerling";

type ManifoldLike = { volume(): number; status(): string; isEmpty(): boolean; minGap(other: ManifoldLike, search: number): number; getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array }; delete(): void };

function manifoldPositions(solid: ManifoldLike): number[] {
  const mesh = solid.getMesh();
  const out = new Array<number>(mesh.triVerts.length * 3);
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const base = mesh.triVerts[i] * mesh.numProp;
    out[i * 3] = mesh.vertProperties[base];
    out[i * 3 + 1] = mesh.vertProperties[base + 1];
    out[i * 3 + 2] = mesh.vertProperties[base + 2];
  }
  return out;
}

/** The world positions of the convex hull round the parts' solids (holes are left out). Null for fewer than one solid. */
export async function hullPositions(shapes: readonly WorkplaneShape[]): Promise<number[] | null> {
  const solids = shapes.filter((shape) => !shape.hole);
  if (solids.length === 0) return null;
  const points: Array<[number, number, number]> = [];
  for (const shape of solids) {
    for (const vertex of meshForShape(shape).vertices) points.push([vertex[0], vertex[1], vertex[2]]);
  }
  if (points.length < 4) return null;
  const runtime = await getManifoldRuntime();
  const hull = runtime.Manifold.hull(points) as unknown as ManifoldLike;
  try {
    if (hull.status() !== "NoError" || hull.isEmpty() || hull.volume() <= 1e-9) return null;
    return manifoldPositions(hull);
  } finally {
    hull.delete();
  }
}

export type FitFinding = {
  a: string;
  b: string;
  /** "overlap": the parts share volume. "tight": they are closer than the clearance (gap in mm). */
  kind: "overlap" | "tight";
  overlap?: number;
  gap?: number;
  /** For an overlap: what the two share, as world positions, to show in red. */
  positions?: number[];
};

export type FitReport = { findings: FitFinding[]; pairs: number; parts: number; skipped: number };

/** Below this shared volume (mm³) two parts only touch, as faces laid against each other do. */
const TOUCH_VOLUME = 1e-3;

function boxesNear(a: WorkplaneShape, b: WorkplaneShape, reach: number) {
  const ab = meshAabb(a);
  const bb = meshAabb(b);
  return ab.minX - reach <= bb.maxX && bb.minX - reach <= ab.maxX
    && ab.minY - reach <= bb.maxY && bb.minY - reach <= ab.maxY
    && ab.minZ - reach <= bb.maxZ && bb.minZ - reach <= ab.maxZ;
}

/**
 * Overlaps and gaps under `clearance` (mm) between every pair of the solid parts. A part whose
 * mesh is not a closed solid is counted in `skipped` and left out.
 */
export async function checkFit(shapes: readonly WorkplaneShape[], clearance: number): Promise<FitReport> {
  const parts = shapes.filter((shape) => !shape.hole);
  const runtime = await getManifoldRuntime();
  const created: unknown[] = [];
  const solids = new Map<string, ManifoldLike | null>();
  const solidOf = (shape: WorkplaneShape) => {
    if (solids.has(shape.id)) return solids.get(shape.id) ?? null;
    let solid: ManifoldLike | null = null;
    try {
      const made = shapeToManifoldSolid(runtime, shape, created as never) as unknown as ManifoldLike;
      solid = made.status() === "NoError" && !made.isEmpty() ? made : null;
      created.push(made);
    } catch {
      solid = null;
    }
    solids.set(shape.id, solid);
    return solid;
  };
  const findings: FitFinding[] = [];
  let pairs = 0;
  try {
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const a = parts[i];
        const b = parts[j];
        if (!boxesNear(a, b, clearance)) continue;
        const sa = solidOf(a);
        const sb = solidOf(b);
        if (!sa || !sb) continue;
        pairs += 1;
        const shared = runtime.Manifold.intersection(sa as never, sb as never) as unknown as ManifoldLike;
        created.push(shared);
        const volume = shared.isEmpty() ? 0 : shared.volume();
        if (volume > TOUCH_VOLUME) {
          findings.push({ a: a.id, b: b.id, kind: "overlap", overlap: volume, positions: manifoldPositions(shared) });
          continue;
        }
        if (clearance <= 0) continue;
        const gap = sa.minGap(sb, clearance);
        if (gap < clearance - 1e-6) findings.push({ a: a.id, b: b.id, kind: "tight", gap: Math.max(0, gap) });
      }
    }
  } finally {
    new Set(created).forEach((item) => {
      try {
        disposeManifold(item);
      } catch {
        // already freed
      }
    });
  }
  const skipped = [...solids.values()].filter((solid) => solid === null).length;
  findings.sort((x, y) => (x.kind === y.kind ? (x.kind === "overlap" ? (y.overlap ?? 0) - (x.overlap ?? 0) : (x.gap ?? 0) - (y.gap ?? 0)) : x.kind === "overlap" ? -1 : 1));
  return { findings, pairs, parts: parts.length, skipped };
}
