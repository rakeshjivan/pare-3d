import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MeshoptSimplifier } from "meshoptimizer/simplifier";
import { it } from "vitest";
import { weld } from "@/lib/dentalMesh";
import { librarySet, parseObj, splitShells } from "@/lib/dentalWaxup";
import { encodeToothSet, type ToothLibraryManifest } from "@/lib/toothLibrary";

/*
 * Build 79: packs a folder of tooth sets (Meshmixer OBJ parts, as teethy.org supplies them) into the
 * library Pare 3D ships - one .ptl per set and a manifest, in public/libraries/<id>/.
 * Each tooth is simplified until its surface would move more than SIMPLIFY_ERROR (well under what a
 * printer resolves), then quantised to 16 bits over its own box.
 *
 *   TOOTH_SOURCE=/path/to/teethy.org TOOTH_LIBRARY=teethy npx vitest run --config tests/vitest.tools.config.ts tests/tools/buildToothLibrary.tool.ts
 */
const SIMPLIFY_ERROR = 0.01; // mm

it("packs a tooth library", async () => {
  const source = process.env.TOOTH_SOURCE;
  const id = process.env.TOOTH_LIBRARY ?? "teethy";
  if (!source) return;
  await MeshoptSimplifier.ready;
  const out = path.resolve(__dirname, `../../apps/web/public/libraries/${id}`);
  mkdirSync(out, { recursive: true });
  const files = readdirSync(source).filter((name) => name.toLowerCase().endsWith(".obj")).sort();
  const manifest: ToothLibraryManifest = {
    id,
    name: "Teethy",
    credit: "Tooth library by teethy.org, redistributed with written permission.",
    url: "https://teethy.org",
    sets: [],
  };
  files.forEach((file, index) => {
    const shells = splitShells(parseObj(readFileSync(path.join(source, file), "utf8")));
    librarySet(file, shells); // must read as a set
    const packed = shells.map((soup) => {
      const m = weld(soup, 1e-5);
      const vertices = Float32Array.from(m.v);
      const indices = Uint32Array.from(m.f);
      const scale = MeshoptSimplifier.getScale(vertices, 3);
      const [kept] = MeshoptSimplifier.simplify(indices, vertices, 3, 0, SIMPLIFY_ERROR / scale);
      // compactMesh renumbers the indices in place and returns, per old vertex, its new number.
      const triangles = Uint32Array.from(kept);
      const [remap, count] = MeshoptSimplifier.compactMesh(triangles);
      const compact = new Float32Array(count * 3);
      for (let old = 0; old < remap.length; old += 1) if (remap[old] !== 0xffffffff) compact.set(vertices.subarray(old * 3, old * 3 + 3), remap[old] * 3);
      return { vertices: compact, triangles };
    });
    const name = `set-${String(index + 1).padStart(2, "0")}.ptl`;
    writeFileSync(path.join(out, name), encodeToothSet(packed));
    manifest.sets.push({ id: `${id}-${index + 1}`, name: `Teethy ${index + 1}`, file: name, teeth: packed.length });
    console.log(name, packed.map((shell) => shell.triangles.length / 3).join(" "));
  });
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}, 600000);
