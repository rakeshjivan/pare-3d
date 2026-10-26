import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { importedShapeFromTriangleSoup } from "@/lib/stlImport";
import { shapeWithWorldPositions } from "@/lib/meshRepair";
import { worldTriangles } from "@/lib/blend";
import { carryScanFrame, localToWorld, placementFor, scanFileCoordinates, scanFrameOf, standUpright } from "@/lib/scanFrame";
import type { WorkplaneShape } from "@/types/layerling";

/** A bumpy open sheet standing somewhere off the origin in "scanner" coordinates. */
function scanSoup() {
  const out: number[] = [];
  const h = (x: number, y: number) => 2 * Math.sin(x / 3) * Math.cos(y / 4);
  for (let i = 0; i < 20; i += 1) for (let j = 0; j < 14; j += 1) {
    const x0 = 40 + i, y0 = -12 + j, x1 = x0 + 1, y1 = y0 + 1;
    out.push(x0, y0, 7 + h(x0, y0), x1, y0, 7 + h(x1, y0), x1, y1, 7 + h(x1, y1), x0, y0, 7 + h(x0, y0), x1, y1, 7 + h(x1, y1), x0, y1, 7 + h(x0, y1));
  }
  return out;
}

/** Each triangle of a soup as a sorted key of its rounded corners, for comparing surfaces whatever their order. */
function keys(p: ArrayLike<number>) {
  const out: string[] = [];
  for (let t = 0; t + 8 < p.length; t += 9) {
    const corners = [0, 1, 2].map((k) => `${p[t + k * 3].toFixed(3)},${p[t + k * 3 + 1].toFixed(3)},${p[t + k * 3 + 2].toFixed(3)}`).sort();
    out.push(corners.join("|"));
  }
  return out.sort();
}

describe("a scan keeps its place in the scanner's coordinates (build 74)", () => {
  // As STL import does: the Z-up file turned to Y-up, marked as turned.
  const turned = () => { const p = scanSoup(); const out: number[] = []; for (let i = 0; i < p.length; i += 3) out.push(p[i], p[i + 2], -p[i + 1]); return out; };
  const imported = (): WorkplaneShape => importedShapeFromTriangleSoup("upper.stl", turned(), undefined, "stl", true);

  it("reads back the file's own coordinates after import", () => {
    const shape = imported();
    expect(scanFrameOf(shape.importedMesh)).not.toBeNull();
    // Turned to Y-up on import and back again: the file's points.
    expect(keys(scanFileCoordinates(shape.importedMesh!)!)).toEqual(keys(Float32Array.from(scanSoup())));
  });

  it("is unchanged by moving and turning the part on the plate", () => {
    const shape = { ...imported(), x: 70, z: -30, elevation: 5, rotation: 37, rotationX: 12 };
    expect(keys(scanFileCoordinates(shape.importedMesh!)!)).toEqual(keys(Float32Array.from(scanSoup())));
  });

  it("is carried through an edit that rebuilds the part from where it stands", () => {
    const moved = { ...imported(), x: -55, z: 22, elevation: 3, rotation: 140, rotationZ: -20 };
    // An edit that keeps every triangle (as a sculpt stroke elsewhere would): rebuilt from the world.
    const edited = shapeWithWorldPositions(moved, worldTriangles(moved));
    expect(edited.rotation).toBe(0);
    expect(edited.importedMesh?.scanFrame?.length).toBe(16);
    const back = scanFileCoordinates(edited.importedMesh!)!;
    expect(keys(back)).toEqual(keys(Float32Array.from(scanSoup())));
  });

  it("is carried when the edit removes part of the scan (a trim)", () => {
    const moved = { ...imported(), x: 12, z: 8, rotation: 90 };
    const world = worldTriangles(moved);
    const kept = world.slice(0, Math.floor(world.length / 18) * 9);
    const trimmed = shapeWithWorldPositions(moved, kept);
    const original = keys(Float32Array.from(scanSoup()));
    const back = keys(scanFileCoordinates(trimmed.importedMesh!)!);
    expect(back.length).toBe(kept.length / 9);
    back.forEach((key) => expect(original).toContain(key));
  });

  it("finds the part's own map from local to world and stands it where a map says", () => {
    const shape = { ...imported(), x: 3, z: 4, elevation: 1, rotation: 25, rotationX: -40 };
    const map = localToWorld(shape)!;
    expect(map).not.toBeNull();
    const fields = placementFor(shape, map)!;
    const again = { ...shape, ...fields };
    const a = keys(worldTriangles(shape)), b = keys(worldTriangles(again));
    expect(b).toEqual(a);
  });

  it("turns an arch's up to +Y and its front to +Z", () => {
    const up: [number, number, number] = [0, 0, -1], front: [number, number, number] = [0, 1, 0];
    const turn = standUpright(up, front);
    const u = new THREE.Vector3(...up).applyMatrix4(turn), f = new THREE.Vector3(...front).applyMatrix4(turn);
    expect(u.y).toBeCloseTo(1, 6);
    expect(f.z).toBeCloseTo(1, 6);
    expect(turn.determinant()).toBeCloseTo(1, 6);
  });

  it("leaves a part without a scan frame as it was", () => {
    const plain = { ...imported(), importedMesh: { ...imported().importedMesh!, sourceOrigin: undefined } };
    const edited = carryScanFrame(plain, shapeWithWorldPositions(plain, worldTriangles(plain)));
    expect(edited.importedMesh?.scanFrame).toBeUndefined();
  });
});
