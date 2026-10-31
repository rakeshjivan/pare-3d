import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createPortGeometry, normalizePortCorner, portContourPoints, PORT_PRESETS, portPresetFor } from "@/lib/portGeometry";
import { cadProfileForShapeKind } from "@/lib/cadProfileExtrusion";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";

function volumeOf(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const at = (i: number) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
  let volume = 0;
  for (let i = 0; i < count; i += 3) volume += at(i).dot(at(i + 1).cross(at(i + 2))) / 6;
  return volume;
}

describe("the port opening (#1049)", () => {
  it("fills its box: the opening seen from the front, pushed through along z", () => {
    const geometry = createPortGeometry({ width: 9.4, depth: 10, height: 3.7, cornerFillet: 1.85 });
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(-4.7, 5);
    expect(box.max.x).toBeCloseTo(4.7, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(3.7, 5);
    expect(box.min.z).toBeCloseTo(-5, 5);
    expect(box.max.z).toBeCloseTo(5, 5);
  });

  it("is closed and faces outward, with the volume of a stadium", () => {
    const geometry = createPortGeometry({ width: 9.4, depth: 10, height: 3.7, cornerFillet: 1.85 });
    const r = 1.85;
    const exact = ((9.4 - 2 * r) * 3.7 + Math.PI * r * r) * 10;
    expect(volumeOf(geometry)).toBeGreaterThan(exact * 0.98);
    expect(volumeOf(geometry)).toBeLessThanOrEqual(exact + 1e-6);
  });

  it("keeps the corners inside the opening and leaves no doubled point at a fully round end", () => {
    expect(normalizePortCorner(5, 9.4, 3.7)).toBeCloseTo(1.85, 6);
    expect(normalizePortCorner(-1, 9.4, 3.7)).toBe(0);
    const points = portContourPoints(9.4, 3.7, 1.85);
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      expect(Math.hypot(next.x - point.x, next.y - point.y)).toBeGreaterThan(1e-6);
    });
    expect(portContourPoints(13, 5.6, 0)).toHaveLength(4);
  });

  it("knows its presets again and calls a size changed by hand its own", () => {
    const c = PORT_PRESETS.usbC;
    expect(portPresetFor(c.width, c.height, c.corner)).toBe("usbC");
    expect(portPresetFor(PORT_PRESETS.usbA.width, PORT_PRESETS.usbA.height, PORT_PRESETS.usbA.corner)).toBe("usbA");
    expect(portPresetFor(c.width + 0.5, c.height, c.corner)).toBeNull();
  });

  it("comes from the library as a USB-C hole with an exact outline laid along its depth", () => {
    const asset = toolbarShapeAssets.find((entry) => entry.kind === "port");
    expect(asset?.hole).toBe(true);
    const shape = makeShapeFromAsset(asset!, { x: 0, z: 0, elevation: 0 });
    expect(shape.hole).toBe(true);
    expect(portPresetFor(shape.width ?? 0, shape.height, shape.cornerFillet)).toBe("usbC");
    const profile = cadProfileForShapeKind(shape);
    expect(profile?.loops).toHaveLength(1);
    expect(profile?.frame?.kind).toBe("extrusion");
    expect(profile?.frame?.height).toBeCloseTo(shape.depth ?? 0, 6);
    const segments = profile!.loops[0].segments;
    expect(segments.some((segment) => segment.kind === "arc")).toBe(true);
    const zs = [profile!.loops[0].z, ...segments.map((segment) => segment.z)];
    expect(Math.min(...zs)).toBeCloseTo(0, 6);
    expect(Math.max(...zs)).toBeCloseTo(shape.height, 6);
  });
});
