import { describe, expect, it } from "vitest";
import { STYLE, THEME_SCRIPT } from "../../scripts/build-guide.mjs";

/*
 * The guide follows the program's colour theme, Graphite too (#278): the dark theme with the warm
 * browns turned grey. Its greys must be the ones the program's own Graphite works out. Reads the
 * guide's stylesheet and script as the builder holds them, so it needs no built guide.
 */
function tokens(block: string) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [match[1], match[2].toLowerCase()]));
}

const dark = tokens(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(STYLE)?.[1] ?? "");
const graphite = tokens(/:root\[data-theme="dark"\]\[data-palette="graphite"\]\s*\{([^}]*)\}/.exec(STYLE)?.[1] ?? "");

describe("the guide in Graphite", () => {
  it("sets the palette when Graphite is the stored theme", () => {
    expect(THEME_SCRIPT).toContain('t==="graphite"');
    expect(THEME_SCRIPT).toContain('dataset.palette="graphite"');
  });

  it("has a grey for every brown of the dark theme", () => {
    expect(Object.keys(graphite).sort()).toEqual(["accent-ink", "card", "code", "edge", "ground", "ink", "muted", "tint"]);
  });

  // Pare 3D (build 99): the guide's dark theme is its own blue-grey, not the warm browns Graphite was
  // worked out from; Graphite is plain neutral greys.
  it("is plain neutral greys", () => {
    for (const [name, value] of Object.entries(graphite)) {
      expect(dark[name], name).toBeTruthy();
      const n = parseInt(value.slice(1), 16);
      expect((n >> 16) & 255, name).toBe((n >> 8) & 255);
      expect((n >> 8) & 255, name).toBe(n & 255);
    }
  });
});
