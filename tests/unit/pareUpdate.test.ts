import { describe, expect, it } from "vitest";
import { parseBuildTag } from "@/lib/pareUpdate";

describe("Pare 3D release tags", () => {
  it("reads the build number from pare-<n> tags only", () => {
    expect(parseBuildTag("pare-1")).toBe(1);
    expect(parseBuildTag("pare-27")).toBe(27);
    expect(parseBuildTag("v1.95.0")).toBeNull();
    expect(parseBuildTag("pare-x")).toBeNull();
    expect(parseBuildTag(undefined)).toBeNull();
  });
});
