// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { beginBusy, BUSY_EVENT, setBusyCount, whileBusy } from "@/lib/busy";

describe("busy tracking", () => {
  const seen: string[][] = [];
  const listen = (event: Event) => seen.push((event as CustomEvent<string[]>).detail);
  window.addEventListener(BUSY_EVENT, listen);
  afterEach(() => { seen.length = 0; });

  it("reports a job while it runs and clears it after", async () => {
    await whileBusy("combine", async () => {
      expect(seen.at(-1)).toEqual(["combine"]);
    });
    expect(seen.at(-1)).toEqual([]);
  });

  it("clears even when the job fails", async () => {
    await expect(whileBusy("export", async () => { throw new Error("no"); })).rejects.toThrow("no");
    expect(seen.at(-1)).toEqual([]);
  });

  it("counts overlapping jobs and ends each only once", () => {
    const a = beginBusy("cad");
    const b = beginBusy("cad");
    a();
    a();
    expect(seen.at(-1)).toEqual(["cad"]);
    b();
    expect(seen.at(-1)).toEqual([]);
    setBusyCount("cad", 2);
    expect(seen.at(-1)).toEqual(["cad"]);
    setBusyCount("cad", 0);
    expect(seen.at(-1)).toEqual([]);
  });
});
