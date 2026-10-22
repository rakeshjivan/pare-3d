/**
 * Fork (build 29): the Blend piece as an exact CAD body, so fillets, chamfers, hollowing and STEP
 * treat it like any other solid (a mesh piece is thousands of triangles, past the edge tool's limit).
 *
 * Each section of the blend (blend.ts) becomes one smooth closed curve - a periodic cubic B-spline
 * through-the-poles of its points - and the kernel lofts a smooth surface through them, capped flat
 * at both ends. A sleeve (two hollow parts) is the outer loft with the inner loft cut out; the inner
 * one reaches a little further at both ends so the cut leaves clean openings.
 */
import type { OcctKernel, ShapeHandle } from "occt-wasm";

/** Sections, each a flat list x,y,z,x,y,z... with the same number of points. */
export type BlendLoftInput = { rings: number[][]; innerRings?: number[][] };

function ringWire(cad: OcctKernel, ring: number[]): ShapeHandle {
  const count = ring.length / 3;
  const knots = Array.from({ length: count + 1 }, (_, index) => index);
  const edge = cad.makeBSplineEdge(ring, Array(count).fill(1), knots, knots.map(() => 1), 3, true);
  return cad.makeWire([edge]);
}

function loftOf(cad: OcctKernel, rings: number[][]): ShapeHandle {
  const lofted = cad.loft(rings.map((ring) => ringWire(cad, ring)), true, false);
  const solids = cad.isSolid(lofted) ? [lofted] : cad.getSubShapes(lofted, "solid");
  if (solids.length !== 1) throw new Error("The blend loft did not become one solid");
  return solids[0];
}

export function blendLoftSolid(cad: OcctKernel, input: BlendLoftInput): ShapeHandle {
  let solid = loftOf(cad, input.rings);
  if (input.innerRings && input.innerRings.length >= 2) {
    const inner = loftOf(cad, input.innerRings);
    const cut = cad.cut(solid, inner);
    const solids = cad.isSolid(cut) ? [cut] : cad.getSubShapes(cut, "solid");
    if (solids.length !== 1) throw new Error("The hollow blend did not become one solid");
    solid = solids[0];
  }
  if (!cad.isValid(solid) || !(cad.getVolume(solid) > 0)) throw new Error("The blend loft is not a valid solid");
  return solid;
}
