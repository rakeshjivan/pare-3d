import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { adjustMatrix, mirrorAdjust, type ToothFrame } from "@/lib/dentalWaxup";
import { clampAdjustChange, composeAdjust } from "@/components/workplane/ToothGimbal";

const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
/** A frame turned about z by `a`, at `o`; `mirror` for the left side's (mesial pointing the other way). */
function frame(o: [number, number, number], a: number, mirror: boolean): ToothFrame {
  const c = Math.cos(a), s = Math.sin(a);
  const mesial: [number, number, number] = mirror ? [-c, -s, 0] : [c, s, 0];
  return { origin: o, mesial, out: [-s, c, 0].map((x, i) => (i < 2 ? x : 0)) as [number, number, number], up: [0, 0.2, 0.98].map((x) => x / Math.hypot(0, 0.2, 0.98)) as [number, number, number] };
}

describe("Build 102: the wax-up's one-click helpers", () => {
  it("mirrors a tooth onto its partner: edge and axes land on the source's mirror image", () => {
    // Midline the plane x = 0.
    const source = { frame: frame([-5, 2, 0.4], 0.25, false), width: 8.4, length: 10.6 };
    const partner = { frame: frame([4.2, 1.1, -0.3], -0.1, true), width: 8.0, length: 10.1 };
    const a = mirrorAdjust(source, partner, [0, 0, 0], [1, 0, 0]);
    const m = adjustMatrix(partner.frame, partner.width, partner.length, a);
    const edge = v(partner.frame.origin).applyMatrix4(m);
    expect(edge.x).toBeCloseTo(5, 4);
    expect(edge.y).toBeCloseTo(2, 4);
    expect(edge.z).toBeCloseTo(0.4, 4);
    // The partner's axes turned onto the source's, reflected (x negated).
    const turn = new THREE.Matrix3().setFromMatrix4(m);
    for (const key of ["mesial", "out", "up"] as const) {
      const got = v(partner.frame[key]).applyMatrix3(turn).normalize();
      const want = v(source.frame[key]).multiply(new THREE.Vector3(-1, 1, 1));
      expect(got.distanceTo(want)).toBeLessThan(1e-4);
    }
    expect(a.wider).toBeCloseTo(8.4 / 8.0, 6);
    expect(a.longer).toBeCloseTo(10.6 / 10.1, 6);
  });

  it("a tooth already the mirror of the other needs nothing", () => {
    const source = { frame: frame([-5, 2, 0], 0.2, false), width: 8, length: 10 };
    const f = source.frame;
    const partner = { frame: { origin: [5, 2, 0], mesial: [-f.mesial[0], f.mesial[1], f.mesial[2]], out: [-f.out[0], f.out[1], f.out[2]], up: [-f.up[0], f.up[1], f.up[2]] } as ToothFrame, width: 8, length: 10 };
    const a = mirrorAdjust(source, partner, [0, 0, 0], [1, 0, 0]);
    for (const key of ["mesial", "out", "up", "turn", "tip", "torque"] as const) expect(Math.abs(a[key] ?? 0)).toBeLessThan(1e-6);
  });

  it("gimbal changes compose (moves add, sizes multiply) and each gesture is capped", () => {
    expect(composeAdjust({ out: 0.2, wider: 1.1 }, { out: 0.1, wider: 1.1, turn: 2 })).toEqual({ out: 0.30000000000000004, wider: 1.2100000000000002, turn: 2 });
    expect(clampAdjustChange({ out: 9, turn: -80, longer: 3 })).toEqual({ out: 5, turn: -30, longer: 1.5 });
  });
});
