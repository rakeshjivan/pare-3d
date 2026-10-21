import { describe, expect, it } from "vitest";
import { arrangeOnPlate, spaceEvenly, spaceWithGap, type Footprint } from "@/lib/distribute";

const part = (id: string, minX: number, width: number, minZ = 0, depth = 10, locked = false): Footprint => ({ id, minX, maxX: minX + width, minZ, maxZ: minZ + depth, locked });
const apply = (parts: Footprint[], moves: Map<string, { dx: number; dz: number }>) =>
  parts.map((p) => { const m = moves.get(p.id) ?? { dx: 0, dz: 0 }; return { ...p, minX: p.minX + m.dx, maxX: p.maxX + m.dx, minZ: p.minZ + m.dz, maxZ: p.maxZ + m.dz }; });
const gaps = (parts: Footprint[]) => { const s = [...parts].sort((a, b) => a.minX - b.minX); return s.slice(1).map((p, i) => p.minX - s[i].maxX); };

describe("distribute", () => {
  it("spaces parts of different widths with equal gaps, the outer two kept", () => {
    const parts = [part("a", 0, 10), part("b", 12, 30), part("c", 70, 5), part("d", 100, 20)];
    const moved = apply(parts, spaceEvenly(parts, "x")!);
    const g = gaps(moved);
    g.forEach((value) => expect(value).toBeCloseTo(g[0], 9));
    expect(g[0]).toBeCloseTo((120 - 65) / 3, 9);
    expect(moved.find((p) => p.id === "a")!.minX).toBe(0);
    expect(moved.find((p) => p.id === "d")!.minX).toBe(100);
  });

  it("needs three parts to space evenly", () => {
    expect(spaceEvenly([part("a", 0, 10), part("b", 50, 10)], "x")).toBeNull();
  });

  it("puts an exact gap between every part, from the first", () => {
    const parts = [part("b", 40, 30), part("a", 0, 10), part("c", 90, 5)];
    const moved = apply(parts, spaceWithGap(parts, "x", 5)!);
    expect(gaps(moved)).toEqual([5, 5]);
    expect(moved.find((p) => p.id === "a")!.minX).toBe(0);
  });

  it("works along Y (to the back, the scene's -z)", () => {
    const parts = [part("a", 0, 10, 0, 10), part("b", 0, 10, -50, 10), part("c", 0, 10, -100, 10)];
    const moves = spaceWithGap(parts, "y", 2)!;
    // "a" is in front (largest z), so it stays; b moves up behind it: its maxZ to a's minZ - 2.
    const moved = apply(parts, moves);
    expect(moved.find((p) => p.id === "a")!.minZ).toBe(0);
    expect(moved.find((p) => p.id === "b")!.maxZ).toBeCloseTo(-2, 9);
    expect(moved.find((p) => p.id === "c")!.maxZ).toBeCloseTo(-14, 9);
  });

  it("keeps a locked part where it is", () => {
    const parts = [part("a", 0, 10), part("b", 15, 10, 0, 10, true), part("c", 90, 10), part("d", 200, 10)];
    expect(spaceEvenly(parts, "x")!.has("b")).toBe(false);
  });

  it("arranges parts in centred rows that fit the plate, with the gap", () => {
    const parts = Array.from({ length: 7 }, (_, i) => part(`p${i}`, i * 3, 40, i * 7, 30));
    const moved = apply(parts, arrangeOnPlate(parts, 5, 180)!);
    const minX = Math.min(...moved.map((p) => p.minX));
    const maxX = Math.max(...moved.map((p) => p.maxX));
    expect(maxX - minX).toBeLessThanOrEqual(180);
    expect((minX + maxX) / 2).toBeCloseTo(0, 9);
    // 40 wide at 5 apart: four fit in 175 mm, so 4 + 3 rows.
    const rows = new Set(moved.map((p) => Math.round(p.minZ)));
    expect(rows.size).toBe(2);
    // No two parts overlap.
    for (const a of moved) for (const b of moved) if (a !== b) expect(a.maxX <= b.minX + 1e-9 || b.maxX <= a.minX + 1e-9 || a.maxZ <= b.minZ + 1e-9 || b.maxZ <= a.minZ + 1e-9).toBe(true);
  });
});
