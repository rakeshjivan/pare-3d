/**
 * Fork (build 29): the Blend piece as an exact CAD body, so fillets, chamfers, hollowing and STEP
 * treat it like any other solid (a mesh piece is thousands of triangles, past the edge tool's limit).
 *
 * Each section of the blend (blend.ts) is a closed outline of straight segments through its points,
 * and the kernel lofts one smooth surface through them, capped flat at both ends. Closed B-spline
 * sections were tried first: OCCT mis-measures and mis-classifies faces bounded by them, so the
 * piece would not fuse with the parts it joins. A sleeve (two hollow parts) is the outer loft with
 * the inner loft cut out; the inner one reaches a little further at both ends so the cut is clean.
 */
import type { OcctKernel, ShapeHandle } from "occt-wasm";

/** Sections, each a flat list x,y,z,x,y,z... with the same number of points. */
export type BlendLoftInput = {
  rings: number[][];
  innerRings?: number[][];
  /** The preview mesh's volume: an exact piece more than 3 % away from it is refused, and the mesh piece used. */
  expectedVolume?: number;
};

function ringWire(cad: OcctKernel, ring: number[], made: ShapeHandle[]): ShapeHandle {
  const count = ring.length / 3;
  const point = (index: number) => ({ x: ring[index * 3], y: ring[index * 3 + 1], z: ring[index * 3 + 2] });
  const edges = Array.from({ length: count }, (_, index) => cad.makeLineEdge(point(index), point((index + 1) % count)));
  made.push(...edges);
  const wire = cad.makeWire(edges);
  made.push(wire);
  return wire;
}

/**
 * The volume of a body measured on its surface, tessellated. The kernel's own getVolume is badly off
 * on B-spline surfaces (by up to a sixth here), so it cannot judge a loft.
 */
export function surfaceVolume(cad: OcctKernel, solid: ShapeHandle): number {
  const mesh = cad.tessellate(solid, { linearDeflection: 0.05, angularDeflection: 0.25 });
  const p = mesh.positions;
  const ix = mesh.indices;
  let volume = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return volume;
}

/** The one valid solid in a loft result, or null; whatever is not returned is put on `made` to be released. */
function oneSolid(cad: OcctKernel, shape: ShapeHandle, made: ShapeHandle[]): ShapeHandle | null {
  if (cad.isSolid(shape)) return cad.isValid(shape) && surfaceVolume(cad, shape) > 0 ? shape : (made.push(shape), null);
  made.push(shape);
  const solids = cad.getSubShapes(shape, "solid");
  if (solids.length !== 1) {
    made.push(...solids);
    return null;
  }
  const solid = cad.copy(solids[0]);
  made.push(solids[0]);
  return cad.isValid(solid) && surfaceVolume(cad, solid) > 0 ? solid : (made.push(solid), null);
}

/**
 * One smooth loft through the sections. (A ruled loft through straight-segment sections has
 * thousands of faces - too heavy for the kernel's memory; the preview check in blendLoftSolid guards
 * against a smooth surface swinging away from the sections where the piece turns.)
 */
function loftOf(cad: OcctKernel, rings: number[][], made: ShapeHandle[]): ShapeHandle {
  const wires = rings.map((ring) => ringWire(cad, ring, made));
  const solid = oneSolid(cad, cad.loft(wires, true, false), made);
  if (!solid) throw new Error("The blend loft did not become one solid");
  return solid;
}

/** The blend piece as one exact solid. Every handle made on the way is released; the caller releases the result. */
export function blendLoftSolid(cad: OcctKernel, input: BlendLoftInput): ShapeHandle {
  const made: ShapeHandle[] = [];
  let solid: ShapeHandle | null = null;
  try {
    solid = loftOf(cad, input.rings, made);
    if (input.innerRings && input.innerRings.length >= 2) {
      const inner = loftOf(cad, input.innerRings, made);
      made.push(inner);
      const cut = cad.cut(solid, inner);
      made.push(solid);
      solid = oneSolid(cad, cut, made);
      if (!solid) throw new Error("The hollow blend did not become one solid");
    }
    const volume = surfaceVolume(cad, solid);
    if (!cad.isValid(solid) || !(volume > 0)) throw new Error("The blend loft is not a valid solid");
    if (input.expectedVolume && input.expectedVolume > 0 && Math.abs(volume / input.expectedVolume - 1) > 0.03) {
      throw new Error("The exact blend differs from the preview");
    }
    const result = solid;
    solid = null;
    return result;
  } finally {
    if (solid) made.push(solid);
    for (const handle of made) {
      try {
        cad.release(handle);
      } catch {
        // Already gone with its parent.
      }
    }
  }
}
