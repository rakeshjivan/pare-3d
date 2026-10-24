import * as THREE from "three";
import { createLocalId } from "@/lib/localIds";
import type { ReadyPart } from "@/lib/readyParts";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork (build 54, reworked in build 56): the two pieces that turn a shape into a clicker - a
 * keyboard switch (Cherry MX style: 15 mm housing, 4 mm travel) between two halves of a model.
 *
 * - Clicker base: a hole, cut into the base's flat face from that face down, 15.3 mm deep. At the
 *   top a 15.8 mm square takes the switch's top housing (6.6 mm), so the top of the switch is
 *   level with the face; below that the 14.0 x 14.3 mm opening stands in for a keyboard plate, with
 *   the notches the clips snap into, and room under it for the bottom housing and the pins.
 * - Clicker top: a solid post, added to the top half's flat face, 5.6 mm across, with a cross hole
 *   (4.34 mm, 1.45 mm arms, 3.8 mm deep from the post's end) that pushes onto the switch's stem.
 *   The post is as long as the gap left between the halves: 2.5 mm by default, which a clicky
 *   (blue) switch needs to click (it clicks at about 2.2 mm), up to 4.5 mm for its full 4 mm of
 *   travel. A short post leaves the cross hole reaching on into the top half: the hole is a piece
 *   of its own, set and joined with the post.
 *
 * Both keep their size (WorkplaneShape.fixedSize): they fit standard switches. Build 54's version
 * held only the part of the switch under the plate, so the top housing stood out of the base.
 *
 * Positions: Y up, centred on x = z = 0, standing on y = 0. The base's face is at y = height.
 */

/** How deep the base pocket goes, mm. */
export const CLICKER_BASE_HEIGHT = 15.3;
/** The gap left between the halves (the top's post length), mm: the choices, and the default. */
export const CLICKER_GAPS = [2.5, 3, 3.5, 4, 4.5] as const;
export const CLICKER_DEFAULT_GAP = 2.5;
/** How deep the cross hole takes the stem, from the post's end, mm. */
export const CLICKER_SOCKET_DEPTH = 3.8;
const POST_DIAMETER = 5.6;
const CROSS_LENGTH = 4.34;
const CROSS_ARM = 1.45;

const CLICKER_BASE_POSITIONS: readonly number[] = [-7,0,7.15,-2,5.45,7.15,-7,7.45,7.15,-7,0,7.15,-7,7.45,7.15,-7,0,-7.15,-7,0,7.15,2,5.45,7.15,-2,5.45,7.15,-2,7.45,7.15,-7,7.45,7.15,-2,5.45,7.15,-7,0,7.15,-7,0,-7.15,7,0,7.15,7,8.6236,7.15,-7,7.45,7.15,-2,7.45,7.15,-7,0,-7.15,-7,7.45,7.15,-7,7.45,-7.15,-7,0,-7.15,-7,7.45,-7.15,-2,5.45,-7.15,-7,0,-7.15,-2,5.45,-7.15,7,0,-7.15,-2,5.45,-7.15,-7,7.45,-7.15,-2,7.45,-7.15,-2,7.45,-7.15,-7,7.45,-7.15,7,8.6245,-7.15,-7,0,7.15,7,0,7.15,2,5.45,7.15,2,5.45,7.15,7,7.45,7.15,2,7.45,7.15,7,0,7.15,7,7.45,7.15,2,5.45,7.15,7,0,7.15,7,7.45,-7.15,7,7.45,7.15,7,8.6236,7.15,-2,7.45,7.15,2,7.45,7.15,7,7.45,7.15,7,8.6236,7.15,2,7.45,7.15,-7,0,-7.15,7,0,-7.15,7,0,7.15,7,0,-7.15,-2,5.45,-7.15,2,5.45,-7.15,2,7.45,-7.15,7,8.6245,-7.15,2,5.45,-7.15,7,0,7.15,7,0,-7.15,7,7.45,-7.15,7,0,-7.15,2,5.45,-7.15,7,7.45,-7.15,7,8.6245,-7.15,7,7.45,-7.15,2,5.45,-7.15,-2,7.45,-7.15,7,8.6245,-7.15,2,7.45,-7.15,-2,5.45,7.95,-2,7.45,7.15,-2,5.45,7.15,-2,5.45,7.95,-2,7.45,7.95,-2,7.45,7.15,-2,5.45,7.95,-2,5.45,7.15,2,5.45,7.15,-2,5.45,7.95,2,5.45,7.95,-2,7.45,7.95,-2,7.45,7.95,2,7.45,7.95,-2,7.45,7.15,-2,5.45,-7.95,-2,5.45,-7.15,-2,7.45,-7.15,-2,5.45,-7.95,-2,7.45,-7.15,-2,7.45,-7.95,-2,5.45,-7.95,2,5.45,-7.95,-2,5.45,-7.15,-2,7.45,-7.95,-2,7.45,-7.15,2,7.45,-7.15,-2,5.45,-7.95,-2,7.45,-7.95,2,7.45,-7.95,-2,5.45,7.95,2,5.45,7.15,2,5.45,7.95,-2,7.45,7.95,2,5.45,7.95,2,7.45,7.95,2,7.45,7.95,2,7.45,7.15,-2,7.45,7.15,2,5.45,7.95,2,5.45,7.15,2,7.45,7.15,2,5.45,7.95,2,7.45,7.15,2,7.45,7.95,2,5.45,-7.95,2,5.45,-7.15,-2,5.45,-7.15,-2,5.45,-7.95,2,7.45,-7.95,2,5.45,-7.95,-2,7.45,-7.95,2,7.45,-7.15,2,7.45,-7.95,2,5.45,-7.95,2,7.45,-7.15,2,5.45,-7.15,2,5.45,-7.95,2,7.45,-7.95,2,7.45,-7.15,-7.9,8.699,7.15,-7,7.45,7.15,-7.9,8.7,7.15,-7.9,8.699,7.15,-7.9,8.699,-7.15,-7,7.45,7.15,-7.9,8.699,7.15,-7.9,8.7,7.15,-7.9,8.699,-7.15,-7.9,8.7,7.15,-7,7.45,7.15,7,8.6236,7.15,-7.9,8.699,-7.15,-7,7.45,-7.15,-7,7.45,7.15,-7.9,8.7,7.15,-7.9,8.7,-7.15,-7.9,8.699,-7.15,-7.9,8.699,-7.15,-7.9,8.7,-7.15,-7,7.45,-7.15,-7.9,8.7,-7.15,7,8.6245,-7.15,-7,7.45,-7.15,-7.9,8.7,7.15,7,8.6236,7.15,7.9,8.699,7.15,-7.9,8.7,7.15,7.9,8.699,7.15,7.9,8.7,7.15,7.9,8.699,7.15,7,8.6236,7.15,7,7.45,7.15,7.9,8.699,7.15,7,7.45,7.15,7,7.45,-7.15,7.9,8.699,7.15,7.9,8.7,-7.15,7.9,8.7,7.15,-7.9,8.7,-7.15,7.9,8.7,-7.15,7,8.6245,-7.15,7.9,8.699,7.15,7,7.45,-7.15,7.9,8.699,-7.15,7.9,8.699,7.15,7.9,8.699,-7.15,7.9,8.7,-7.15,7.9,8.7,-7.15,7,7.45,-7.15,7,8.6245,-7.15,7.9,8.699,-7.15,7,7.45,-7.15,7.9,8.7,-7.15,-7.9,8.7,7.9,-7.9,15.3,-7.9,-7.9,8.7,7.15,-7.9,8.7,7.9,-7.9,15.3,7.9,-7.9,15.3,-7.9,-7.9,8.7,7.9,-7.9,8.7,7.15,7.9,8.7,7.15,-7.9,8.7,7.9,7.9,8.7,7.9,-7.9,15.3,7.9,-7.9,15.3,7.9,7.9,15.3,7.9,-7.9,15.3,-7.9,-7.9,8.7,7.15,-7.9,15.3,-7.9,-7.9,8.7,-7.15,-7.9,8.7,-7.15,-7.9,15.3,-7.9,-7.9,8.7,-7.9,-7.9,8.7,-7.15,-7.9,8.7,-7.9,7.9,8.7,-7.9,-7.9,8.7,-7.9,-7.9,15.3,-7.9,7.9,15.3,-7.9,-7.9,8.7,7.9,7.9,8.7,7.15,7.9,8.7,7.9,-7.9,15.3,7.9,7.9,8.7,7.9,7.9,15.3,7.9,7.9,8.7,7.9,7.9,8.7,7.15,7.9,15.3,7.9,7.9,8.7,7.15,7.9,8.7,-7.15,7.9,15.3,7.9,-7.9,15.3,-7.9,7.9,15.3,7.9,7.9,15.3,-7.9,-7.9,8.7,-7.15,7.9,8.7,-7.9,7.9,8.7,-7.15,-7.9,8.7,-7.9,7.9,15.3,-7.9,7.9,8.7,-7.9,7.9,15.3,7.9,7.9,8.7,-7.15,7.9,8.7,-7.9,7.9,15.3,7.9,7.9,8.7,-7.9,7.9,15.3,-7.9];


function cutterShape(name: string, positions: readonly number[], width: number, depth: number, height: number, hole: boolean): WorkplaneShape {
  return {
    id: createLocalId("clicker"),
    name,
    kind: "mesh",
    color: "#9aa3ad",
    x: 0,
    z: 0,
    elevation: 0,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: { positions: [...positions], baseWidth: width, baseDepth: depth, baseHeight: height, triangleCount: positions.length / 9, sourceFormat: "json" },
    hole,
    fixedSize: true,
    locked: false,
    hidden: false,
  };
}

/** The pocket for the whole switch, cut into the flat face of the clicker's base (a hole). */
export function clickerBasePart(name: string): ReadyPart {
  return { name, shapes: [cutterShape(name, CLICKER_BASE_POSITIONS, 15.8, 15.9, CLICKER_BASE_HEIGHT, true)], group: false };
}

/** A closed prism standing on y = 0, `height` tall, from an outline seen from above (x, z, counter-clockwise from above). */
function prismPositions(outline: ReadonlyArray<readonly [number, number]>, height: number): number[] {
  // Drawn in x and -z so the extrusion's +z becomes up (+y) with the outline the right way round.
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 }).toNonIndexed();
  const source = geometry.getAttribute("position");
  const positions: number[] = [];
  for (let i = 0; i < source.count; i += 1) positions.push(source.getX(i), source.getZ(i), -source.getY(i));
  geometry.dispose();
  return positions;
}

/**
 * The post that pushes onto the switch's stem, added to the flat face of the clicker's top, and the
 * cross hole in it: the post as long as `gap`, the hole 3.8 mm deep from the post's end, reaching
 * into the top half itself when the post is shorter than that.
 */
export function clickerTopPart(name: string, holeName: string, gap = CLICKER_DEFAULT_GAP): ReadyPart {
  const length = Math.max(CLICKER_GAPS[0], Math.min(CLICKER_GAPS[CLICKER_GAPS.length - 1], gap));
  const circle: Array<[number, number]> = Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return [(POST_DIAMETER / 2) * Math.cos(a), (POST_DIAMETER / 2) * Math.sin(a)];
  });
  const l = CROSS_LENGTH / 2, w = CROSS_ARM / 2;
  const cross: Array<[number, number]> = [[l, -w], [l, w], [w, w], [w, l], [-w, l], [-w, w], [-l, w], [-l, -w], [-w, -w], [-w, -l], [w, -l], [w, -w]];
  // The hole stands a hair out of the post's end, so the cut is clean.
  const holeHeight = CLICKER_SOCKET_DEPTH + 0.05;
  const post = cutterShape(name, prismPositions(circle, length), POST_DIAMETER, POST_DIAMETER, length, false);
  const hole = { ...cutterShape(holeName, prismPositions(cross, holeHeight), CROSS_LENGTH, CROSS_LENGTH, holeHeight, true), elevation: length - CLICKER_SOCKET_DEPTH };
  return { name, shapes: [post, hole], group: false };
}
