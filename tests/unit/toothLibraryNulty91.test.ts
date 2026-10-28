import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { toManifold, weld } from "@/lib/dentalMesh";
import { librarySet } from "@/lib/dentalWaxup";
import { BUILT_IN_LIBRARIES, decodeToothSet, type ToothLibraryManifest } from "@/lib/toothLibrary";

let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

const manifestOf = (id: string) => JSON.parse(readFileSync(`apps/web/public/libraries/${id}/manifest.json`, "utf8")) as ToothLibraryManifest;

describe("Build 91: Dr Adam Nulty's tooth libraries, and a picture of every set", () => {
  it("ships with Teethy, credited to Dr Adam Nulty", () => {
    expect(BUILT_IN_LIBRARIES).toContain("nulty");
    const manifest = manifestOf("nulty");
    expect(manifest.credit).toMatch(/Adam Nulty/);
    expect(manifest.credit).toMatch(/CC BY-NC-ND 4\.0/);
    expect(existsSync("apps/web/public/libraries/nulty/ATTRIBUTION.md")).toBe(true);
    // A01, F01 and the A01 pontics: upper and lower front, upper and lower arch.
    expect(manifest.sets.length).toBe(12);
    expect(manifest.sets.filter((set) => set.kind === "anterior").length).toBe(6);
  });

  it("each front set is six closed teeth, canine to canine, numbered as FDI", () => {
    for (const set of manifestOf("nulty").sets.filter((entry) => entry.kind === "anterior")) {
      const shells = decodeToothSet(readFileSync(`apps/web/public/libraries/nulty/${set.file}`));
      expect(shells.length, set.name).toBe(6);
      const kinds = librarySet(set.name, shells).teeth.map((t) => t.kind);
      expect(kinds, set.name).toEqual(["canine", "lateral", "central", "central", "lateral", "canine"]);
      expect(set.fdi).toEqual(set.name.includes("upper") ? [13, 12, 11, 21, 22, 23] : [33, 32, 31, 41, 42, 43]);
      for (const shell of shells) toManifold(runtime as never, weld(shell, 1e-6)).delete();
    }
  }, 120000);

  it("the whole arches are kept (14 teeth each, second molar to second molar)", () => {
    for (const set of manifestOf("nulty").sets.filter((entry) => entry.kind === "arch")) {
      expect(decodeToothSet(readFileSync(`apps/web/public/libraries/nulty/${set.file}`)).length, set.name).toBe(14);
      expect(set.fdi!.length).toBe(14);
    }
  });

  it("every set in the picker has its picture (PNG), Teethy's too", () => {
    for (const id of BUILT_IN_LIBRARIES) {
      for (const set of manifestOf(id).sets.filter((entry) => entry.kind !== "arch")) {
        expect(set.preview, `${id} ${set.name}`).toBeTruthy();
        const bytes = readFileSync(`apps/web/public/libraries/${id}/${set.preview}`);
        expect([...bytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
      }
    }
  });
});
