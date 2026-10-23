import { describe, expect, it } from "vitest";
import { foldMesh, triangleAt, walkOnSurface } from "../../apps/web/src/lib/surfaceFold";

// A 20 mm cube from 0 to 20, triangles wound outward.
function cube(): number[] {
  const v = (x: number, y: number, z: number) => [x * 20, y * 20, z * 20];
  const quads = [
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)], // front +z
    [v(1, 0, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0)], // back -z
    [v(1, 0, 1), v(1, 0, 0), v(1, 1, 0), v(1, 1, 1)], // right +x
    [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)], // left -x
    [v(0, 1, 1), v(1, 1, 1), v(1, 1, 0), v(0, 1, 0)], // top +y
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)], // bottom -y
  ];
  return quads.flatMap(([a, b, c, d]) => [...a, ...b, ...c, ...a, ...c, ...d]);
}

describe("letters fold over an edge", () => {
  it("walks off the front face round the corner onto the right face", () => {
    const mesh = foldMesh(cube())!;
    const start = triangleAt(mesh, { x: 15, y: 10, z: 20 }, { x: 0, y: 0, z: 1 })!;
    expect(mesh.normals[start.triangle].z).toBeCloseTo(1, 6);
    const end = walkOnSurface(mesh, start.triangle, start.point, { x: 1, y: 0, z: 0 }, 9)!;
    // 5 mm to the edge, 4 mm down the right face.
    expect(end.point.x).toBeCloseTo(20, 5);
    expect(end.point.z).toBeCloseTo(16, 5);
    expect(end.point.y).toBeCloseTo(10, 5);
    expect(end.normal.x).toBeCloseTo(1, 6);
  });

  it("keeps the heading along the edge when crossing at a slant", () => {
    const mesh = foldMesh(cube())!;
    const start = triangleAt(mesh, { x: 15, y: 10, z: 20 }, { x: 0, y: 0, z: 1 })!;
    const end = walkOnSurface(mesh, start.triangle, start.point, { x: 1, y: 1, z: 0 }, Math.SQRT2 * 8)!;
    // Reaches the edge at y = 15 after sqrt(50); the last sqrt(2)*3 runs 3 down and 3 up.
    expect(end.point.x).toBeCloseTo(20, 5);
    expect(end.point.y).toBeCloseTo(18, 5);
    expect(end.point.z).toBeCloseTo(17, 5);
  });
});
