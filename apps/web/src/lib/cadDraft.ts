/**
 * Fork (build 37): draft angle - the picked faces of a body leaned in by a few degrees as they go
 * up, as a moulded or cast part needs to come out of its mould, and as walls print cleaner. The
 * pull direction is up (+y, the editor's up); the faces keep their place at the body's bottom and
 * lean in from there (a negative angle leans them out).
 */
import type { OcctKernel, ShapeHandle } from "occt-wasm";

export const DRAFT_FACES_REFUSED = "These faces cannot be drafted. Pick side walls - faces that run up and down - not the top or bottom.";
export const MAX_DRAFT_ANGLE = 30;

type V = { x: number; y: number; z: number };

function faceInfo(cad: OcctKernel, face: ShapeHandle) {
  const center = cad.getSurfaceCenterOfMass(face);
  const uv = cad.uvFromPoint(face, center);
  const n = cad.surfaceNormal(face, uv.u, uv.v);
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  return { center, normal: { x: n.x / length, y: n.y / length, z: n.z / length }, area: cad.getSurfaceArea(face) };
}

/**
 * The body with each face drafted by `angleDegrees`. Faces are drafted one after another; each is
 * found again on the body made so far by where it is and which way it faces.
 */
export function draftFacesSolid(cad: OcctKernel, solid: ShapeHandle, faces: ShapeHandle[], angleDegrees: number): ShapeHandle {
  const angle = Math.max(-MAX_DRAFT_ANGLE, Math.min(MAX_DRAFT_ANGLE, angleDegrees));
  if (Math.abs(angle) < 1e-6) return cad.copy(solid);
  const targets = faces.map((face) => faceInfo(cad, face));
  // A face facing straight up or down has nothing to lean.
  if (targets.some((target) => Math.abs(target.normal.y) > 0.98)) throw new Error(DRAFT_FACES_REFUSED);
  const handles: ShapeHandle[] = [];
  try {
    // The kernel leans faces about the plane z = 0, pulling along +z: the body is turned so the
    // editor's up (+y) runs along +z, its bottom brought to z = 0, and turned back after.
    const toZUp = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0]; // (x, y, z) -> (x, -z, y)
    const fromZUp = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0]; // (x, y, z) -> (x, z, -y)
    const turn = (v: V): V => ({ x: v.x, y: -v.z, z: v.y });
    const box = cad.getBoundingBox(solid, false);
    const lift = box.ymin;
    const turned = cad.transform(solid, toZUp);
    handles.push(turned);
    let current = cad.translate(turned, 0, 0, -lift);
    handles.push(current);
    const pull: V = { x: 0, y: 0, z: 1 };
    for (const target of targets) {
      const centre = turn(target.center);
      const wanted = { x: centre.x, y: centre.y, z: centre.z - lift };
      const normal = turn(target.normal);
      const candidates = cad.getSubShapes(current, "face");
      handles.push(...candidates);
      let best: { face: ShapeHandle; score: number } | null = null;
      for (const face of candidates) {
        const info = faceInfo(cad, face);
        const facing = info.normal.x * normal.x + info.normal.y * normal.y + info.normal.z * normal.z;
        if (facing < 0.9) continue;
        const score = Math.hypot(info.center.x - wanted.x, info.center.y - wanted.y, info.center.z - wanted.z);
        if (!best || score < best.score) best = { face, score };
      }
      if (!best) throw new Error(DRAFT_FACES_REFUSED);
      let next: ShapeHandle;
      try {
        next = cad.draft(current, best.face, (angle * Math.PI) / 180, pull);
      } catch {
        throw new Error(DRAFT_FACES_REFUSED);
      }
      handles.push(next);
      if (!cad.isValid(next)) throw new Error(DRAFT_FACES_REFUSED);
      current = next;
    }
    const lowered = cad.translate(current, 0, 0, lift);
    handles.push(lowered);
    return cad.transform(lowered, fromZUp);
  } finally {
    new Set(handles).forEach((handle) => {
      try {
        cad.release(handle);
      } catch {
        // already freed
      }
    });
  }
}
