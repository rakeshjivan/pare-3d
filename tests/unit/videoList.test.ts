import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAYERLING_VIDEOS } from "@/lib/layerlingVideos";
import { README_LANGUAGES, discussionBody, readmeVideoLines, withVideoLines } from "../../scripts/sync-videos.mjs";

const guideRoot = join(process.cwd(), "docs", "guide");
const languages = readdirSync(guideRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^[a-z]{2}$/.test(entry.name))
  .map((entry) => entry.name);

/** The links of the video chapter (16-*.md) of a language, in the order they stand. */
function chapterVideoLinks(language: string) {
  const file = readdirSync(join(guideRoot, language)).find((name) => name.startsWith("16-"));
  if (!file) return null;
  const text = readFileSync(join(guideRoot, language, file), "utf8");
  return [...text.matchAll(/^- \[[^\]]+\]\((https:\/\/[^)\s]+)\)/gm)].map((match) => match[1]);
}

describe("the video list in the guide", () => {
  it("names the same videos, in the same order, as the list in the app, in every language", () => {
    const expected = LAYERLING_VIDEOS.map((video) => video.url);
    for (const language of languages) {
      const links = chapterVideoLinks(language);
      // A language that has no video chapter yet shows the English one.
      if (links === null) continue;
      expect(links, `docs/guide/${language}: the video chapter must list exactly the videos of layerlingVideos.ts - add or change the line in every language`).toEqual(expected);
    }
  });

  // Pare 3D (build 99): the guide has no chapter of videos about layerling any more.
});

describe("the video lists of the READMEs and the discussion", () => {
  // Pare 3D (build 99): no guide chapter to match the README lists against (the videos are layerling's).

  it("name the videos of the app list, in the same order, in every README", () => {
    const expected = LAYERLING_VIDEOS.map((video) => video.url);
    for (const file of Object.keys(README_LANGUAGES)) {
      const readme = readFileSync(join(process.cwd(), file), "utf8");
      const links = (readmeVideoLines(readme) ?? []).map((line) => /\((https:\/\/[^)\s]+)\)/.exec(line)?.[1]);
      expect(links, `${file}: the video list must match layerlingVideos.ts - run npm run videos:sync`).toEqual(expected);
    }
  });

  it("replaces a list that stands without markers, and only that", () => {
    const old = "# Title\n\n### Videos\n\nIntro:\n\n- [A](https://a.example/1) - one\n- [B](https://b.example/2) - two\n\n## Next\n\ntext\n";
    const lines = ["- [C](https://c.example/3) - three"];
    const next = withVideoLines(old, lines);
    expect(next).toContain("Intro:\n\n<!-- videos:start -->\n- [C](https://c.example/3) - three\n<!-- videos:end -->\n\n## Next");
    expect(next).not.toContain("a.example");
    expect(readmeVideoLines(next)).toEqual(lines);
    expect(withVideoLines(next, lines)).toBe(next);
  });

  it("changes only the list in the first post of the discussion", () => {
    const post = "Head sentence.\n\n- [A](https://a.example/1) - one\n- [B](https://b.example/2) - two\n\nTail sentence.";
    expect(discussionBody(post, ["- [C](https://c.example/3) - three"])).toBe("Head sentence.\n\n- [C](https://c.example/3) - three\n\nTail sentence.");
  });
});
