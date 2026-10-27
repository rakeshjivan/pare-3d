import { describe, expect, it } from "vitest";
import { largerMeshLimit, MAX_BOOLEAN_TRIANGLE_LIMIT } from "@/lib/workplaneSettings";

describe("raising the triangle limit for a large import (build 76)", () => {
  it("offers room for twice the mesh, at least the fast preset, at most the largest limit", () => {
    expect(largerMeshLimit(330_577)).toBe(1_000_000);
    expect(largerMeshLimit(600_000)).toBe(1_250_000);
    expect(largerMeshLimit(9_000_000)).toBe(MAX_BOOLEAN_TRIANGLE_LIMIT);
  });
});
