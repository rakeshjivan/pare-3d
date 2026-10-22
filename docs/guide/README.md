# The user guide

Pare 3D's guide is in English only (build 26 removed the other languages; the interface is English only too). It is
written here and built into plain static pages under `apps/web/public/guide`; it ships with the program, and
`npm run export` and `npm run dev` build it. The build also writes a `search-index.json` (one entry per section of
every chapter), which the search box in the header of each page reads.

```
docs/guide/
  en/01-getting-started.md    one file per chapter, the number is the order
  images/en/*.webp            the pictures, taken from the running program
```

`GUIDE_BUILD_LANGUAGES` in `scripts/build-guide.mjs` lists the languages that are built.

## Writing a chapter

A chapter starts with `title:` and `summary:` between `---` lines, followed by Markdown: headings (`##`, `###`),
paragraphs, lists, tables, `> **Tip:**` boxes, code. Beyond that:

| Write | Result |
| --- | --- |
| `{{ui:editor.tool.group}}` | the button's name, **read from the interface's own texts** (`messages.en.ts`), so a renamed button is renamed here, and a key that no longer exists stops the build |
| `[[Ctrl]]+[[Z]]` | keys |
| `[text](chapter:solids-and-holes)` | a link to another chapter, by its file name without the number |
| `![Caption](shot:hole-after)` | a picture from `images/<language>/hole-after.webp`, with the caption below |
| `{{shortcuts}}` | the table of keyboard shortcuts, read from `ShortcutsModal.tsx` - keep the word as it is in a translation, or the page shows the placeholder instead of the table |

**Never type a button's name by hand.** Use `{{ui:...}}`. Explain in your own words, name in the program's words.

**A new feature gets its lines in the guide** - together with the welcome text (`welcome.*`) and its MCP action. The
test `tests/unit/guide.test.ts` checks that every interface name, chapter link and picture exists; `tests/unit/guideAllLanguages.test.ts`
checks the guide for headings that render, `#` links that land, unknown `{{...}}` placeholders and every
MCP tool in the AI chapter.

## The pictures

The pictures are taken by `scripts/guide-screenshots.mjs`, scene by scene (`scripts/guide-scenes.mjs`). A scene builds its situation through the MCP bridge and the real buttons, so it needs the development server:

```
npm run dev -- -p 3010
npm run guide:images                                  # everything
node scripts/guide-screenshots.mjs --only fillet-tool
# on Linux: EDGE_PATH=/path/to/chromium node scripts/guide-screenshots.mjs
```

Do not edit source files while the run is going; the editor reloads and the scene times out. Take the pictures anew
before each release so the guide shows the current interface.

A new picture needs a scene in `guide-scenes.mjs` that calls `ctx.shot("<name>")`. Scenes find buttons through
`ctx.t("<message key>")`.
