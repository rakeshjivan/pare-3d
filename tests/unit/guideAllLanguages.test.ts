import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error the guide build is a plain .mjs module
import { headingIds, loadMessages, loadValues, readChapters, renderBlocks } from "../../scripts/build-guide.mjs";
// @ts-expect-error the tool list is a plain .mjs module
import { tools } from "../../scripts/layerling-mcp-tools.mjs";

/*
 * guide.test.ts holds the five languages that translate every chapter to the same plan. These
 * checks hold for every language folder, whatever stage its translation is at: they are the
 * mistakes that slipped through there (a heading that never rendered as one, links into a
 * chapter that went nowhere, a tool missing from the AI chapter).
 */
const root = join(__dirname, "..", "..");
const guideRoot = join(root, "docs", "guide");
const LANGUAGES = readdirSync(guideRoot).filter((name) => name !== "images" && statSync(join(guideRoot, name)).isDirectory());

type Chapter = { file: string; number: string; body: string };

describe("the guide in every language", () => {
  it("is English only (Pare 3D build 26)", () => {
    expect(LANGUAGES.sort()).toEqual(["en"]);
  });

  it("writes headings with a plain space, so they render as headings", async () => {
    for (const language of LANGUAGES) {
      for (const chapter of (await readChapters(language)) as Chapter[]) {
        chapter.body.split(/\r?\n/).forEach((line, index) => {
          if (/^#{1,3}\S/.test(line) && !/^#{1,3}\s/.test(line)) throw new Error(`${language}/${chapter.file}:${index + 1}: "${line.slice(0, 40)}"`);
          expect(line.startsWith("#") && /^#{1,3} /.test(line), `${language}/${chapter.file}:${index + 1}`).toBe(false);
        });
      }
    }
  });

  it("links only to headings a chapter has", async () => {
    const english = (await readChapters("en")) as Chapter[];
    for (const language of LANGUAGES) {
      for (const chapter of (await readChapters(language)) as Chapter[]) {
        // As the build names them: a heading whose text gives no id takes the English one in its place.
        const own: string[] = headingIds(chapter.body);
        const source = english.find((entry) => entry.number === chapter.number);
        const fallback: string[] | null = source && headingIds(source.body).length === own.length ? headingIds(source.body) : null;
        const ids = new Set(own.map((id, position) => id || fallback?.[position] || `section-${position + 1}`));
        for (const match of chapter.body.matchAll(/\]\(#([^)]+)\)/g)) {
          expect(ids.has(match[1]), `${language}/${chapter.file}: #${match[1]}`).toBe(true);
        }
      }
    }
  });

  it("names every MCP tool in the AI chapter", async () => {
    for (const language of LANGUAGES) {
      const chapter = ((await readChapters(language)) as Chapter[]).find((entry) => entry.number === "14");
      expect(chapter, language).toBeDefined();
      for (const tool of tools as { name: string }[]) expect(chapter!.body, `${language}: ${tool.name}`).toContain(`\`${tool.name}\``);
    }
  });

  it("uses only interface names that exist", async () => {
    const values = await loadValues();
    for (const language of LANGUAGES) {
      const messages = await loadMessages(language);
      for (const chapter of (await readChapters(language)) as Chapter[]) {
        const context = { language, messages, values, imageSize: () => null, shortcutsHtml: "", references: { uiKeys: new Set(), shots: new Set(), chapters: new Set() } };
        const { html } = renderBlocks(chapter.body, context);
        expect(html, `${language}/${chapter.file}`).not.toMatch(/\{\{|\}\}/);
        expect(html, `${language}/${chapter.file}`).not.toContain("{count}");
      }
    }
  });
});
