import * as THREE from "three";
import { meshShapeFromPositions } from "@/lib/lithophane";
import type { ReadyPart } from "@/lib/readyParts";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork (build 21): more basic shapes - the ones people kept making by hand: a cylinder with a
 * rounded or bevelled top, a pie slice and a ring segment, a corner gusset, an arrow, a spiral
 * ramp and a geodesic ball. Each is a body of its own (a mesh standing on the plate); resizing
 * it stretches it, as with any imported part. Sizes in mm.
 */

export type MoreShapeId = "roundedCylinder" | "chamferedCylinder" | "pieSlice" | "ringSegment" | "gusset" | "arrow" | "spiralRamp" | "geodesicBall";
export const MORE_SHAPE_IDS: readonly MoreShapeId[] = ["roundedCylinder", "chamferedCylinder", "pieSlice", "ringSegment", "gusset", "arrow", "spiralRamp", "geodesicBall"];

const COLORS: Record<MoreShapeId, string> = {
  roundedCylinder: "#d97813",
  chamferedCylinder: "#c76a10",
  pieSlice: "#e0a324",
  ringSegment: "#0098c7",
  gusset: "#33983d",
  arrow: "#d41721",
  spiralRamp: "#6e2786",
  geodesicBall: "#18b99a",
};

function positionsOf(geometry: THREE.BufferGeometry): number[] {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const attribute = flat.getAttribute("position");
  const positions: number[] = [];
  for (let index = 0; index < attribute.count; index += 1) positions.push(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  if (flat !== geometry) flat.dispose();
  geometry.dispose();
  return positions;
}

/** A cylinder whose top edge is rounded (fillet) or bevelled (chamfer) by `edge`; the bottom stays sharp so it prints flat. */
export function edgedCylinderPositions(diameter: number, height: number, edge: number, kind: "round" | "chamfer", segments = 64) {
  const r = diameter / 2;
  const e = Math.max(0, Math.min(edge, r * 0.95, height * 0.95));
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, height - e)];
  if (kind === "round") {
    for (let step = 1; step <= 10; step += 1) {
      const angle = (step / 10) * (Math.PI / 2);
      profile.push(new THREE.Vector2(r - e + e * Math.cos(angle), height - e + e * Math.sin(angle)));
    }
  } else {
    profile.push(new THREE.Vector2(r - e, height));
  }
  profile.push(new THREE.Vector2(0, height));
  return positionsOf(new THREE.LatheGeometry(profile, segments));
}

/** An outline in plan (x across, y back) raised `height` straight up. */
function raised(shape: THREE.Shape, height: number, curveSegments = 48) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments });
  // Extruded along z with the outline in x/y: stand it on the plate, outline flat, height up.
  geometry.rotateX(-Math.PI / 2);
  return positionsOf(geometry);
}

/** A slice of a disc: `angle` degrees of a circle `radius` across... from the centre, or a ring from `inner` out. */
export function sectorPositions(radius: number, angle: number, height: number, inner = 0) {
  const sweep = (Math.min(359, Math.max(5, angle)) * Math.PI) / 180;
  const start = -sweep / 2;
  const shape = new THREE.Shape();
  if (inner > 0) {
    shape.moveTo(inner * Math.cos(start), inner * Math.sin(start));
    shape.lineTo(radius * Math.cos(start), radius * Math.sin(start));
    shape.absarc(0, 0, radius, start, start + sweep, false);
    shape.lineTo(inner * Math.cos(start + sweep), inner * Math.sin(start + sweep));
    shape.absarc(0, 0, inner, start + sweep, start, true);
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(radius * Math.cos(start), radius * Math.sin(start));
    shape.absarc(0, 0, radius, start, start + sweep, false);
    shape.lineTo(0, 0);
  }
  return raised(shape, height, 64);
}

/** A corner brace: a right triangle with legs `leg` long, `thickness` thick, standing up. */
export function gussetPositions(leg: number, thickness: number) {
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(leg, 0), new THREE.Vector2(0, leg)]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  return positionsOf(geometry);
}

/** An arrow pointing along +x: shaft and head, flat on the plate. */
export function arrowPositions(length: number, width: number, height: number) {
  const head = Math.min(length * 0.45, width * 1.1);
  const shaft = width * 0.42;
  const shape = new THREE.Shape([
    new THREE.Vector2(0, -shaft / 2), new THREE.Vector2(length - head, -shaft / 2), new THREE.Vector2(length - head, -width / 2),
    new THREE.Vector2(length, 0), new THREE.Vector2(length - head, width / 2), new THREE.Vector2(length - head, shaft / 2), new THREE.Vector2(0, shaft / 2),
  ]);
  return raised(shape, height);
}

/** A ramp that winds round a centre: a flat band `width` wide and `thickness` thick, rising `rise` per turn. */
export function spiralRampPositions(radius: number, width: number, thickness: number, turns: number, rise: number, stepsPerTurn = 64) {
  const steps = Math.max(8, Math.round(turns * stepsPerTurn));
  const inner = Math.max(0.5, radius - width / 2);
  const outer = radius + width / 2;
  // Corners of the band's cross-section at every step: inner/outer x bottom/top.
  const ring = (i: number) => {
    const a = (i / steps) * turns * Math.PI * 2;
    const y = (i / steps) * turns * rise;
    const c = Math.cos(a), s = Math.sin(a);
    return [
      [inner * c, y, inner * s], [outer * c, y, outer * s], [outer * c, y + thickness, outer * s], [inner * c, y + thickness, inner * s],
    ] as [number, number, number][];
  };
  const positions: number[] = [];
  // Wound so each face looks outward (the angle runs from x towards z, clockwise seen from above).
  const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...d, ...c, ...a, ...c, ...b);
  for (let i = 0; i < steps; i += 1) {
    const p = ring(i), q = ring(i + 1);
    quad(p[0], q[0], q[1], p[1]); // bottom
    quad(p[3], p[2], q[2], q[3]); // top
    quad(p[1], q[1], q[2], p[2]); // outside
    quad(p[0], p[3], q[3], q[0]); // inside
  }
  const first = ring(0), last = ring(steps);
  quad(first[0], first[1], first[2], first[3]);
  quad(last[0], last[3], last[2], last[1]);
  return positions;
}

/** A ball of flat triangles (an icosphere): `detail` 1 gives 80 faces, 2 gives 320. */
export function geodesicBallPositions(diameter: number, detail = 1) {
  return positionsOf(new THREE.IcosahedronGeometry(diameter / 2, detail));
}

export function moreShape(id: MoreShapeId, name: string): WorkplaneShape {
  const positions =
    id === "roundedCylinder" ? edgedCylinderPositions(20, 20, 4, "round")
      : id === "chamferedCylinder" ? edgedCylinderPositions(20, 20, 2, "chamfer")
        : id === "pieSlice" ? sectorPositions(20, 90, 5)
          : id === "ringSegment" ? sectorPositions(25, 120, 5, 17)
            : id === "gusset" ? gussetPositions(20, 4)
              : id === "arrow" ? arrowPositions(40, 16, 4)
                : id === "spiralRamp" ? spiralRampPositions(20, 8, 3, 1.5, 16)
                  : geodesicBallPositions(20, 1);
  return meshShapeFromPositions(name, COLORS[id], positions);
}

export function moreShapePart(id: MoreShapeId, name: string): ReadyPart {
  return { name, shapes: [moreShape(id, name)], group: false };
}
