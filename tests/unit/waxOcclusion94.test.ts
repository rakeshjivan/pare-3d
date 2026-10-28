import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AVERAGE_ARTICULATOR, articulatorPoints, guides, mandiblePose, openingFor, sideOf } from "@/lib/waxOcclusion";

/* Build 94: the virtual articulator's movements and the guidance rules. */
describe("virtual articulator", () => {
  const incisal: [number, number, number] = [0, -25, 0];
  it("opens the incisors by the raise, the molars less (a hinge)", () => {
    const a = openingFor(3, incisal);
    const pose = mandiblePose({ kind: "rest" }, a, incisal);
    const i = new THREE.Vector3(...incisal).applyMatrix4(pose);
    expect(incisal[2] - i.z).toBeCloseTo(3, 3);
    const molar = new THREE.Vector3(25, 10, 0), m = molar.clone().applyMatrix4(pose);
    expect(molar.z - m.z).toBeGreaterThan(0.8);
    expect(molar.z - m.z).toBeLessThan(3 * 0.75);
  });
  it("keeps the condyles on their paths: protrusion moves both down and forward at the guidance angle", () => {
    const { condyles } = articulatorPoints(incisal);
    const pose = mandiblePose({ kind: "protrusion", travel: 2 }, 0, incisal);
    const c = condyles[0].clone().applyMatrix4(pose);
    const d = c.clone().sub(condyles[0]);
    expect(d.length()).toBeCloseTo(2, 4);
    expect(Math.atan2(-d.z, -d.y) * 180 / Math.PI).toBeCloseTo(AVERAGE_ARTICULATOR.condylarGuidance, 3);
  });
  it("turns about the working condyle in a lateral excursion; the other goes forward, down and in", () => {
    const { condyles } = articulatorPoints(incisal);
    const pose = mandiblePose({ kind: "lateral", toward: 1, travel: 3 }, 0, incisal);
    expect(condyles[0].clone().applyMatrix4(pose).distanceTo(condyles[0])).toBeLessThan(1e-6);
    const other = condyles[1].clone().applyMatrix4(pose).sub(condyles[1]);
    expect(other.y).toBeLessThan(0); expect(other.z).toBeLessThan(0); expect(other.x).toBeGreaterThan(0);
    // The incisors move towards the working side.
    expect(new THREE.Vector3(...incisal).applyMatrix4(pose).x).toBeGreaterThan(0);
  });
  it("tells guiding contacts from interferences", () => {
    expect(sideOf(23)).toBe(1); expect(sideOf(43)).toBe(-1);
    expect(guides({ kind: "protrusion", travel: 1 }, "canine", 31, 11)).toBe(true);
    expect(guides({ kind: "protrusion", travel: 1 }, "canine", 36, 26)).toBe(false);
    // To the left (+x): the left canines guide; the left molars only in group function.
    expect(guides({ kind: "lateral", toward: 1, travel: 1 }, "canine", 33, 23)).toBe(true);
    expect(guides({ kind: "lateral", toward: 1, travel: 1 }, "canine", 36, 26)).toBe(false);
    expect(guides({ kind: "lateral", toward: 1, travel: 1 }, "group", 36, 26)).toBe(true);
    expect(guides({ kind: "lateral", toward: 1, travel: 1 }, "group", 46, 16)).toBe(false);
  });
});
