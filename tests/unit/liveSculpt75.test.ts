import { describe, expect, it } from "vitest";
import { LiveMesh } from "@/lib/liveSculpt";

describe("LiveMesh.fromSoup welding (build 75)", () => {
  it("joins corners within 1e-5 mm, keeps those further apart and drops collapsed triangles", () => {
    const soup = [
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      // Shares the edge (1,0,0)-(0,1,0), its corners a hair off.
      1.000000001, 0, 0, 1, 1, 0, 0, 1.000000002, 0,
      // A corner 1e-3 mm away is its own.
      1.001, 1, 0, 2, 1, 0, 2, 2, 0,
      // Two corners the same: not a triangle.
      5, 5, 5, 5, 5, 5, 6, 5, 5,
      // Far from the origin, negative coordinates.
      -120.5, -80.25, 33, -121.5, -80.25, 33, -120.5, -81.25, 33,
    ];
    const live = LiveMesh.fromSoup(soup);
    expect(live.triangleCount()).toBe(4);
    expect(live.vCount).toBe(3 + 1 + 3 + 2 + 3);
    const box = live.bounds();
    expect(box.min[0]).toBeCloseTo(-121.5, 6);
    expect(box.max[0]).toBeCloseTo(6, 6);
    live.dispose();
  });
});
