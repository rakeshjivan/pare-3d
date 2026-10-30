/**
 * Build 102: exocad tooth libraries, read natively. An exocad library is a folder of teeth as
 * `.eoff` files (binary OFF meshes, one per tooth, each in its own tooth frame) and, per form and jaw,
 * a "tooth bow" XML that sets every tooth in an ideal arch: its position, occlusal axis and mesial axis.
 *
 *   <library>/Teeth/<form>/<upperjaw|lowerjaw>/<n>.eoff      n = 1..8 (one quadrant) or an FDI number
 *   <library>/Pontics/<form>/<jaw>/<n>.eoff                  pontics, the same way
 *   <library>/metadata/<form>/<jaw>.xml                      the tooth bow
 *
 * `.eoff` ("OFF BINARY"): the header line, then little-endian int32 vertex, face and edge counts,
 * float32 x y z per vertex, then per face a uint16 corner count and int32 corner indices. After the
 * faces exocad appends extension blocks (feature labels and the like), which are not needed here.
 *
 * A tooth's frame: x mesial, z occlusal, y = z × x (lingual on the right side of the arch). Where
 * a library has one quadrant's teeth, the other side is the mirror: mirrored across the tooth's own
 * bucco-lingual axis, since the bow's mesial axis already points mesially on each side.
 */

import { boundaryLoops, fillLoop, soup, weld } from "@/lib/dentalMesh";

export type IndexedMesh ={ vertices: Float32Array; triangles: Uint32Array };
export type BowTooth = { fdi: number; position: [number, number, number]; occlusal: [number, number, number]; mesial: [number, number, number] };
export type ExocadSet = { form: string; jaw: "upper" | "lower"; pontic: boolean; teeth: Array<{ fdi: number; positions: Float32Array }> };

const HEADER = "OFF BINARY";

/** Whether these bytes are an exocad `.eoff` (binary OFF) mesh. */
export function isEoff(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < HEADER.length + 1) return false;
  for (let i = 0; i < HEADER.length; i += 1) if (bytes[i] !== HEADER.charCodeAt(i)) return false;
  return true;
}

/** Reads an `.eoff` mesh (polygons fanned into triangles). */
export function readEoff(data: ArrayBuffer | Uint8Array): IndexedMesh {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isEoff(bytes)) throw new Error("Not an exocad .eoff mesh");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = HEADER.length;
  // The header line ends with a newline (and, from some writers, a carriage return before it).
  while (at < bytes.length && bytes[at] !== 0x0a) at += 1;
  at += 1;
  const need = (n: number) => { if (at + n > bytes.length) throw new Error("The .eoff mesh is cut short"); };
  need(12);
  const vertexCount = view.getInt32(at, true), faceCount = view.getInt32(at + 4, true);
  at += 12;
  if (vertexCount <= 0 || faceCount <= 0 || vertexCount > 5e6 || faceCount > 1e7) throw new Error("The .eoff mesh has no usable size");
  need(vertexCount * 12);
  const vertices = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertices.length; i += 1) { vertices[i] = view.getFloat32(at, true); at += 4; }
  const triangles: number[] = [];
  for (let f = 0; f < faceCount; f += 1) {
    need(2);
    const corners = view.getUint16(at, true);
    at += 2;
    need(corners * 4);
    const first = view.getInt32(at, true);
    let previous = view.getInt32(at + 4, true);
    for (let k = 2; k < corners; k += 1) {
      const next = view.getInt32(at + k * 4, true);
      if (first < vertexCount && previous < vertexCount && next < vertexCount && first >= 0 && previous >= 0 && next >= 0) triangles.push(first, previous, next);
      previous = next;
    }
    at += corners * 4;
  }
  return { vertices, triangles: Uint32Array.from(triangles) };
}

/** Reads an exocad tooth bow (the set-up XML): each tooth's place in the ideal arch. */
export function readToothBow(xml: string): BowTooth[] {
  const teeth: BowTooth[] = [];
  const vector = (block: string, tag: string): [number, number, number] | null => {
    const m = new RegExp(`<${tag}>\\s*<x>([^<]+)</x>\\s*<y>([^<]+)</y>\\s*<z>([^<]+)</z>`).exec(block);
    if (!m) return null;
    const v = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
    return v.every(Number.isFinite) ? v : null;
  };
  for (const m of xml.matchAll(/<ModelTooth>([\s\S]*?)<\/ModelTooth>/g)) {
    const block = m[1];
    const fdi = Number(/<Number>\s*(\d+)\s*<\/Number>/.exec(block)?.[1]);
    const position = vector(block, "Position"), occlusal = vector(block, "AxisOcclusal"), mesial = vector(block, "AxisMesial");
    if (!Number.isInteger(fdi) || !position || !occlusal || !mesial) continue;
    teeth.push({ fdi, position, occlusal, mesial });
  }
  return teeth;
}

const unit = (v: [number, number, number]): [number, number, number] => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A library tooth set in its place on the bow, as a soup; `mirror` for the other side's tooth. */
export function placeBowTooth(mesh: IndexedMesh, tooth: BowTooth, mirror: boolean): Float32Array {
  const z = unit(tooth.occlusal);
  // The mesial axis, made square to the occlusal one.
  const m = tooth.mesial, d = m[0] * z[0] + m[1] * z[1] + m[2] * z[2];
  const x = unit([m[0] - d * z[0], m[1] - d * z[1], m[2] - d * z[2]]);
  const y = cross(z, x);
  const { vertices, triangles } = mesh;
  const soup = new Float32Array(triangles.length * 3);
  const flip = mirror ? -1 : 1;
  for (let t = 0; t < triangles.length; t += 3) {
    for (let c = 0; c < 3; c += 1) {
      // Mirrored, the winding is reversed so the surface still faces out.
      const v = triangles[t + (mirror && c > 0 ? 3 - c : c)] * 3;
      const lx = vertices[v], ly = vertices[v + 1] * flip, lz = vertices[v + 2];
      const o = (t + c) * 3;
      for (let k = 0; k < 3; k += 1) soup[o + k] = tooth.position[k] + lx * x[k] + ly * y[k] + lz * z[k];
    }
  }
  return soup;
}

/**
 * A library crown closed: exocad teeth are crowns open at the neck (one cervical loop), and the
 * wax-up joins teeth as solids, so each opening is capped (a fan to its centre). The cap sits where
 * the wax-up blends the tooth into the gum, so it is never seen.
 */
export function closeOpenings(positions: Float32Array): Float32Array {
  const m = weld(positions, 1e-5);
  const loops = boundaryLoops(m);
  if (!loops.length) return positions;
  for (const loop of loops) if (loop.length >= 3) fillLoop(m, loop);
  return soup(m);
}

/** The FDI quadrants a jaw's one-quadrant files are for: upper 1 (mirrored into 2), lower 3 (into 4). */
const FILE_QUADRANT = { upper: 1, lower: 3 } as const;

/**
 * Every set in an exocad library, from its files by path (a folder or a zip's contents): each form,
 * jaw and teeth/pontics, its teeth on the bow with their FDI numbers, in the bow's order.
 */
export function exocadSets(files: Map<string, Uint8Array>, decodeText: (bytes: Uint8Array) => string = (b) => new TextDecoder().decode(b)): ExocadSet[] {
  const normal = new Map<string, Uint8Array>();
  for (const [path, bytes] of files) normal.set(path.replace(/\\/g, "/").replace(/^\/+/, ""), bytes);
  const sets: ExocadSet[] = [];
  for (const [path, bytes] of normal) {
    const m = /(?:^|\/)metadata\/([^/]+)\/(upper|lower)jaw\.xml$/i.exec(path);
    if (!m) continue;
    const root = path.slice(0, m.index + (path[m.index] === "/" ? 1 : 0));
    const form = m[1], jaw = m[2].toLowerCase() as "upper" | "lower";
    const bow = readToothBow(decodeText(bytes));
    if (!bow.length) continue;
    for (const pontic of [false, true]) {
      const folder = `${root}${pontic ? "Pontics" : "Teeth"}/${form}/${jaw}jaw/`.toLowerCase();
      const meshes = new Map<string, Uint8Array>();
      for (const [p, b] of normal) if (p.toLowerCase().startsWith(folder) && p.toLowerCase().endsWith(".eoff")) meshes.set(p.slice(folder.length).replace(/\.eoff$/i, ""), b);
      if (!meshes.size) continue;
      const teeth: ExocadSet["teeth"] = [];
      for (const tooth of bow) {
        const quadrant = Math.floor(tooth.fdi / 10), number = tooth.fdi % 10;
        // A file for this very tooth (an FDI name), or the quadrant's file mirrored to the other side.
        let file = meshes.get(String(tooth.fdi)), mirror = false;
        if (!file) {
          file = meshes.get(String(number));
          mirror = quadrant !== FILE_QUADRANT[jaw];
        }
        if (!file) continue;
        teeth.push({ fdi: tooth.fdi, positions: closeOpenings(placeBowTooth(readEoff(file), tooth, mirror)) });
      }
      if (teeth.length >= 2) sets.push({ form, jaw, pontic, teeth });
    }
  }
  return sets;
}
