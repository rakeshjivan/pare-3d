import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { toManifold, weld, boundaryLoops } from "@/lib/dentalMesh";
import { librarySet } from "@/lib/dentalWaxup";
import { closeOpenings, exocadSets, isEoff, readEoff, readToothBow } from "@/lib/exocadLibrary";
import { BUILT_IN_LIBRARIES, decodeToothSet, type ToothLibraryManifest } from "@/lib/toothLibrary";

let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

/** An .eoff as exocad writes it: header, counts, vertices, faces (uint16 count + int32 indices), an extension block. */
function eoff(vertices: number[], faces: number[][]) {
  const size = 11 + 12 + vertices.length * 4 + faces.reduce((s, f) => s + 2 + f.length * 4, 0) + 24;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("OFF BINARY\n"), 0);
  let at = 11;
  view.setInt32(at, vertices.length / 3, true); view.setInt32(at + 4, faces.length, true); view.setInt32(at + 8, 0, true); at += 12;
  for (const v of vertices) { view.setFloat32(at, v, true); at += 4; }
  for (const f of faces) { view.setUint16(at, f.length, true); at += 2; for (const i of f) { view.setInt32(at, i, true); at += 4; } }
  bytes.set(new TextEncoder().encode("IGD_EXTENSION\0"), at);
  return bytes;
}

/** A small crown open at the neck: a square tube (z 0..8) with a closed top, as exocad's crowns are. */
function crown(w: number) {
  const h = w / 2, v = [-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0, -h, -h, 8, h, -h, 8, h, h, 8, -h, h, 8];
  const f = [[0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7], [4, 5, 6, 7]];
  return eoff(v, f);
}

function bow(teeth: Array<{ fdi: number; x: number; y: number }>) {
  const v = (tag: string, a: number[]) => `<${tag}><x>${a[0]}</x><y>${a[1]}</y><z>${a[2]}</z></${tag}>`;
  return `<?xml version="1.0"?><ToothBow><ModelTeeth>${teeth.map((t) => `<ModelTooth>${v("Position", [t.x, t.y, 0])}${v("AxisOcclusal", [0, 0, 1])}${v("AxisMesial", [t.x < 0 ? 1 : -1, 0, 0])}<Number>${t.fdi}</Number></ModelTooth>`).join("")}</ModelTeeth></ToothBow>`;
}

describe("Build 102: exocad tooth libraries, read natively", () => {
  it("reads an .eoff mesh (polygons fanned) and stops at exocad's extension blocks", () => {
    const bytes = crown(6);
    expect(isEoff(bytes)).toBe(true);
    expect(isEoff(new TextEncoder().encode("solid stl"))).toBe(false);
    const mesh = readEoff(bytes);
    expect(mesh.vertices.length).toBe(24);
    expect(mesh.triangles.length / 3).toBe(10); // eight sides and a quad top in two
    expect(() => readEoff(bytes.slice(0, 40))).toThrow();
  });

  it("reads a tooth bow: each tooth's number, place and axes", () => {
    const teeth = readToothBow(bow([{ fdi: 11, x: -4, y: 10 }, { fdi: 21, x: 4, y: 10 }]));
    expect(teeth.map((t) => t.fdi)).toEqual([11, 21]);
    expect(teeth[0].position).toEqual([-4, 10, 0]);
    expect(teeth[0].mesial).toEqual([1, 0, 0]);
  });

  it("closes a crown open at the neck", () => {
    const mesh = readEoff(crown(6));
    const soup = new Float32Array(mesh.triangles.length * 3);
    mesh.triangles.forEach((v, i) => soup.set(mesh.vertices.subarray(v * 3, v * 3 + 3), i * 3));
    expect(boundaryLoops(weld(soup, 1e-5)).length).toBe(1);
    const closed = closeOpenings(soup);
    expect(boundaryLoops(weld(closed, 1e-5)).length).toBe(0);
    toManifold(runtime as never, weld(closed, 1e-6)).delete();
  });

  it("sets a library's teeth on its bow, the other side mirrored, from a zip's paths", () => {
    const fdis = [{ fdi: 13, x: -12, y: 4 }, { fdi: 12, x: -8, y: 8 }, { fdi: 11, x: -4, y: 10 }, { fdi: 21, x: 4, y: 10 }, { fdi: 22, x: 8, y: 8 }, { fdi: 23, x: 12, y: 4 }];
    const files = new Map<string, Uint8Array>([
      ["Lib/metadata/Form A/upperjaw.xml", new TextEncoder().encode(bow(fdis))],
      ["Lib/Teeth/Form A/upperjaw/1.eoff", crown(8)],
      ["Lib/Teeth/Form A/upperjaw/2.eoff", crown(6)],
      ["Lib/Teeth/Form A/upperjaw/3.eoff", crown(7)],
    ]);
    const sets = exocadSets(files);
    expect(sets.length).toBe(1);
    expect(sets[0]).toMatchObject({ form: "Form A", jaw: "upper", pontic: false });
    expect(sets[0].teeth.map((t) => t.fdi)).toEqual([13, 12, 11, 21, 22, 23]);
    // Each tooth at its place on the bow, closed; 21 the mirror of 11 across the midline.
    const box = (p: Float32Array) => { const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 2; k += 1) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); } return { lo, hi }; };
    const a = box(sets[0].teeth[2].positions), b = box(sets[0].teeth[3].positions);
    expect(a.hi[0] - a.lo[0]).toBeCloseTo(8, 4);
    expect(a.lo[0] + a.hi[0]).toBeCloseTo(-8, 4);
    expect(b.lo[0]).toBeCloseTo(-a.hi[0], 4);
    for (const tooth of sets[0].teeth) toManifold(runtime as never, weld(tooth.positions, 1e-6)).delete();
    // Read as a set by the wax-up.
    expect(librarySet("exocad", sets[0].teeth.map((t) => t.positions)).teeth.length).toBe(6);
  });
});

describe("Build 102: the Pare library - Christian Brenes's Elchi and Smile Overlay, by Pare names", () => {
  const manifest = JSON.parse(readFileSync("apps/web/public/libraries/pare/manifest.json", "utf8")) as ToothLibraryManifest;
  it("is the library offered; the earlier ones stay, hidden; the credit is kept", () => {
    expect(BUILT_IN_LIBRARIES[0]).toBe("pare");
    expect(manifest.hidden).toBeFalsy();
    for (const id of ["nulty", "teethy"]) expect((JSON.parse(readFileSync(`apps/web/public/libraries/${id}/manifest.json`, "utf8")) as ToothLibraryManifest).hidden).toBe(true);
    expect(manifest.credit).toMatch(/Christian Brenes/);
    expect(readFileSync("apps/web/public/libraries/pare/ATTRIBUTION.md", "utf8")).toMatch(/Christian Brenes/);
    expect(readFileSync("docs/guide/en/19-licences-and-credits.md", "utf8")).toMatch(/Christian Brenes/);
  });

  it("names every set by its Pare name, never its author", () => {
    for (const set of manifest.sets) {
      expect(set.name).toMatch(/^Pare /);
      expect(set.name).not.toMatch(/brenes|elchi|nulty|teethy/i);
    }
    const names = new Set(manifest.sets.map((s) => s.name.replace(/ pontics| full arch/g, "")));
    expect([...names].sort()).toEqual(["Pare Lower", "Pare Oval", "Pare Square", "Pare Square-Oval", "Pare Tapered", "Pare Youthful"]);
  });

  it("each set is closed teeth in arch order, with a picture", () => {
    for (const set of manifest.sets) {
      const shells = decodeToothSet(readFileSync(`apps/web/public/libraries/pare/${set.file}`));
      expect(shells.length, set.name).toBe(set.kind === "anterior" ? 6 : 14);
      expect(set.fdi?.length).toBe(shells.length);
      expect(existsSync(`apps/web/public/libraries/pare/${set.preview}`)).toBe(true);
      if (set.kind === "anterior") expect(librarySet(set.name, shells).teeth.map((t) => t.kind), set.name).toEqual(["canine", "lateral", "central", "central", "lateral", "canine"]);
      for (const shell of shells) toManifold(runtime as never, weld(shell, 1e-6)).delete();
    }
  }, 240000);
});
