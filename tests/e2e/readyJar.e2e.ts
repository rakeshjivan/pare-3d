import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { DEFAULT_JAR, jarParts, jarThread, normalizeJar } from "@/lib/readyJar";
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import { meshHealth } from "@/lib/meshRepair";
import { worldTriangles } from "@/lib/blend";

const bounds = (positions: number[]) => {
  const out = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < positions.length; i += 3) {
    out.minX = Math.min(out.minX, positions[i]); out.maxX = Math.max(out.maxX, positions[i]);
    out.minY = Math.min(out.minY, positions[i + 1]); out.maxY = Math.max(out.maxY, positions[i + 1]);
  }
  return out;
};

describe("Jar with a screw-on lid (build 30)", () => {
  it("has a thread whose core leaves a full wall round the opening", () => {
    const o = normalizeJar({});
    const thread = jarThread(o);
    expect(thread.diameter - 2 * thread.depth).toBeCloseTo(o.inside + 2 * o.wall, 1);
  });

  it("builds a closed jar as tall as its inside plus the floor, and a closed lid", async () => {
    const [jar, lid] = jarParts({}, { jar: "Jar", lid: "Lid" });
    const jarBody = (await buildGroupedShapeFromSelection(jar.shapes, 800000)).group!;
    const lidBody = (await buildGroupedShapeFromSelection(lid.shapes, 800000)).group!;
    const jarTris = worldTriangles(jarBody);
    const lidTris = worldTriangles(lidBody);
    expect(meshHealth(jarTris).watertight).toBe(true);
    expect(meshHealth(lidTris).watertight).toBe(true);
    const jb = bounds(jarTris);
    expect(jb.minY).toBeCloseTo(0, 2);
    expect(jb.maxY).toBeCloseTo(DEFAULT_JAR.wall + DEFAULT_JAR.height, 1);
    const lb = bounds(lidTris);
    expect(lb.maxY).toBeCloseTo(DEFAULT_JAR.wall + DEFAULT_JAR.neck + 0.5, 1);
    // Jar and lid lie apart on the plate.
    expect(lb.minX).toBeGreaterThan(jb.maxX);
    expect(meshForShape(jarBody).faces.length).toBeGreaterThan(100);
  });

  it("keeps sizes in range", () => {
    const o = normalizeJar({ inside: 500, pitch: 0.2, neck: 1, height: 3 });
    expect(o.inside).toBeLessThanOrEqual(140);
    expect(o.pitch).toBeGreaterThanOrEqual(1.5);
    expect(o.neck).toBeGreaterThanOrEqual(2 * o.pitch);
    expect(o.height).toBeGreaterThan(o.neck);
  });
});
