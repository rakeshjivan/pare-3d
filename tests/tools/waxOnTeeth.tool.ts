import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { planWaxupOnTeeth } from "@/lib/dentalWaxup";
import { decodeToothSet } from "@/lib/toothLibrary";

/*
 * Build 94: the wax-up fitted tooth by tooth on a scan whose teeth were found (findTeeth.tool's output).
 *   FOUND=/path/found_upper.bin ARCH=upper SET=nulty/a01-upper-front.ptl CHOSEN=13,12,11,21,22,23 OUT=/path/wax.bin npx vitest run --config tests/vitest.tools.config.ts tests/tools/waxOnTeeth.tool.ts
 */
it("fits a set to the patient's teeth", () => {
  const { FOUND, ARCH, SET, CHOSEN, OUT } = process.env;
  if (!FOUND || !SET || !OUT) return;
  const b = readFileSync(FOUND);
  const n = b.readUInt32LE(0);
  const soup = new Float32Array(b.buffer.slice(b.byteOffset + 4, b.byteOffset + 4 + n * 36));
  const fdi = new Uint8Array(b.buffer.slice(b.byteOffset + 4 + n * 36, b.byteOffset + 4 + n * 37));
  const shells = decodeToothSet(readFileSync(path.resolve(__dirname, "../../apps/web/public/libraries", SET)));
  const chosen = (CHOSEN ?? "13,12,11,21,22,23").split(",").map(Number);
  const t0 = Date.now();
  const plan = planWaxupOnTeeth(soup, shells, fdi, chosen, ARCH === "lower" ? "lower" : "upper", { ideal: Number(process.env.IDEAL ?? 0) });
  console.log("seconds", (Date.now() - t0) / 1000, plan.teeth.map((t) => `${t.kind}${t.side > 0 ? "+" : "-"} w${t.width.toFixed(1)} l${t.length.toFixed(1)} wax${t.clearance?.toFixed(2)}`).join(" | "));
  const wax = plan.teeth.flatMap((t) => Array.from(t.positions));
  const head = Buffer.alloc(8); head.writeUInt32LE(n, 0); head.writeUInt32LE(wax.length / 9, 4);
  writeFileSync(OUT, Buffer.concat([head, Buffer.from(soup.buffer), Buffer.from(Float32Array.from(wax).buffer)]));
}, 600000);
