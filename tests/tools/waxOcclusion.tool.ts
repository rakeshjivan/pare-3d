import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { cleanScan, pairFrame } from "@/lib/dentalArch";
import { transformSoup } from "@/lib/dentalMesh";
import { planWaxupOnTeeth } from "@/lib/dentalWaxup";
import { decodeToothSet } from "@/lib/toothLibrary";
import { readWeights, ToothNet } from "@/lib/toothNet";
import { findTeethOnScan } from "@/lib/toothSegment";
import { occlusionWork } from "@/lib/waxOcclusion";

/*
 * Build 94: a wax-up on both arches of a pair, then its occlusion at an opened bite.
 *   TOOTH_NET=... UPPER=.../upper.stl LOWER=.../lower.stl RAISE=2 OUT=/path/occ.bin npx vitest run --config tests/vitest.tools.config.ts tests/tools/waxOcclusion.tool.ts
 */
function readStl(p: string): Float32Array {
  const b = readFileSync(p); const n = b.readUInt32LE(80); const out = new Float32Array(n * 9);
  for (let t = 0; t < n; t += 1) for (let k = 0; k < 9; k += 1) out[t * 9 + k] = b.readFloatLE(84 + t * 50 + 12 + k * 4);
  return out;
}
it("waxes both arches and works out their occlusion", async () => {
  const { TOOTH_NET, UPPER, LOWER, OUT } = process.env;
  if (!TOOTH_NET || !UPPER || !LOWER || !OUT) return;
  const w = readFileSync(TOOTH_NET);
  const net = new ToothNet(readWeights(w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength) as ArrayBuffer));
  const upper = readStl(UPPER), lower = readStl(LOWER);
  const [fu, fl] = [await findTeethOnScan(upper, "upper", net), await findTeethOnScan(lower, "lower", net)];
  const lib = (f: string) => decodeToothSet(readFileSync(path.resolve(__dirname, "../../apps/web/public/libraries/nulty", f)));
  const upperChosen = fu.teeth.map((t) => t.fdi).filter((f) => f % 10 <= 7);
  const lowerChosen = fl.teeth.map((t) => t.fdi).filter((f) => f % 10 <= 7);
  const pu = planWaxupOnTeeth(upper, lib("a01-upper-arch.ptl"), fu.fdi, upperChosen, "upper", { ideal: Number(process.env.IDEAL ?? 1) });
  const pl = planWaxupOnTeeth(lower, lib("a01-lower-arch.ptl"), fl.fdi, lowerChosen, "lower", { ideal: 0 });
  const { frame } = pairFrame(cleanScan(upper), cleanScan(lower));
  const fdiOf = (kind: string, side: number, arch: "upper" | "lower") => { const K = ["central", "lateral", "canine", "premolar1", "premolar2", "molar1", "molar2", "molar3"]; const right = arch === "upper" ? side > 0 : side < 0; return (arch === "upper" ? (right ? 1 : 2) : right ? 4 : 3) * 10 + K.indexOf(kind) + 1; };
  const t0 = Date.now();
  const result = occlusionWork({
    upperScan: transformSoup(upper, frame), upperFdi: fu.fdi, lowerScan: transformSoup(lower, frame), lowerFdi: fl.fdi,
    upperWax: pu.teeth.map((t) => ({ fdi: fdiOf(t.kind, t.side, "upper"), positions: transformSoup(t.positions, frame) })),
    lowerWax: pl.teeth.map((t) => ({ fdi: fdiOf(t.kind, t.side, "lower"), positions: transformSoup(t.positions, frame) })),
    raise: Number(process.env.RAISE ?? 2), scheme: (process.env.SCHEME as "canine" | "group") ?? "canine",
  });
  console.log("occlusion seconds", (Date.now() - t0) / 1000);
  console.log("openings", result.openings.map((o) => `${o.fdi || "inc"}:${o.mm}`).join(" "));
  console.log("rest", result.rest.map((r) => `${r.fdi}:${r.gap.toFixed(2)}${r.wax ? "w" : ""}`).join(" "));
  const sum = new Map<string, number>();
  for (const f of result.sweep.findings) { const k = `${f.move.kind}${f.move.kind === "lateral" ? (f.move.toward > 0 ? "+x" : "-x") : ""} ${f.kind} ${f.lower}/${f.upper}${f.wax ? " wax" : ""}`; sum.set(k, (sum.get(k) ?? 0) + 1); }
  console.log("findings", [...sum].map(([k, v]) => `${k}: ${v}`).join(" | "));
  console.log("guidance missing", result.sweep.guidanceMissing.map((m) => JSON.stringify(m)).join(" "));
  console.log("carved", result.carved.map((c) => `${c.fdi}:${c.mm.toFixed(2)}`).join(" "));
  // For a picture: the pair at the opened bite.
  const { mandiblePose, openingFor, incisalPoint } = await import("@/lib/waxOcclusion");
  const pose = mandiblePose({ kind: "rest" }, openingFor(Number(process.env.RAISE ?? 2), incisalPoint(transformSoup(lower, frame))), incisalPoint(transformSoup(lower, frame)));
  const parts = [transformSoup(upper, frame), transformSoup(transformSoup(lower, frame), pose), ...result.upperWax.map((t) => t.positions), ...result.lowerWax.map((t) => transformSoup(t.positions, pose))];
  const kinds = [0, 0, ...result.upperWax.map(() => 1), ...result.lowerWax.map(() => 1)];
  const head = Buffer.alloc(4); head.writeUInt32LE(parts.length);
  const bufs: Buffer[] = [head];
  parts.forEach((p, i) => { const h = Buffer.alloc(8); h.writeUInt32LE(p.length / 9, 0); h.writeUInt32LE(kinds[i], 4); bufs.push(h, Buffer.from(p.buffer, p.byteOffset, p.byteLength)); });
  writeFileSync(OUT, Buffer.concat(bufs));
}, 1800000);
