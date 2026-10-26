/*
 * Fork (build 74): where an intraoral scan's triangles stand in the scanner's own coordinates.
 *
 * Scans of one patient share the scanner's coordinates, which hold the upper, the lower and the bite
 * in occlusion. Import centres each file on the plate, so each scan keeps a frame: the map from its
 * local positions (`importedMesh.positions`) to the file's coordinates, Z-up. Moving or turning the
 * part on the plate never touches it (the local positions do not change). An edit that rebuilds the
 * part from where it stands in the world (Sculpt, Remesh, repair, a trim, a cut) carries the frame
 * over with `carryScanFrame`, so Dental Studio still finds the bite however the scans are laid out.
 */
import * as THREE from "three";
import { meshForShape } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

type ImportedMesh = NonNullable<WorkplaneShape["importedMesh"]>;

/** Layerling's Y-up scene to the Z-up convention of scan files (meshCoordinates.layerlingToZUp). */
const Y_UP_TO_Z_UP = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** The frame of a scan: local position to the file's own coordinates (Z-up), or null for a part that never had one. */
export function scanFrameOf(mesh: ImportedMesh | undefined): THREE.Matrix4 | null {
  if (!mesh) return null;
  if (mesh.scanFrame?.length === 16 && mesh.scanFrame.every(Number.isFinite)) return new THREE.Matrix4().fromArray(mesh.scanFrame);
  if (!mesh.sourceOrigin) return null;
  // Build 47: a local position is the file point (turned to Y-up when `sourceTurned`) less `sourceOrigin`.
  const [ox, oy, oz] = mesh.sourceOrigin;
  const frame = new THREE.Matrix4().makeTranslation(ox, oy, oz);
  return mesh.sourceTurned ? Y_UP_TO_Z_UP.clone().multiply(frame) : frame;
}

/** The file coordinates (Z-up) of a scan's triangles, or null when it has no frame. */
export function scanFileCoordinates(mesh: ImportedMesh): Float32Array | null {
  const frame = scanFrameOf(mesh);
  if (!frame) return null;
  const e = frame.elements, p = mesh.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i + 2 < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return out;
}

/**
 * Local position to world, worked out from the part's own triangles: the imported mesh is drawn
 * triangle for triangle in its order, so four well-spread corners and where they stand in the world
 * give the (affine) map exactly - whatever mix of size, turn and mirror the part has. Null when the
 * part is bent (taper, twist) or too flat to tell.
 */
export function localToWorld(shape: WorkplaneShape): THREE.Matrix4 | null {
  const mesh = shape.importedMesh;
  if (!mesh || mesh.positions.length < 12) return null;
  const world = meshForShape(shape);
  const local = mesh.positions;
  const count = Math.floor(local.length / 3);
  if (world.vertices.length !== count) return null;
  // Four corners far apart: the first, the farthest from it, the farthest from that line, and the farthest from that plane.
  const at = (i: number) => new THREE.Vector3(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
  const step = Math.max(1, Math.floor(count / 4000));
  const a = 0;
  let b = a, best = -1;
  for (let i = 0; i < count; i += step) { const d = at(i).distanceToSquared(at(a)); if (d > best) { best = d; b = i; } }
  const ab = at(b).sub(at(a));
  let c = a; best = -1;
  for (let i = 0; i < count; i += step) { const d = at(i).sub(at(a)).cross(ab).lengthSq(); if (d > best) { best = d; c = i; } }
  const normal = at(c).sub(at(a)).cross(ab);
  let d4 = a; best = -1;
  for (let i = 0; i < count; i += step) { const d = Math.abs(at(i).sub(at(a)).dot(normal)); if (d > best) { best = d; d4 = i; } }
  const picks = [a, b, c, d4];
  const L = new THREE.Matrix4(), W = new THREE.Matrix4();
  const lp = picks.map(at), wp = picks.map((i) => new THREE.Vector3(...world.vertices[i]));
  L.set(lp[0].x, lp[1].x, lp[2].x, lp[3].x, lp[0].y, lp[1].y, lp[2].y, lp[3].y, lp[0].z, lp[1].z, lp[2].z, lp[3].z, 1, 1, 1, 1);
  W.set(wp[0].x, wp[1].x, wp[2].x, wp[3].x, wp[0].y, wp[1].y, wp[2].y, wp[3].y, wp[0].z, wp[1].z, wp[2].z, wp[3].z, 1, 1, 1, 1);
  if (Math.abs(L.determinant()) < 1e-6) return null;
  const map = W.multiply(L.invert());
  // A bent part (taper, twist) is not one map: checked on corners the fit did not use.
  const check = new THREE.Vector3();
  for (let i = step * 7 + 1; i < count; i += Math.max(1, Math.floor(count / 50))) {
    check.copy(at(i)).applyMatrix4(map);
    if (check.distanceTo(new THREE.Vector3(...world.vertices[i])) > 1e-3) return null;
  }
  return map;
}

/**
 * `next` (an edit of `before`, rebuilt from where `before` stood in the world) with the scan frame of
 * `before` carried over. Unchanged when `before` has no frame, or the map cannot be told.
 */
export function carryScanFrame(before: WorkplaneShape, next: WorkplaneShape): WorkplaneShape {
  const frame = scanFrameOf(before.importedMesh);
  if (!frame || !next.importedMesh) return next;
  const was = localToWorld(before), now = localToWorld(next);
  if (!was || !now) return next;
  // file = frame * was^-1 * world, and world = now * local.
  const carried = frame.clone().multiply(was.clone().invert()).multiply(now);
  const { sourceOrigin, sourceTurned, ...rest } = next.importedMesh;
  void sourceOrigin; void sourceTurned;
  const was_ = before.importedMesh!;
  return {
    ...next,
    importedMesh: {
      ...rest,
      scanFrame: carried.toArray(),
      // The locked bite and the original file go with the scan through every edit.
      ...(was_.biteLocked ? { biteLocked: true } : {}),
      ...(was_.biteFit ? { biteFit: was_.biteFit } : {}),
      ...(was_.originalAssetId ?? was_.assetId ? { originalAssetId: was_.originalAssetId ?? was_.assetId } : {}),
    },
  };
}

/**
 * The fields that stand `shape` where `place` (local position to world, a rigid map) puts it, or null
 * when the part is resized, mirrored or bent (then no turn and move of it can match).
 */
export function placementFor(shape: WorkplaneShape, place: THREE.Matrix4): Pick<WorkplaneShape, "x" | "z" | "elevation" | "rotation" | "rotationX" | "rotationZ"> | null {
  const mesh = shape.importedMesh;
  if (!mesh || shape.mirrorX || shape.mirrorY || shape.mirrorZ) return null;
  if (Math.abs(shape.width - mesh.baseWidth) > 1e-4 || Math.abs(shape.depth - mesh.baseDepth) > 1e-4 || Math.abs(shape.height - mesh.baseHeight) > 1e-4) return null;
  const position = new THREE.Vector3(), turn = new THREE.Quaternion(), scale = new THREE.Vector3();
  place.decompose(position, turn, scale);
  if (Math.abs(scale.x - 1) > 1e-3 || Math.abs(scale.y - 1) > 1e-3 || Math.abs(scale.z - 1) > 1e-3) return null;
  const euler = new THREE.Euler().setFromQuaternion(turn, "XYZ");
  // transformMesh: world = R (v - c) + p, with c the middle of the part's height; so p = t + R c.
  const c = new THREE.Vector3(0, shape.height / 2, 0).applyQuaternion(turn);
  const p = position.add(c);
  return {
    x: p.x,
    z: p.z,
    elevation: p.y - shape.height / 2,
    rotation: THREE.MathUtils.radToDeg(euler.y),
    rotationX: THREE.MathUtils.radToDeg(euler.x),
    rotationZ: THREE.MathUtils.radToDeg(euler.z),
  };
}

/** A turn of the scene that takes an arch's `up` to +Y and its `front` to +Z (axes in the same coordinates). */
export function standUpright(up: [number, number, number], front: [number, number, number]): THREE.Matrix4 {
  const u = new THREE.Vector3(...up).normalize();
  const f = new THREE.Vector3(...front).addScaledVector(u, -new THREE.Vector3(...front).dot(u)).normalize();
  const s = new THREE.Vector3().crossVectors(u, f);
  // Rows: where s, u and f go (X, Y, Z) - the inverse (transpose) of the basis [s u f].
  return new THREE.Matrix4().set(s.x, s.y, s.z, 0, u.x, u.y, u.z, 0, f.x, f.y, f.z, 0, 0, 0, 0, 1);
}

/** The world box of a part's triangles were it placed by `place` (local to world). */
export function placedBounds(shape: WorkplaneShape, place: THREE.Matrix4): THREE.Box3 {
  const box = new THREE.Box3();
  const p = shape.importedMesh?.positions ?? [];
  const v = new THREE.Vector3();
  const step = Math.max(1, Math.floor(p.length / 3 / 20000)) * 3;
  for (let i = 0; i + 2 < p.length; i += step) box.expandByPoint(v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(place));
  return box;
}
