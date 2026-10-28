import { describe, expect, it } from "vitest";
import { lassoChoice, loopMask, sculptMeshOf } from "@/lib/meshSculpt";

/** A flat sheet in the x-z plane, n x n squares of 1 mm, seen from above: screen x = x * 10, y = z * 10. */
function sheet(n: number) {
  const soup: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) soup.push(i, 0, j, i, 0, j + 1, i + 1, 0, j + 1, i, 0, j, i + 1, 0, j + 1, i + 1, 0, j);
  const mesh = sculptMeshOf(soup);
  const projected = new Float32Array((mesh.points.length / 3) * 2);
  for (let k = 0; k < mesh.points.length / 3; k += 1) { projected[k * 2] = mesh.points[k * 3] * 10; projected[k * 2 + 1] = mesh.points[k * 3 + 2] * 10; }
  return { mesh, projected, eye: [50, 100, 50] as [number, number, number] };
}
const count = (c: Uint8Array) => c.reduce((s, v) => s + v, 0);

describe("Select lasso (build 82)", () => {
  it("the loop mask is filled even-odd, a concave loop's notch left out", () => {
    const l = loopMask([[0, 0], [100, 0], [100, 100], [50, 40], [0, 100]]);
    expect(l.inside(10, 10)).toBe(true);
    expect(l.inside(50, 90)).toBe(false);
    expect(l.inside(90, 80)).toBe(true);
    expect(l.inside(150, 10)).toBe(false);
  });

  it("chooses the triangles with all three corners inside; replaces, adds and takes away", () => {
    const { mesh, projected, eye } = sheet(10);
    const chosen = new Uint8Array(mesh.triangles.length / 3);
    // A square loop round 1..5 mm in x and z: 4 x 4 squares, 32 triangles.
    lassoChoice(mesh, projected, eye, [[9, 9], [51, 9], [51, 51], [9, 51]], chosen, "replace", "through");
    expect(count(chosen)).toBe(32);
    // A new loop replaces it.
    lassoChoice(mesh, projected, eye, [[59, 59], [81, 59], [81, 81], [59, 81]], chosen, "replace", "through");
    expect(count(chosen)).toBe(8);
    // Shift adds, Ctrl takes away.
    lassoChoice(mesh, projected, eye, [[9, 9], [51, 9], [51, 51], [9, 51]], chosen, "add", "through");
    expect(count(chosen)).toBe(40);
    lassoChoice(mesh, projected, eye, [[9, 9], [31, 9], [31, 31], [9, 31]], chosen, "remove", "through");
    expect(count(chosen)).toBe(32);
  });

  it("Surface I see leaves out a sheet hidden under another", () => {
    const top = sheet(4);
    // A second sheet 5 mm below the first, the same on screen.
    const soup: number[] = [];
    for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) for (const y of [0, -5]) soup.push(i, y, j, i, y, j + 1, i + 1, y, j + 1, i, y, j, i + 1, y, j + 1, i + 1, y, j);
    const mesh = sculptMeshOf(soup);
    const projected = new Float32Array((mesh.points.length / 3) * 2);
    for (let k = 0; k < mesh.points.length / 3; k += 1) { projected[k * 2] = mesh.points[k * 3] * 10; projected[k * 2 + 1] = mesh.points[k * 3 + 2] * 10; }
    const loop: Array<[number, number]> = [[-1, -1], [41, -1], [41, 41], [-1, 41]];
    const front = new Uint8Array(mesh.triangles.length / 3);
    lassoChoice(mesh, projected, top.eye, loop, front, "replace", "front");
    const through = new Uint8Array(mesh.triangles.length / 3);
    lassoChoice(mesh, projected, top.eye, loop, through, "replace", "through");
    expect(count(through)).toBe(64);
    expect(count(front)).toBe(32);
    for (let t = 0; t < front.length; t += 1) if (front[t]) expect(mesh.points[mesh.triangles[t * 3] * 3 + 1]).toBe(0);
  });
});
