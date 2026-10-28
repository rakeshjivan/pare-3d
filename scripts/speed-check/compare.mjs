#!/usr/bin/env node
/*
 * Compares two speed-check results (engine or pare-flows JSON) step by step and flags what got
 * slower. Run both on the same machine - absolute times in a container mean little on their own.
 *
 *   node scripts/speed-check/compare.mjs docs/perf/engine-81.json engine-84.json
 *
 * A step is flagged when it is both 25% and 100 ms slower (frame and input-delay figures: 25% and
 * 30 ms). Exits 1 when anything is flagged, so it can gate a release.
 */
import { readFileSync } from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) { console.error("usage: compare.mjs <before.json> <after.json>"); process.exit(2); }
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));
if (before.kind !== after.kind) { console.error(`different kinds: ${before.kind} vs ${after.kind}`); process.exit(2); }

const rows = [];
let flagged = 0;
const check = (step, metric, a, b) => {
  if (typeof a !== "number" || typeof b !== "number") return;
  const timing = metric === "ms" || metric === "duration";
  const floor = timing ? 100 : metric === "fps" || metric === "scriptMb" ? 0 : 30;
  // Frames a second: lower is worse. Script size: 10% more is flagged.
  const worse = metric === "fps" ? a - b : b - a;
  const ratio = metric === "fps" ? (b ? a / b : 1) : (a ? b / a : 1);
  const limit = metric === "scriptMb" ? 1.1 : 1.25;
  const slow = worse > floor && ratio > limit;
  if (slow) flagged += 1;
  rows.push({ step, metric, before: a, after: b, change: a ? `${b >= a ? "+" : ""}${Math.round(((b - a) / a) * 100)}%` : "", flag: slow ? "SLOWER" : "" });
};
for (const [step, value] of Object.entries(after.results)) {
  const old = before.results[step];
  if (old === undefined) { rows.push({ step, metric: "", before: "", after: "", change: "new", flag: "" }); continue; }
  if (typeof value === "number") check(step, "ms", old, value);
  else for (const [metric, v] of Object.entries(value)) check(step, metric, old[metric], v);
}
console.log(`${before.kind}: build ${before.build ?? "?"} (${before.date?.slice(0, 10)}) -> build ${after.build ?? "?"} (${after.date?.slice(0, 10)})`);
if (before.machine?.model !== after.machine?.model || before.machine?.cpus !== after.machine?.cpus) console.log("Note: different machines - compare with care.");
console.table(rows);
console.log(flagged ? `${flagged} figure(s) slower than the limits.` : "Nothing slower than the limits.");
process.exit(flagged ? 1 : 0);
