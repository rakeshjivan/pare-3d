import { describe, expect, it } from "vitest";
import { centringMoves } from "@/lib/editorAlignMirror";

describe("Align menu: centring (build 76)", () => {
  const a = { id: "a", box: { minX: 0, maxX: 10, minZ: 0, maxZ: 4 } };
  const b = { id: "b", box: { minX: 30, maxX: 34, minZ: 20, maxZ: 30 } };
  const all = { minX: 0, maxX: 34, minZ: 0, maxZ: 30 };
  it("puts every part on the middle of the selection", () => {
    const moves = centringMoves([a, b], "together", all);
    expect(moves.get("a")).toEqual({ x: 12, z: 13 });
    expect(moves.get("b")).toEqual({ x: -15, z: -10 });
  });
  it("centres on a part that stays put", () => {
    const moves = centringMoves([b], "together", a.box);
    expect(moves.get("b")).toEqual({ x: -27, z: -23 });
  });
  it("moves the selection as one onto the middle of the workplane", () => {
    const moves = centringMoves([a, b], "plate", all, { x: 0, z: 0 });
    expect(moves.get("a")).toEqual({ x: -17, z: -15 });
    expect(moves.get("b")).toEqual({ x: -17, z: -15 });
  });
});
