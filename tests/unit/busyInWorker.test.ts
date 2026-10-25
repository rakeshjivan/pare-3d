import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { beginBusy } from "@/lib/busy";

/**
 * Build 67: grouping runs in the geometry worker, and it marks itself busy there. Next writes `typeof window`
 * as "object" in browser bundles, workers included, so busy.ts must not lean on that check: in build 67's
 * first try every group and cut in the worker failed with "window is not defined".
 */
describe("busy notices where there is no window", () => {
  it("does not test for the window with typeof", () => {
    const source = readFileSync(path.resolve(__dirname, "../../apps/web/src/lib/busy.ts"), "utf8");
    expect(source.replace(/\/\/.*$/gm, "")).not.toMatch(/typeof window/);
  });

  it("starts and ends a job without a window", () => {
    expect((globalThis as { window?: unknown }).window).toBeUndefined();
    expect(() => beginBusy("combine")()).not.toThrow();
  });
});
