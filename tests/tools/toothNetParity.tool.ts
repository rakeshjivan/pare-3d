import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readWeights, ToothNet, type Neighbours } from "@/lib/toothNet";

/*
 * Build 94: checks Pare's tooth finder against the original network on a recorded case: the same
 * input and the same neighbours must give the same probabilities. The files are not part of Pare 3D.
 *
 *   TOOTH_NET=/path/crosstooth.ptw TOOTH_REF=/path/ref.ptw npx vitest run --config tests/vitest.tools.config.ts tests/tools/toothNetParity.tool.ts
 */
it("matches the original network", () => {
  const weightsPath = process.env.TOOTH_NET, refPath = process.env.TOOTH_REF;
  if (!weightsPath || !refPath) return;
  const load = (path: string) => { const b = readFileSync(path); return readWeights(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); };
  const net = new ToothNet(load(weightsPath));
  const ref = load(refPath).tensors;
  const tape = (i: number) => ref.get(`tape${i}`)!.data as Int32Array;
  const attendAt = [0, 3, 7, 11, 15], sampleAt = [0, 1, 5, 9, 13], groupAt = [0, 2, 6, 10, 14], threeAt = [18, 20, 22, 24];
  let attendLevel = 0, groupLevel = 1, three = 0;
  const nb: Neighbours = {
    sample: (level) => tape(sampleAt[level]),
    nearest: (_p, _q, _k, purpose) => (purpose === "attend" ? tape(attendAt[attendLevel++]) : tape(groupAt[groupLevel++])),
    three: () => { const i = threeAt[three++]; return { idx: ref.get(`tape${i}.idx`)!.data as Int32Array, w: ref.get(`tape${i}.w`)!.data as Float32Array }; },
  };
  const input = ref.get("input")!.data as Float32Array;
  const n = input.length / 6;
  const started = performance.now();
  const prob = net.run(input, n, nb);
  console.log("seconds", ((performance.now() - started) / 1000).toFixed(2));
  const want = ref.get("prob")!.data as Float32Array;
  let diff = 0, agree = 0;
  const k = net.classes;
  for (let i = 0; i < n; i += 1) {
    let a = 0, b = 0;
    for (let j = 0; j < k; j += 1) { diff = Math.max(diff, Math.abs(prob[i * k + j] - want[i * k + j])); if (prob[i * k + j] > prob[i * k + a]) a = j; if (want[i * k + j] > want[i * k + b]) b = j; }
    if (a === b) agree += 1;
  }
  console.log("max diff", diff, "agree", agree / n);
  expect(diff).toBeLessThan(1e-3);
}, 600000);
