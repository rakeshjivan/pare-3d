import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import type { MeshData } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";
import { colorSeparatedExportMeshes, unionOverlappingExportMeshes } from "@/lib/editorBooleans";

type Vec = [number, number, number];

function box(min: Vec, max: Vec, name: string): MeshData {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const vertices: Vec[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  const faces: [number, number, number][] = [];
  for (const [a, b, c, d] of quads) faces.push([a, b, c], [a, c, d]);
  return { name, vertices, faces } as unknown as MeshData;
}

function shape(id: string, dental?: "model"): WorkplaneShape {
  return { id, name: id, kind: "box", color: "#9aa5b1", x: 0, z: 0, elevation: 0, size: 10, width: 10, depth: 10, height: 10, rotation: 0, locked: false, hidden: false, ...(dental ? { dental } : {}) } as WorkplaneShape;
}

// An upper and a lower in occlusion: they overlap by a hair, as cusps between cusps do.
const lower = () => box([0, 0, 0], [20, 20, 10.3], "lower");
const upper = () => box([0, 0, 10], [20, 20, 20], "upper");

describe("a Dental Studio pair in occlusion exports as two bodies (build 71)", () => {
  it("keeps the upper and lower apart in a 3MF and an STL", async () => {
    for (const join of [colorSeparatedExportMeshes, unionOverlappingExportMeshes]) {
      const result = await join([shape("u", "model"), shape("l", "model")], [upper(), lower()], [false, false]);
      expect(result.meshes.length).toBe(2);
      expect(result.quellen).toEqual([0, 1]);
      expect(result.verschmolzen).toBe(0);
    }
  });

  it("still joins two ordinary touching parts of one colour, as before", async () => {
    const result = await colorSeparatedExportMeshes([shape("a"), shape("b")], [upper(), lower()], [false, false]);
    expect(result.meshes.length).toBe(1);
  });

  it("joins a part put on a model with that model, not with the other one", async () => {
    // A label block sunk into the lower's base.
    const label = box([5, -1, 2], [15, 1, 6], "label");
    const result = await colorSeparatedExportMeshes([shape("u", "model"), shape("l", "model"), shape("label")], [upper(), lower(), label], [false, false, false]);
    expect(result.meshes.length).toBe(2);
    expect(result.verschmolzen).toBeGreaterThan(0);
    // The upper comes through untouched; the lower carries the label.
    const upperOut = result.meshes[result.quellen.indexOf(0)];
    expect(upperOut.faces.length).toBe(12);
  });
});
