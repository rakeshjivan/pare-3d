import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MeshoptSimplifier } from "meshoptimizer/simplifier";
import { it } from "vitest";
import { weld } from "@/lib/dentalMesh";
import { librarySet, parseObj, splitShells } from "@/lib/dentalWaxup";
import { exocadSets } from "@/lib/exocadLibrary";
import { decodeToothSet, encodeToothSet, type ToothLibraryManifest, type ToothSetEntry } from "@/lib/toothLibrary";
import { capOpenings } from "./buildNultyLibrary.tool";
import { renderSetPreview } from "./toothPreview";

/*
 * Build 102: packs the Pare library, public/libraries/pare/, from Christian Brenes's libraries (used
 * with his permission): the Elchi library (exocad: three upper forms, one lower, teeth and pontics,
 * each on its own ideal bow), read by Pare 3D's own exocad reader, and two of his 3D Smile Overlay
 * anterior designs (one OBJ per tooth). In the tool the sets go by Pare names; the credit is on the
 * Licences & credits page and in ATTRIBUTION.md. Each tooth simplified to within 0.01 mm, as the others.
 *
 *   ELCHI_SOURCE=/path/to/Brenes-Elchi OVERLAY_SOURCE="/path/to/Christian Brenes 3D Smile Overlay " \
 *     npx vitest run --config tests/vitest.tools.config.ts tests/tools/buildPareLibrary.tool.ts
 */
const SIMPLIFY_ERROR = 0.01; // mm
const FRONT = { upper: [13, 12, 11, 21, 22, 23], lower: [33, 32, 31, 41, 42, 43] };
const ARCH = { upper: [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27], lower: [37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47] };
/** Elchi's forms, by their Pare names (the lower teeth are one set for every form). */
const FORMS: Record<string, { key: string; name: string }> = {
  "Brenes-Elchi Square": { key: "square", name: "Pare Square" },
  "Brenes-Elchi Round": { key: "oval", name: "Pare Oval" },
  "Brenes-Elchi Square Round": { key: "square-oval", name: "Pare Square-Oval" },
};
/** The Smile Overlay designs shipped: the file with the design's six teeth in place, and its Pare name. */
const OVERLAYS = [
  { file: "007.obj", key: "tapered", name: "Pare Tapered" },
  { file: "021.obj", key: "youthful", name: "Pare Youthful" },
];

function pack(soup: Float32Array) {
  const m = weld(soup, 1e-5);
  capOpenings(m.v, m.f);
  const vertices = Float32Array.from(m.v);
  const indices = Uint32Array.from(m.f);
  const scale = MeshoptSimplifier.getScale(vertices, 3);
  const [kept] = MeshoptSimplifier.simplify(indices, vertices, 3, 0, SIMPLIFY_ERROR / scale);
  const triangles = Uint32Array.from(kept);
  const [remap, count] = MeshoptSimplifier.compactMesh(triangles);
  const compact = new Float32Array(count * 3);
  for (let old = 0; old < remap.length; old += 1) if (remap[old] !== 0xffffffff) compact.set(vertices.subarray(old * 3, old * 3 + 3), remap[old] * 3);
  return { vertices: compact, triangles };
}

const walk = (dir: string, out = new Map<string, Uint8Array>(), base = dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out, base);
    else if (/\.(eoff|xml)$/i.test(name)) out.set(path.relative(base, p), new Uint8Array(readFileSync(p)));
  }
  return out;
};

it("packs the Pare tooth library, with a picture of every set", async () => {
  const elchi = process.env.ELCHI_SOURCE, overlay = process.env.OVERLAY_SOURCE;
  if (!elchi || !overlay) return;
  await MeshoptSimplifier.ready;
  const out = path.resolve(__dirname, "../../apps/web/public/libraries/pare");
  mkdirSync(out, { recursive: true });
  const manifest: ToothLibraryManifest = {
    id: "pare",
    name: "Pare",
    credit: "Tooth libraries by Christian Brenes (the Elchi library and the 3D Smile Overlay), used with his permission.",
    url: "",
    sets: [],
  };
  const write = (key: string, name: string, kind: "anterior" | "arch", fdi: number[], shells: ReturnType<typeof pack>[]) => {
    const file = `${key}.ptl`;
    const bytes = encodeToothSet(shells);
    writeFileSync(path.join(out, file), bytes);
    const decoded = decodeToothSet(bytes);
    librarySet(file, decoded); // must read as a set
    const entry: ToothSetEntry = { id: `pare-${key}`, name, file, teeth: shells.length, kind, fdi, preview: file.replace(/\.ptl$/, ".png") };
    writeFileSync(path.join(out, entry.preview!), renderSetPreview(decoded, fdi[0] < 30));
    manifest.sets.push(entry);
    console.log(file, `${(bytes.length / 1024).toFixed(0)} KB`, shells.map((s) => s.triangles.length / 3).join(" "));
  };
  // Elchi, read natively from its exocad files.
  const sets = exocadSets(walk(elchi));
  const lowerDone = new Set<boolean>();
  for (const form of Object.keys(FORMS)) {
    for (const set of sets.filter((s) => s.form === form).sort((a, b) => (a.jaw === b.jaw ? 0 : a.jaw === "upper" ? -1 : 1))) {
      if (set.jaw === "lower" && lowerDone.has(set.pontic)) continue; // one lower set, the same in every form
      const byFdi = new Map(set.teeth.map((tooth) => [tooth.fdi, tooth.positions]));
      const base = set.jaw === "lower" ? { key: "", name: "Pare Lower" } : FORMS[form];
      const key = `${base.key ? `${base.key}-` : ""}${set.pontic ? "pontic-" : ""}${set.jaw}`;
      const name = `${base.name}${set.pontic ? " pontics" : ""}`;
      for (const [part, numbers, kind, suffix] of [["front", FRONT[set.jaw], "anterior", ""], ["arch", ARCH[set.jaw], "arch", " full arch"]] as const) {
        if (!numbers.every((n) => byFdi.has(n))) throw new Error(`${form} ${set.jaw}: missing teeth`);
        write(`${key}-${part}`, `${name}${suffix}`, kind, [...numbers], numbers.map((n) => pack(byFdi.get(n)!)));
      }
      if (set.jaw === "lower") lowerDone.add(set.pontic);
    }
  }
  // Two Smile Overlay designs: six teeth each, canine to canine.
  for (const design of OVERLAYS) {
    // The design's own file has the six teeth in place (each tooth's own file is in its own frame).
    const file = path.join(overlay, design.file);
    if (!existsSync(file)) throw new Error(`Missing ${design.name}`);
    const teeth = splitShells(parseObj(readFileSync(file, "utf8")), 500);
    if (teeth.length !== 6) throw new Error(`${design.name}: ${teeth.length} teeth, not 6`);
    const shells = teeth.map(pack);
    // In the arch's order, right canine to left (the files' x runs that way round).
    const centre = (s: ReturnType<typeof pack>) => { let x = 0; for (let i = 0; i < s.vertices.length; i += 3) x += s.vertices[i]; return x / (s.vertices.length / 3); };
    shells.sort((a, b) => centre(a) - centre(b));
    write(`${design.key}-upper-front`, design.name, "anterior", FRONT.upper, shells);
  }
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}, 1800000);
