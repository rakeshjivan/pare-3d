import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MeshoptSimplifier } from "meshoptimizer/simplifier";
import { it } from "vitest";
import { weld } from "@/lib/dentalMesh";
import { librarySet, parseObj } from "@/lib/dentalWaxup";
import { decodeToothSet, encodeToothSet, type ToothLibraryManifest, type ToothSetEntry } from "@/lib/toothLibrary";
import { renderSetPreview } from "./toothPreview";

/*
 * Build 91: packs Dr Adam Nulty's tooth libraries (Meshmixer part folders: one OBJ per tooth, named by
 * the Universal number, "..._#8.obj", every tooth already in its place in the arch) into the library
 * Pare 3D ships, public/libraries/nulty/: per library an upper and a lower anterior set (canine to
 * canine) for the wax-up, and the whole upper and lower arch (second molar to second molar) kept for
 * posterior wax-ups to come. Each tooth simplified to within 0.01 mm, as Teethy's. Every set gets a
 * picture for the picker; Teethy's sets get theirs too (PREVIEWS_ONLY=teethy).
 *
 *   NULTY_SOURCE=/path/to/folders npx vitest run --config tests/vitest.tools.config.ts tests/tools/buildNultyLibrary.tool.ts
 *   PREVIEWS_ONLY=teethy npx vitest run --config tests/vitest.tools.config.ts tests/tools/buildNultyLibrary.tool.ts
 */
const SIMPLIFY_ERROR = 0.01; // mm
const LIBRARIES = [
  { folder: "Adam Nulty A01 Tooth Library", key: "a01", name: "Nulty A01" },
  { folder: "Adam Nulty F01 Tooth Library", key: "f01", name: "Nulty F01" },
  { folder: "Adam Nulty A01 Pontic Library", key: "a01-pontic", name: "Nulty A01 pontics" },
];
/** Universal numbers to FDI: 1-8 are 18-11, 9-16 are 21-28, 17-24 are 38-31, 25-32 are 41-48. */
export const universalToFdi = (n: number) => (n <= 8 ? 19 - n : n <= 16 ? 12 + n : n <= 24 ? 55 - n : 16 + n);
const SETS = [
  { key: "upper-front", name: "upper front", numbers: [6, 7, 8, 9, 10, 11], kind: "anterior" as const },
  { key: "lower-front", name: "lower front", numbers: [22, 23, 24, 25, 26, 27], kind: "anterior" as const },
  { key: "upper-arch", name: "upper arch", numbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], kind: "arch" as const },
  { key: "lower-arch", name: "lower arch", numbers: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], kind: "arch" as const },
];

/**
 * The library's crowns are open at the neck (a Meshmixer part is joined on along that edge); the wax-up
 * needs closed teeth, so each opening is closed with a fan to its middle (the neck is a near-flat ring).
 */
export function capOpenings(vertices: number[], faces: number[]) {
  const directed = new Set<string>();
  for (let t = 0; t < faces.length; t += 3) for (let k = 0; k < 3; k += 1) directed.add(`${faces[t + k]},${faces[t + (k + 1) % 3]}`);
  // Border edges run a -> b with no b -> a; the cap runs b -> a.
  const next = new Map<number, number>();
  for (let t = 0; t < faces.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = faces[t + k], b = faces[t + (k + 1) % 3];
    if (!directed.has(`${b},${a}`)) next.set(b, a);
  }
  const seen = new Set<number>();
  let loops = 0;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    for (let v = start; !seen.has(v) && next.has(v); v = next.get(v)!) { seen.add(v); loop.push(v); }
    if (loop.length < 3) continue;
    const c = [0, 0, 0];
    for (const v of loop) for (let k = 0; k < 3; k += 1) c[k] += vertices[v * 3 + k] / loop.length;
    const centre = vertices.length / 3;
    vertices.push(c[0], c[1], c[2]);
    for (let i = 0; i < loop.length; i += 1) faces.push(loop[i], loop[(i + 1) % loop.length], centre);
    loops += 1;
  }
  return loops;
}

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

it("packs Dr Adam Nulty's tooth libraries, with a picture of every set", async () => {
  const only = process.env.PREVIEWS_ONLY;
  const root = path.resolve(__dirname, "../../apps/web/public/libraries");
  if (only) {
    // Pictures for a library already packed.
    const dir = path.join(root, only);
    const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as ToothLibraryManifest;
    for (const set of manifest.sets) {
      const preview = set.file.replace(/\.ptl$/, ".png");
      writeFileSync(path.join(dir, preview), renderSetPreview(decodeToothSet(readFileSync(path.join(dir, set.file))), !(set.fdi ?? [11]).every((n) => n >= 31)));
      set.preview = preview;
    }
    writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  const source = process.env.NULTY_SOURCE;
  if (!source) return;
  await MeshoptSimplifier.ready;
  const out = path.join(root, "nulty");
  mkdirSync(out, { recursive: true });
  const manifest: ToothLibraryManifest = {
    id: "nulty",
    name: "Dr Adam Nulty",
    credit: "Tooth library by Dr Adam Nulty, used with his permission (CC BY-NC-ND 4.0).",
    url: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    sets: [],
  };
  for (const library of LIBRARIES) {
    const dir = path.join(source, library.folder);
    if (!existsSync(dir)) throw new Error(`Missing ${dir}`);
    const files = readdirSync(dir).filter((name) => /_#\d+\.obj$/i.test(name));
    const byNumber = new Map(files.map((name) => [Number(/_#(\d+)\.obj$/i.exec(name)![1]), name] as const));
    const packed = new Map<number, ReturnType<typeof pack>>();
    for (const [n, name] of byNumber) packed.set(n, pack(parseObj(readFileSync(path.join(dir, name), "utf8"))));
    for (const set of SETS) {
      const teeth = set.numbers.filter((n) => packed.has(n));
      if (teeth.length !== set.numbers.length) throw new Error(`${library.name} ${set.name}: missing teeth`);
      const shells = teeth.map((n) => packed.get(n)!);
      const file = `${library.key}-${set.key}.ptl`;
      const bytes = encodeToothSet(shells);
      writeFileSync(path.join(out, file), bytes);
      const decoded = decodeToothSet(bytes);
      librarySet(file, decoded); // must read as a set
      const entry: ToothSetEntry = { id: `nulty-${library.key}-${set.key}`, name: `${library.name} ${set.name}`, file, teeth: shells.length, kind: set.kind, fdi: teeth.map(universalToFdi) };
      if (set.kind === "anterior") {
        entry.preview = file.replace(/\.ptl$/, ".png");
        writeFileSync(path.join(out, entry.preview), renderSetPreview(decoded, set.key.startsWith("upper")));
      }
      manifest.sets.push(entry);
      console.log(file, `${(bytes.length / 1024).toFixed(0)} KB`, shells.map((s) => s.triangles.length / 3).join(" "));
    }
  }
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}, 1800000);
