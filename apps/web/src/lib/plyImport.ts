/**
 * Fork (build 46): PLY files, as many intraoral scanners write them. A PLY comes in as the binary
 * STL of its triangles, so it is stored, reloaded and exported like any STL; its colours are not read.
 */
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

export function isPlyFile(fileName: string) {
  return /\.ply$/i.test(fileName);
}

/** The triangles of a PLY (ASCII or binary) as a binary STL. */
export function plyToStlBytes(buffer: ArrayBuffer): Uint8Array {
  const parsed = new PLYLoader().parse(buffer);
  const geometry = parsed.index ? parsed.toNonIndexed() : parsed;
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) throw new Error("This PLY file has no triangles - a point cloud cannot be imported");
  const triangles = Math.floor(position.count / 3);
  const bytes = new Uint8Array(84 + triangles * 50);
  const view = new DataView(bytes.buffer);
  const header = new TextEncoder().encode("Pare 3D from PLY");
  bytes.set(header.subarray(0, 80), 0);
  view.setUint32(80, triangles, true);
  for (let t = 0; t < triangles; t += 1) {
    const base = 84 + t * 50;
    for (let k = 0; k < 3; k += 1) {
      const i = t * 3 + k;
      view.setFloat32(base + 12 + k * 12, position.getX(i), true);
      view.setFloat32(base + 16 + k * 12, position.getY(i), true);
      view.setFloat32(base + 20 + k * 12, position.getZ(i), true);
    }
  }
  return bytes;
}

/** A PLY file as an STL file of the same name; any other file as it is. */
export async function plyAsStlFile(file: File): Promise<File> {
  if (!isPlyFile(file.name)) return file;
  const stl = plyToStlBytes(await file.arrayBuffer());
  return new File([stl as BlobPart], file.name.replace(/\.ply$/i, ".stl"), { type: "model/stl" });
}
