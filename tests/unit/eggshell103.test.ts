import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { boundaryLoops, weld } from "@/lib/dentalMesh";
import { closedOrientation } from "@/lib/biteContacts";
import { eggshellTooth } from "@/lib/dentalEggshell";
import { adjustMatrix, nudgeMatrix } from "@/lib/dentalWaxup";

function box(w: number, d: number, h: number) {
  const g = new THREE.BoxGeometry(w, d, h, 8, 8, 10).toNonIndexed();
  g.translate(0, 0, h / 2);
  return Float32Array.from(g.getAttribute("position").array as ArrayLike<number>);
}

function volume(soup: Float32Array) {
  let v = 0;
  for (let t = 0; t + 8 < soup.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from(soup.slice(t, t + 9));
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

describe("Build 103: the eggshell provisional and the tooth's thickness and size", () => {
  it("keeps the outer surface, opens the neck, and gives it an even closed wall", () => {
    const shell = eggshellTooth(box(7, 6, 10), [0, 0, 1], 0.6);
    expect(shell).not.toBeNull();
    const mesh = weld(shell!, 1e-6);
    expect(boundaryLoops(mesh).length).toBe(0);
    expect(closedOrientation(shell!)).toBe(1);
    // About the outer area times the wall: far less than the solid tooth, more than nothing.
    const v = volume(shell!);
    expect(v).toBeGreaterThan(0.5 * 0.6 * (2 * 7 * 10 + 2 * 6 * 10 + 7 * 6));
    expect(v).toBeLessThan(0.5 * 7 * 6 * 10);
  });

  it("holds the wall under half the tooth where it is thin (no crossing at the edge)", () => {
    const shell = eggshellTooth(box(7, 1, 10), [0, 0, 1], 1.2);
    expect(shell).not.toBeNull();
    // Every inner corner is still between the outer faces (|y| < 0.5).
    for (let i = 1; i < shell!.length; i += 3) expect(Math.abs(shell![i])).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(closedOrientation(shell!)).toBe(1);
  });

  it("a closed form with no floor facing down is left alone", () => {
    const g = new THREE.SphereGeometry(4, 24, 16).toNonIndexed();
    const sphere = Float32Array.from(g.getAttribute("position").array as ArrayLike<number>);
    // Seen with "up" along y the sphere's lowest cap faces down: it opens. Its whole is never dropped.
    const shell = eggshellTooth(sphere, [0, 1, 0], 0.6);
    expect(shell === null || closedOrientation(shell) === 1).toBe(true);
  });

  it("thicker scales bucco-lingually, size the whole tooth from its neck", () => {
    const frame = { origin: [0, 0, 10] as [number, number, number], out: [0, 1, 0] as [number, number, number], mesial: [1, 0, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number] };
    const thick = nudgeMatrix(frame, 8, 10, "thicker", 0.1);
    expect(new THREE.Vector3(1, 2, 5).applyMatrix4(thick).toArray().map((x) => +x.toFixed(6))).toEqual([1, 2.2, 5]);
    const size = nudgeMatrix(frame, 8, 10, "size", 0.1);
    // The neck (10 mm below the edge) stays; the edge rises 1 mm.
    expect(new THREE.Vector3(0, 0, 0).applyMatrix4(size).z).toBeCloseTo(0, 6);
    expect(new THREE.Vector3(0, 0, 10).applyMatrix4(size).z).toBeCloseTo(11, 6);
    const a = adjustMatrix(frame, 8, 10, { thicker: 1.2 });
    expect(new THREE.Vector3(0, 1, 10).applyMatrix4(a).y).toBeCloseTo(1.2, 6);
  });
});
