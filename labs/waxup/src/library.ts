/**
 * Wax-up lab: exocad-format tooth libraries - the .rar as downloaded, or its files.
 *
 * Layout: teeth/<name>/<upperjaw|lowerjaw>/<1-8>.eoff (one tooth per position in a quadrant, 1 =
 * central incisor, 8 = third molar), metadata/<name>/<jaw>.xml (a "ToothBow": every tooth of the arch
 * by FDI number, with its position and its occlusal and mesial axes), pontics/... (not used here).
 *
 * A tooth file's frame (found by registering the files to positioned copies): +x mesial, +y buccal or
 * labial, +z occlusal. The files are one quadrant; the other side is their mirror image, which placing
 * a tooth with a left-handed (mesial, buccal, occlusal) frame gives by itself.
 */
import { createExtractorFromData } from "node-unrar-js";
import unrarWasm from "../node_modules/node-unrar-js/dist/js/unrar.wasm";

export type ToothMesh = { v: Float32Array; f: Uint32Array };
export type BowTooth = { fdi: number; position: [number, number, number]; occlusal: [number, number, number]; mesial: [number, number, number] };
export type Jaw = "upper" | "lower";
export type ToothLibrary = {
  name: string;
  preview: string | null;
  teeth: Record<Jaw, Map<number, ToothMesh>>;
  bow: Record<Jaw, BowTooth[] | null>;
};

/** exocad .eoff: "OFF BINARY\n", int32 nV nF nE, nV*3 float32, per face uint16 n + n int32, then an extension block. */
export function parseEoff(bytes: Uint8Array): ToothMesh {
  let head = 0;
  while (head < bytes.length && bytes[head] !== 10) head += 1;
  head += 1;
  const tag = new TextDecoder().decode(bytes.subarray(0, head));
  if (!tag.startsWith("OFF BINARY")) throw new Error("Not an .eoff tooth file");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = head;
  const nV = dv.getInt32(o, true), nF = dv.getInt32(o + 4, true);
  o += 12;
  const v = new Float32Array(nV * 3);
  for (let i = 0; i < nV * 3; i += 1) { v[i] = dv.getFloat32(o, true); o += 4; }
  const f: number[] = [];
  for (let k = 0; k < nF; k += 1) {
    const n = dv.getUint16(o, true); o += 2;
    const idx: number[] = [];
    for (let j = 0; j < n; j += 1) { idx.push(dv.getInt32(o, true)); o += 4; }
    for (let j = 1; j + 1 < n; j += 1) f.push(idx[0], idx[j], idx[j + 1]);
  }
  return { v, f: Uint32Array.from(f) };
}

/** A binary or ASCII STL as an indexed mesh (corners welded at 1e-5 mm). */
export function parseStl(bytes: Uint8Array): ToothMesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const soup: number[] = [];
  const count = bytes.length >= 84 ? dv.getUint32(80, true) : 0;
  if (84 + count * 50 === bytes.length) {
    for (let t = 0; t < count; t += 1) for (let k = 0; k < 9; k += 1) soup.push(dv.getFloat32(84 + t * 50 + 12 + k * 4, true));
  } else {
    const text = new TextDecoder().decode(bytes);
    for (const m of text.matchAll(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g)) soup.push(+m[1], +m[2], +m[3]);
  }
  return weldSoup(Float32Array.from(soup));
}

export function weldSoup(soup: Float32Array): ToothMesh {
  const key = new Map<string, number>();
  const v: number[] = [];
  const f = new Uint32Array(soup.length / 3);
  for (let i = 0; i < soup.length; i += 3) {
    const k = `${Math.round(soup[i] * 1e5)},${Math.round(soup[i + 1] * 1e5)},${Math.round(soup[i + 2] * 1e5)}`;
    let id = key.get(k);
    if (id === undefined) { id = v.length / 3; key.set(k, id); v.push(soup[i], soup[i + 1], soup[i + 2]); }
    f[i / 3] = id;
  }
  return { v: Float32Array.from(v), f };
}

function parseBow(xml: string): BowTooth[] {
  const vec = (block: string, tag: string): [number, number, number] | null => {
    const m = new RegExp(`<${tag}>\\s*<x>([^<]+)</x>\\s*<y>([^<]+)</y>\\s*<z>([^<]+)</z>`).exec(block);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const out: BowTooth[] = [];
  for (const m of xml.matchAll(/<ModelTooth>([\s\S]*?)<\/ModelTooth>/g)) {
    const fdi = Number(/<Number>(\d+)<\/Number>/.exec(m[1])?.[1]);
    const position = vec(m[1], "Position"), occlusal = vec(m[1], "AxisOcclusal"), mesial = vec(m[1], "AxisMesial");
    if (fdi && position && occlusal && mesial) out.push({ fdi, position, occlusal, mesial });
  }
  return out;
}

export type LibraryFile = { path: string; data: Uint8Array };

/** Files out of a .rar (nested archives inside it are skipped). */
export async function filesFromRar(data: Uint8Array): Promise<LibraryFile[]> {
  const extractor = await createExtractorFromData({ data: data.slice().buffer, wasmBinary: unrarWasm.slice().buffer });
  const { files } = extractor.extract();
  const out: LibraryFile[] = [];
  for (const file of files) {
    if (file.fileHeader.flags.directory || !file.extraction) continue;
    out.push({ path: file.fileHeader.name.replace(/\\/g, "/"), data: file.extraction });
  }
  return out;
}

/** One library from its files; teeth from .eoff (or .stl when there is no .eoff), the bow from the XML. */
export function libraryFromFiles(files: LibraryFile[], fallbackName: string): ToothLibrary {
  const teeth: Record<Jaw, Map<number, ToothMesh>> = { upper: new Map(), lower: new Map() };
  const bow: Record<Jaw, BowTooth[] | null> = { upper: null, lower: null };
  let name = "", preview: string | null = null;
  const jawOf = (path: string): Jaw | null => (/upperjaw/i.test(path) ? "upper" : /lowerjaw/i.test(path) ? "lower" : null);
  const toothFiles = files.filter((file) => /\/teeth\//i.test(`/${file.path}`) && /\/[1-8]\.(eoff|stl)$/i.test(file.path));
  for (const file of toothFiles) {
    const jaw = jawOf(file.path);
    const position = Number(/\/([1-8])\.(eoff|stl)$/i.exec(file.path)?.[1]);
    if (!jaw || !position) continue;
    const isEoff = /\.eoff$/i.test(file.path);
    if (!isEoff && teeth[jaw].has(position)) continue;
    if (!isEoff && toothFiles.some((other) => other.path === file.path.replace(/\.stl$/i, ".eoff"))) continue;
    try {
      teeth[jaw].set(position, isEoff ? parseEoff(file.data) : parseStl(file.data));
      name ||= /teeth\/([^/]+)\//i.exec(file.path)?.[1] ?? "";
    } catch {
      // Not a tooth after all.
    }
  }
  for (const file of files) {
    const jaw = jawOf(file.path);
    if (jaw && /metadata\/.*\.xml$/i.test(file.path)) bow[jaw] = parseBow(new TextDecoder().decode(file.data));
    if (/metadata\/.*preview\.png$/i.test(file.path) && !preview) {
      let binary = "";
      for (let i = 0; i < file.data.length; i += 8192) binary += String.fromCharCode(...file.data.subarray(i, i + 8192));
      preview = `data:image/png;base64,${btoa(binary)}`;
    }
  }
  if (!teeth.upper.size && !teeth.lower.size) throw new Error("No teeth found: expected teeth/<name>/upperjaw/1.eoff ... 8.eoff");
  return { name: name || fallbackName, preview, teeth, bow };
}
