import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { scanInArchFrame } from "@/lib/dentalWaxup";
import { transformSoup } from "@/lib/dentalMesh";
import { readWeights, ToothNet } from "@/lib/toothNet";
import { findTeeth, landmarksFromTeeth } from "@/lib/toothSegment";

/*
 * Build 94: finds the teeth on a scan with the tooth finder and writes what it found (for a picture).
 *   TOOTH_NET=/path/crosstooth.ptw SCAN=/path/upper.stl ARCH=upper OUT=/path/out.bin npx vitest run --config tests/vitest.tools.config.ts tests/tools/findTeeth.tool.ts
 */
function readStl(path: string): Float32Array {
  const b = readFileSync(path);
  const n = b.readUInt32LE(80);
  if (84 + n * 50 === b.length) {
    const out = new Float32Array(n * 9);
    for (let t = 0; t < n; t += 1) for (let k = 0; k < 9; k += 1) out[t * 9 + k] = b.readFloatLE(84 + t * 50 + 12 + k * 4);
    return out;
  }
  const v = [...b.toString("utf8").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  return Float32Array.from(v);
}

it("finds the teeth on a scan", async () => {
  const { TOOTH_NET, SCAN, ARCH, OUT } = process.env;
  if (!TOOTH_NET || !SCAN || !OUT) return;
  const w = readFileSync(TOOTH_NET);
  const net = new ToothNet(readWeights(w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength) as ArrayBuffer));
  const soup = readStl(SCAN);
  const arch = ARCH === "lower" ? "lower" : "upper";
  const t0 = Date.now();
  const { frame } = scanInArchFrame(soup);
  const local = transformSoup(soup, frame);
  console.log("frame seconds", (Date.now() - t0) / 1000);
  const map = await findTeeth(local, arch, net);
  console.log("seconds", map.seconds.toFixed(1), "teeth", map.teeth.map((t) => `${t.fdi}${t.agreed ? "" : "*"} ${t.area.toFixed(0)}mm² ${(t.confidence * 100).toFixed(0)}%`).join(", "));
  console.log("landmarks", JSON.stringify(landmarksFromTeeth(local, map, arch)));
  const head = Buffer.alloc(4); head.writeUInt32LE(local.length / 9);
  writeFileSync(OUT, Buffer.concat([head, Buffer.from(local.buffer), Buffer.from(map.fdi.buffer)]));
}, 600000);
