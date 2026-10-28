import { deflateSync } from "node:zlib";
import { librarySet } from "@/lib/dentalWaxup";

/*
 * Build 91: a small picture of a tooth set for the wax-up's set picker, drawn without a graphics card -
 * the set turned into its arch frame (front at -y, incisal +z), seen from the front, flat grey shaded
 * as Pare 3D draws scans (a light just above and left of the eye), on a clear background.
 */
export function renderSetPreview(shells: Float32Array[], upper = true, width = 240, height = 120): Uint8Array {
  const set = librarySet("preview", shells);
  const soups = set.teeth.map((tooth) => tooth.positions);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of soups) for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]); }
  const pad = 6;
  const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxZ - minZ));
  const ox = (width - (maxX - minX) * scale) / 2, oz = (height - (maxZ - minZ) * scale) / 2;
  // Screen: x right = +x, down = -z; depth = y (smaller is nearer, the viewer stands at -y).
  const depth = new Float32Array(width * height).fill(Infinity);
  const shade = new Float32Array(width * height);
  const light = normalise([-0.3, -1, 0.45]);
  for (const p of soups) {
    for (let t = 0; t < p.length; t += 9) {
      const ax = p[t], ay = p[t + 1], az = p[t + 2], bx = p[t + 3], by = p[t + 4], bz = p[t + 5], cx = p[t + 6], cy = p[t + 7], cz = p[t + 8];
      const n = normalise(cross([bx - ax, by - ay, bz - az], [cx - ax, cy - ay, cz - az]));
      // Facing the viewer (-y), from either winding.
      const facing = n[1] > 0 ? [-n[0], -n[1], -n[2]] : n;
      const lit = Math.max(0, dot(facing, light));
      // A touch of shine, as the scans are drawn.
      const half = normalise([light[0], light[1] - 1, light[2]]);
      const value = Math.min(1.08, 0.2 + 0.75 * Math.pow(lit, 1.3) + 0.22 * Math.pow(Math.max(0, dot(facing, half)), 24));
      // An upper set as it stands in the mouth, incisal edges down; a lower one incisal edges up.
      const sx = [ax, bx, cx].map((x) => (upper ? maxX - x : x - minX) * scale + ox), sy = [az, bz, cz].map((z) => (upper ? (z - minZ) * scale + oz : height - ((z - minZ) * scale + oz))), sd = [ay, by, cy];
      const x0 = Math.max(0, Math.floor(Math.min(...sx))), x1 = Math.min(width - 1, Math.ceil(Math.max(...sx)));
      const y0 = Math.max(0, Math.floor(Math.min(...sy))), y1 = Math.min(height - 1, Math.ceil(Math.max(...sy)));
      const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
      if (Math.abs(area) < 1e-12) continue;
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((sx[1] - px) * (sy[2] - py) - (sx[2] - px) * (sy[1] - py)) / area;
        const w1 = ((sx[2] - px) * (sy[0] - py) - (sx[0] - px) * (sy[2] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = w0 * sd[0] + w1 * sd[1] + w2 * sd[2];
        const k = y * width + x;
        if (d < depth[k]) { depth[k] = d; shade[k] = value; }
      }
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let k = 0; k < width * height; k += 1) {
    if (depth[k] === Infinity) continue;
    const v = shade[k];
    rgba[k * 4] = Math.min(255, Math.round(232 * v)); rgba[k * 4 + 1] = Math.min(255, Math.round(230 * v)); rgba[k * 4 + 2] = Math.min(255, Math.round(228 * v)); rgba[k * 4 + 3] = 255;
  }
  return encodePng(rgba, width, height);
}

const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalise = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** An RGBA picture as a PNG file. */
export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (width * 4 + 1)] = 0; raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1); }
  const chunk = (type: string, data: Uint8Array) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))]);
}

let table: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
