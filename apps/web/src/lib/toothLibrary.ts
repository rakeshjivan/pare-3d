/**
 * Build 79: tooth libraries shipped with Pare 3D - sets of library teeth for the wax-up, each in a
 * small binary file (`.ptl`) beside a manifest, under public/libraries/<library>/.
 *
 * A set is its teeth as separate closed shells. Each shell is stored indexed: its corners quantised
 * to 16 bits over its own bounding box (a step under a micrometre on a tooth), its triangles as
 * 16-bit indices. Read back, a set is the soups Pare 3D's wax-up takes (dentalWaxup librarySet).
 *
 * Layout (little-endian): "PTL1", uint32 shell count; per shell: uint32 vertices, uint32 triangles,
 * float32 min x y z, float32 step x y z, uint16 x y z per vertex, uint16 a b c per triangle.
 */

export type ToothSetEntry = {
  id: string; name: string; file: string; teeth: number;
  /** Build 91: a picture of the set for the picker (a PNG beside it). */
  preview?: string;
  /** Build 91: "anterior" (canine to canine, for the wax-up) or "arch" (the whole arch, kept for posterior wax-ups). */
  kind?: "anterior" | "arch";
  /** Build 91: each tooth's FDI number, in the file's order. */
  fdi?: number[];
};
export type ToothLibraryManifest = { id: string; name: string; credit: string; url: string; sets: ToothSetEntry[] };

/** The libraries that ship with Pare 3D (folders under public/libraries). */
export const BUILT_IN_LIBRARIES = ["teethy", "nulty"] as const;

const MAGIC = 0x314c5450; // "PTL1"

/** Writes shells (indexed meshes) to a .ptl file. Each shell must have fewer than 65536 vertices. */
export function encodeToothSet(shells: Array<{ vertices: Float32Array; triangles: Uint32Array }>): Uint8Array {
  let size = 8;
  for (const shell of shells) size += 8 + 24 + shell.vertices.length * 2 + shell.triangles.length * 2;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, shells.length, true);
  let at = 8;
  for (const { vertices, triangles } of shells) {
    const count = vertices.length / 3;
    if (count > 0xffff) throw new Error("A tooth with more than 65535 corners cannot be stored");
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], vertices[i + k]); max[k] = Math.max(max[k], vertices[i + k]); }
    const step = min.map((low, k) => Math.max(1e-9, (max[k] - low) / 0xffff));
    view.setUint32(at, count, true);
    view.setUint32(at + 4, triangles.length / 3, true);
    at += 8;
    for (let k = 0; k < 3; k += 1) { view.setFloat32(at, min[k], true); at += 4; }
    for (let k = 0; k < 3; k += 1) { view.setFloat32(at, step[k], true); at += 4; }
    for (let i = 0; i < vertices.length; i += 1) { view.setUint16(at, Math.round((vertices[i] - min[i % 3]) / step[i % 3]), true); at += 2; }
    for (let i = 0; i < triangles.length; i += 1) { view.setUint16(at, triangles[i], true); at += 2; }
  }
  return new Uint8Array(buffer);
}

/** Reads a .ptl file: each tooth as a triangle soup. */
export function decodeToothSet(data: ArrayBuffer | Uint8Array): Float32Array[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 8 || view.getUint32(0, true) !== MAGIC) throw new Error("Not a Pare 3D tooth set");
  const shells: Float32Array[] = [];
  let at = 8;
  for (let s = view.getUint32(4, true); s > 0; s -= 1) {
    const count = view.getUint32(at, true), triangles = view.getUint32(at + 4, true);
    at += 8;
    const min = [0, 1, 2].map((k) => view.getFloat32(at + k * 4, true));
    const step = [0, 1, 2].map((k) => view.getFloat32(at + 12 + k * 4, true));
    at += 24;
    const vertices = new Float32Array(count * 3);
    for (let i = 0; i < vertices.length; i += 1) { vertices[i] = min[i % 3] + view.getUint16(at, true) * step[i % 3]; at += 2; }
    const soup = new Float32Array(triangles * 9);
    for (let t = 0; t < triangles * 3; t += 1) {
      const v = view.getUint16(at, true) * 3;
      at += 2;
      soup[t * 3] = vertices[v]; soup[t * 3 + 1] = vertices[v + 1]; soup[t * 3 + 2] = vertices[v + 2];
    }
    shells.push(soup);
  }
  return shells;
}

/** The manifest of a built-in library, fetched from the app's own files. */
export async function loadToothLibrary(id: string, base = ""): Promise<ToothLibraryManifest> {
  const response = await fetch(`${base}libraries/${id}/manifest.json`);
  if (!response.ok) throw new Error(`No tooth library ${id}`);
  return (await response.json()) as ToothLibraryManifest;
}

/** One set of a built-in library, as its teeth. */
export async function loadToothSet(library: string, set: ToothSetEntry, base = ""): Promise<Float32Array[]> {
  const response = await fetch(`${base}libraries/${library}/${set.file}`);
  if (!response.ok) throw new Error(`No tooth set ${set.id}`);
  return decodeToothSet(await response.arrayBuffer());
}
