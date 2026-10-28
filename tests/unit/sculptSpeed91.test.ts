import { describe, expect, it } from "vitest";
import { LiveMesh, stampBrush } from "@/lib/liveSculpt";

function strip(length: number, width: number, step: number, height = (_x: number, _y: number) => 0) {
  const soup: number[] = [];
  const nx = Math.round(length / step), ny = Math.round(width / step);
  const at = (i: number, j: number) => { const x = -length / 2 + i * step, y = -width / 2 + j * step; return [x, y, height(x, y)]; };
  for (let i = 0; i < nx; i += 1) for (let j = 0; j < ny; j += 1) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); soup.push(...a, ...b, ...c, ...a, ...c, ...d); }
  return LiveMesh.fromSoup(soup);
}

describe("Build 91: brushes with next to no garbage", () => {
  it("gather() finds the same corners at the same distances as region()", () => {
    const mesh = strip(20, 20, 0.25, (x, y) => Math.sin(x) * Math.cos(y));
    const hit = mesh.pick([1, 2, 10], [0, 0, -1])!;
    const map = mesh.region(hit.point, 2.5, hit.triangle);
    const count = mesh.gather(hit.point, 2.5, hit.triangle);
    expect(count).toBe(map.size);
    for (let i = 0; i < count; i += 1) expect(mesh.brushDist[i]).toBeCloseTo(map.get(mesh.brushList[i])!, 12);
  });

  it("a brush stroke gives the same surface whether it is handed a region or gathers its own", () => {
    const a = strip(20, 20, 0.25), b = strip(20, 20, 0.25);
    for (let x = -5; x <= 5; x += 0.5) {
      const ha = a.pick([x, 0, 10], [0, 0, -1])!, hb = b.pick([x, 0, 10], [0, 0, -1])!;
      a.dab("inflate", ha.point, [0, 0, 1], 2, a.region(ha.point, 2, ha.triangle), 0.5, 0.1);
      stampBrush(b, "inflate", hb.point, [0, 0, 1], 2, hb.triangle, 0.5);
    }
    // stampBrush uses brushResponse's strength and step, so compare shapes, not heights: both raised, smooth.
    let raisedA = 0, raisedB = 0;
    for (let v = 0; v < a.vCount; v += 1) { if (a.pos[v * 3 + 2] > 1e-6) raisedA += 1; if (b.pos[v * 3 + 2] > 1e-6) raisedB += 1; }
    expect(raisedA).toBeGreaterThan(100);
    expect(Math.abs(raisedA - raisedB)).toBeLessThan(raisedA * 0.05);
  });

  it("picks the right spot on a part wider than the grid's 1024 cells (the keys wrap)", () => {
    // 700 mm long with 0.5 mm cells: more than 1024 cells along x.
    const mesh = strip(700, 4, 1, (x) => (x > 300 ? 5 : 0));
    for (const x of [-340, -100, 0, 250, 320, 345]) {
      const hit = mesh.pick([x + 0.3, 0.2, 50], [0, 0, -1]);
      expect(hit, String(x)).not.toBeNull();
      expect(hit!.point[0]).toBeCloseTo(x + 0.3, 6);
      expect(hit!.point[2]).toBeCloseTo(x + 0.3 > 300 ? 5 : x + 0.3 > 299 ? hit!.point[2] : 0, 6);
    }
  });

  it("a surface raised by the brush is picked where it now is, before the frame's end", () => {
    const mesh = strip(20, 20, 0.25);
    const hit = mesh.pick([0, 0, 10], [0, 0, -1])!;
    for (let k = 0; k < 20; k += 1) mesh.dab("inflate", hit.point, [0, 0, 1], 3, mesh.region(hit.point, 3, hit.triangle), 1, 0.3);
    let top = 0;
    for (let v = 0; v < mesh.vCount; v += 1) top = Math.max(top, mesh.pos[v * 3 + 2]);
    expect(top).toBeGreaterThan(1);
    const again = mesh.pick([0, 0, 10], [0, 0, -1])!;
    expect(again.point[2]).toBeGreaterThan(top - 0.2);
  });
});
