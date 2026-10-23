import { describe, expect, it } from "vitest";
import { faceComponents } from "../../apps/web/src/lib/meshComponents";

// A cube as a triangle soup: every triangle has its own three points (as an STL is read).
function cubeSoup(offset: number) {
  const c = (x: number, y: number, z: number) => [x * 10 + offset, y * 10, z * 10];
  const quads = [
    [c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)], [c(1, 0, 0), c(0, 0, 0), c(0, 1, 0), c(1, 1, 0)],
    [c(1, 0, 1), c(1, 0, 0), c(1, 1, 0), c(1, 1, 1)], [c(0, 0, 0), c(0, 0, 1), c(0, 1, 1), c(0, 1, 0)],
    [c(0, 1, 1), c(1, 1, 1), c(1, 1, 0), c(0, 1, 0)], [c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)],
  ];
  return quads.flatMap(([a, b, cc, d]) => [a, b, cc, a, cc, d]);
}

describe("separate pieces of a mesh", () => {
  it("finds one piece in a cube whose triangles share no point objects", () => {
    const vertices = cubeSoup(0);
    const faces = Array.from({ length: vertices.length / 3 }, (_, f) => [f * 3, f * 3 + 1, f * 3 + 2]);
    expect(faceComponents(vertices, faces, 0.0005)).toHaveLength(1);
  });

  it("finds two pieces in two cubes apart, and one when they touch within the tolerance", () => {
    const apart = [...cubeSoup(0), ...cubeSoup(20)];
    const faces = Array.from({ length: apart.length / 3 }, (_, f) => [f * 3, f * 3 + 1, f * 3 + 2]);
    const pieces = faceComponents(apart, faces, 0.0005);
    expect(pieces).toHaveLength(2);
    expect(pieces.map((piece) => piece.length).sort()).toEqual([12, 12]);
    const touching = [...cubeSoup(0), ...cubeSoup(10.0001)];
    expect(faceComponents(touching, faces, 0.0005)).toHaveLength(1);
  });

  it("handles a big mesh quickly", () => {
    const vertices: number[][] = [];
    const faces: number[][] = [];
    for (let i = 0; i < 200_000; i += 1) {
      vertices.push([i * 0.01, 0, 0], [(i + 1) * 0.01, 0, 0], [i * 0.01, 1, 0]);
      faces.push([i * 3, i * 3 + 1, i * 3 + 2]);
    }
    const start = performance.now();
    expect(faceComponents(vertices, faces, 0.0005)).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
