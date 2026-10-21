import type { ManifoldToplevel } from "manifold-3d";

/*
 * Fork: Voronoi patterns - an organic web of cells, for lighter panels, vents, lamp shades and
 * decoration. Seeds are scattered over the area (the same seed number gives the same pattern),
 * evened out a little (Lloyd's relaxation) so no cell is tiny, and each seed's cell is everything
 * closer to it than to any other seed. The cells, shrunk by half the strut width and rounded, are
 * the openings; what is left between them is the web.
 *
 * Two outputs: a panel (a plate with the cells cut out and a solid border), or the cut-out pattern
 * alone, as a hole to set down on any part and group with it.
 */

export type VoronoiOptions = {
  width: number;
  depth: number;
  thickness: number;
  /** About how many cells. */
  cells: number;
  /** The web between openings: thinner than about two nozzle widths (0.8 mm) won't print well. */
  strut: number;
  /** A solid frame round the panel. */
  border: number;
  /** Rounding of the openings' corners. */
  rounding: number;
  /** How even the cells are: 0 random, more steps more even. */
  evenness: number;
  seed: number;
  mode: "panel" | "pattern";
};

export const DEFAULT_VORONOI: VoronoiOptions = { width: 80, depth: 60, thickness: 2, cells: 40, strut: 1.6, border: 4, rounding: 1.5, evenness: 2, seed: 1, mode: "panel" };

export function normalizeVoronoi(raw: Partial<VoronoiOptions>): VoronoiOptions {
  const o = { ...DEFAULT_VORONOI, ...raw };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  return {
    width: clamp(o.width, 10, 400, DEFAULT_VORONOI.width),
    depth: clamp(o.depth, 10, 400, DEFAULT_VORONOI.depth),
    thickness: clamp(o.thickness, 0.4, 50, DEFAULT_VORONOI.thickness),
    cells: Math.round(clamp(o.cells, 3, 400, DEFAULT_VORONOI.cells)),
    strut: clamp(o.strut, 0.4, 20, DEFAULT_VORONOI.strut),
    border: clamp(o.border, 0, 50, DEFAULT_VORONOI.border),
    rounding: clamp(o.rounding, 0, 20, DEFAULT_VORONOI.rounding),
    evenness: Math.round(clamp(o.evenness, 0, 8, DEFAULT_VORONOI.evenness)),
    seed: Math.round(clamp(o.seed, 1, 99999, 1)),
    mode: o.mode === "pattern" ? "pattern" : "panel",
  };
}

type Point = [number, number];

/** A small repeatable random generator (mulberry32): the same seed, the same pattern. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The part of a convex polygon on the side of the line through `point` facing away from `normal`. */
function clip(polygon: Point[], point: Point, normal: Point): Point[] {
  const out: Point[] = [];
  const side = (p: Point) => (p[0] - point[0]) * normal[0] + (p[1] - point[1]) * normal[1];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Every seed's cell, clipped to the rectangle centred on 0 (x across, y back). */
export function voronoiCells(seeds: readonly Point[], width: number, depth: number): Point[][] {
  const box: Point[] = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
  return seeds.map((seed, index) => {
    let cell = box;
    for (let other = 0; other < seeds.length && cell.length; other += 1) {
      if (other === index) continue;
      const o = seeds[other];
      const middle: Point = [(seed[0] + o[0]) / 2, (seed[1] + o[1]) / 2];
      cell = clip(cell, middle, [o[0] - seed[0], o[1] - seed[1]]);
    }
    return cell;
  });
}

function centroid(polygon: readonly Point[]): Point | null {
  let area = 0, cx = 0, cy = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const [x0, y0] = polygon[index];
    const [x1, y1] = polygon[(index + 1) % polygon.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return Math.abs(area) < 1e-12 ? null : [cx / (3 * area), cy / (3 * area)];
}

/** Seeds scattered over the area, then moved to their cells' middles a few times to even them out. */
export function voronoiSeeds(o: Pick<VoronoiOptions, "width" | "depth" | "cells" | "evenness" | "seed">): Point[] {
  const next = random(o.seed);
  let seeds: Point[] = Array.from({ length: o.cells }, () => [(next() - 0.5) * o.width, (next() - 0.5) * o.depth]);
  for (let step = 0; step < o.evenness; step += 1) {
    seeds = voronoiCells(seeds, o.width, o.depth).map((cell, index) => centroid(cell) ?? seeds[index]);
  }
  return seeds;
}

/**
 * The panel (or the pattern of openings) as triangle positions, standing on y = 0 and centred,
 * x across and z towards the front - the scene's frame.
 */
export function voronoiPositions(runtime: ManifoldToplevel, raw: Partial<VoronoiOptions>): { positions: number[]; openings: number } {
  const o = normalizeVoronoi(raw);
  const created: { delete(): void }[] = [];
  try {
    const cells = voronoiCells(voronoiSeeds(o), o.width, o.depth);
    const innerWidth = Math.max(0.1, o.width - 2 * o.border);
    const innerDepth = Math.max(0.1, o.depth - 2 * o.border);
    const inner = runtime.CrossSection.square([innerWidth, innerDepth], true);
    created.push(inner);
    const openings: InstanceType<ManifoldToplevel["CrossSection"]>[] = [];
    cells.forEach((cell) => {
      if (cell.length < 3) return;
      const polygon = runtime.CrossSection.ofPolygons([cell]);
      created.push(polygon);
      // Shrunk by half the web on each side, then (if rounding) shrunk further and grown back round.
      const round = Math.max(0, o.rounding);
      const shrunk = polygon.offset(-(o.strut / 2 + round), "Miter", 4);
      created.push(shrunk);
      const opening = round > 0 ? shrunk.offset(round, "Round", 2, 24) : shrunk;
      if (opening !== shrunk) created.push(opening);
      const kept = opening.intersect(inner);
      created.push(kept);
      if (!kept.isEmpty() && kept.area() > 0.05) openings.push(kept);
    });
    if (!openings.length) return { positions: [], openings: 0 };
    const holes = runtime.CrossSection.union(openings);
    created.push(holes);
    let outline = holes;
    if (o.mode === "panel") {
      const plate = runtime.CrossSection.square([o.width, o.depth], true);
      created.push(plate);
      outline = plate.subtract(holes);
      created.push(outline);
    }
    // The pattern alone reaches a little past both faces of whatever it is set into.
    const height = o.mode === "panel" ? o.thickness : o.thickness + 1;
    const solid = runtime.Manifold.extrude(outline, height);
    created.push(solid);
    // Extruded along z with y to the back: turn it so it stands on y = 0 with y up (a proper turn).
    const turned = solid.rotate([-90, 0, 0]);
    created.push(turned);
    const mesh = turned.getMesh();
    const positions: number[] = [];
    for (let index = 0; index < mesh.triVerts.length; index += 1) {
      const vertex = mesh.triVerts[index] * mesh.numProp;
      positions.push(mesh.vertProperties[vertex], mesh.vertProperties[vertex + 1], mesh.vertProperties[vertex + 2]);
    }
    (mesh as { delete?: () => void }).delete?.();
    return { positions, openings: openings.length };
  } finally {
    created.forEach((entry) => entry.delete());
  }
}
