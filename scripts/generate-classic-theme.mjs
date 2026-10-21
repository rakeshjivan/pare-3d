#!/usr/bin/env node
/*
 * Builds apps/web/public/assets/theme/classic-theme.css from globals.css and
 * the style sheets split off from it (the same sources as Graphite).
 * The app links it only while Classic is selected (see appTheme.ts).
 *
 * Classic is the light theme recoloured to the familiar "beginner CAD" look:
 * white and cool-grey surfaces, slate text, and a blue accent instead of the
 * warm beige surfaces and orange accent. Like Graphite, every colour
 * declaration of the light rules is repeated once, in the same order, under a
 * selector that only matches in Classic and has exactly the specificity of the
 * original (the extra condition sits inside :where()). Linked after
 * globals.css, each repeated declaration wins over its original and nothing
 * else. Rules written for the dark theme are left out: Classic resolves to
 * light.
 *
 * Filament swatches (--filament-*) are real print colours and stay as they
 * are, except the lead colour, which goes back to blue. Reds and greens
 * (errors, success, the hover accent) also stay.
 *
 * Run after changing colours in any source sheet:  npm run theme:classic
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GRAPHITE_SOURCES } from "./generate-graphite-theme.mjs";

const CLASSIC = '[data-palette="classic"]';
const DARK_PREFIX = 'html[data-theme="dark"]';
const COLOR_PATTERN = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)/g;
const COLOR_PROPERTY = /^(?:--.+|color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|filter|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|stop-color|flood-color|lighting-color)$/;

/** The accent: a clear mid blue, readable as text on white. */
const ACCENT_HUE = 211;
const NEUTRAL_HUE = 214;

function toHsl(r, g, b) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((value) => Math.round(value * 255));
}

/**
 * A warm neutral becomes a cool, faintly blue grey of the same lightness; a
 * warm accent (orange, amber, gold) becomes the blue accent. Anything else
 * (reds, greens, existing blues, pure greys) is returned as null: unchanged.
 */
export function classicColor(r, g, b) {
  const { h, s, l } = toHsl(r, g, b);
  if (s < 0.02 || h < 15 || h > 62) return null;
  const paleBeige = l >= 0.74 && s < 0.75;
  const accent = s >= 0.5 && l >= 0.22 && l <= 0.85 && !paleBeige;
  if (accent) {
    // Oranges sit around l 0.45-0.55; the blue keeps that weight but never
    // goes so light that white text on it stops reading.
    const lightness = Math.min(Math.max(l * 0.92, 0.3), 0.62);
    return fromHsl(ACCENT_HUE, Math.min(0.78, s), lightness);
  }
  // Neutrals: a little saturation on very light tones gives the cool white,
  // darker text tones become slate.
  const saturation = l > 0.85 ? 0.22 : l > 0.5 ? 0.12 : 0.16;
  return fromHsl(NEUTRAL_HUE, saturation, l < 0.5 ? l * 0.9 : l);
}

function hex(value) {
  return value.toString(16).padStart(2, "0");
}

export function classicColors(value) {
  return value.replace(COLOR_PATTERN, (match) => {
    if (match.startsWith("#")) {
      let digits = match.slice(1);
      if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join("");
      const [r, g, b] = [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16));
      const next = classicColor(r, g, b);
      return next ? `#${next.map(hex).join("")}${digits.slice(6, 8)}` : match;
    }
    const parts = match.slice(match.indexOf("(") + 1, -1).split(",").map((part) => part.trim());
    if (parts.length < 3 || parts.slice(0, 3).some((part) => !/^[0-9.]+$/.test(part))) return match;
    const next = classicColor(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    if (!next) return match;
    return parts.length === 4 ? `rgba(${next.join(", ")}, ${parts[3]})` : `rgb(${next.join(", ")})`;
  });
}

/** The same selector, matching only in Classic, with unchanged specificity. */
export function classicSelector(selector) {
  const root = /^(:root|html)(?=$|[\s.#[:>+~])/.exec(selector);
  if (root) return `${root[1]}:where(${CLASSIC})${selector.slice(root[1].length)}`;
  return `:where(html${CLASSIC}) ${selector}`;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function blocks(css) {
  const result = [];
  let index = 0;
  while (index < css.length) {
    const open = css.indexOf("{", index);
    if (open < 0) break;
    const prelude = stripComments(css.slice(index, open)).trim();
    let depth = 1;
    let cursor = open + 1;
    while (depth > 0 && cursor < css.length) {
      if (css.startsWith("/*", cursor)) {
        cursor = css.indexOf("*/", cursor) + 2;
        continue;
      }
      if (css[cursor] === "{") depth += 1;
      else if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    result.push([prelude, css.slice(open + 1, cursor - 1)]);
    index = cursor;
  }
  return result;
}

function splitSelectors(prelude) {
  const selectors = [];
  let depth = 0;
  let current = "";
  for (const character of prelude) {
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      selectors.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) selectors.push(current.trim());
  return selectors;
}

function declarations(body) {
  const result = [];
  let depth = 0;
  let current = "";
  for (const character of stripComments(body)) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === ";" && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result
    .filter((declaration) => declaration.includes(":"))
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
    });
}

function isDarkOnly(selector) {
  return selector.startsWith(DARK_PREFIX) || /\[data-theme="dark"\]/.test(selector) || /\[data-palette="graphite"\]/.test(selector);
}

function transform(css, indent = "") {
  const out = [];
  for (const [prelude, body] of blocks(css)) {
    if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
      // Media queries for a dark system preference never apply in Classic.
      if (/prefers-color-scheme:\s*dark/.test(prelude)) continue;
      const inner = transform(body, `${indent}  `);
      if (inner.length) out.push(`${indent}${prelude} {\n${inner.join("\n\n")}\n${indent}}`);
      continue;
    }
    if (prelude.startsWith("@")) continue;
    const selectors = splitSelectors(prelude).filter((selector) => !isDarkOnly(selector));
    if (!selectors.length) continue;
    const kept = declarations(body).filter(([property, value]) => {
      if (property.startsWith("--filament-")) return false;
      COLOR_PATTERN.lastIndex = 0;
      return COLOR_PROPERTY.test(property) || COLOR_PATTERN.test(value);
    });
    const changed = kept
      .map(([property, value]) => [property, classicColors(value), value])
      .filter(([, next, original]) => next !== original);
    if (!changed.length) continue;
    out.push(
      `${indent}${selectors.map(classicSelector).join(`,\n${indent}`)} {\n`
      + changed.map(([property, value]) => `${indent}  ${property}: ${value};`).join("\n")
      + `\n${indent}}`,
    );
  }
  return out;
}

/*
 * Deliberate choices on top of the repeated rules: the lead filament colour
 * returns to blue, the UI font becomes a plain rounded sans, and the top bar
 * is pure white with a hairline under it.
 */
const EXTRAS = `:root:where(html${CLASSIC}) {
  --filament-cobalt: #1f72d1;
  --font-ui: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --topbar: #ffffff;
  --toolbar-bg: #ffffff;
  /* Tool groups in a calm, cool palette that sits with the blue: no orange, yellow or coral. */
  --group-home: #1f72d1;
  --group-clipboard: #1596b8;
  --group-history: #2e9e6b;
  --group-shapes: #1f72d1;
  --group-visibility: #5b6778;
  --group-combine: #7b5ce0;
  --group-modify: #4a63d8;
  --group-arrange: #0f8f8a;
  --group-manage: #3d7fd6;
  --group-help: #5b6778;
  --group-sketch: #b04fc4;
}
/* Group frames keep their colour, a little softer on the cool background. */
:where(html${CLASSIC}) .toolbar-section-tools,
:where(html${CLASSIC}) .toolbar-section .action-buttons {
  background: color-mix(in srgb, var(--group-color) 5%, #ffffff);
}`;

export function classicThemeCss(sourceCss) {
  return [
    "/*",
    " * Generated by scripts/generate-classic-theme.mjs from globals.css and the",
    " * sheets split off from it - do not edit by hand;",
    " * run `npm run theme:classic` after changing colours there.",
    " */",
    "",
    transform(sourceCss).join("\n\n"),
    "",
    EXTRAS,
    "",
  ].join("\n");
}

export const CLASSIC_TARGET = "apps/web/public/assets/theme/classic-theme.css";
/*
 * The dark counterpart: Graphite (neutral greys) with its orange accents turned blue. Built from
 * the generated graphite-theme.css, whose greys classicColor leaves alone, and linked after it with
 * the same selectors, so only the accents change.
 */
export const GRAPHITE_SOURCE = "apps/web/public/assets/theme/graphite-theme.css";
export const CLASSIC_DARK_TARGET = "apps/web/public/assets/theme/classic-dark-theme.css";
const CLASSIC_DARK_EXTRAS = `:root:where([data-theme="dark"][data-palette="graphite"]) {
  --filament-cobalt: #4c9aff;
  --group-home: #4c9aff;
  --group-clipboard: #3cb8d8;
  --group-history: #4cc28a;
  --group-shapes: #4c9aff;
  --group-visibility: #9aa6b6;
  --group-combine: #9b82f0;
  --group-modify: #7088ee;
  --group-arrange: #2cbab3;
  --group-manage: #6aa2ea;
  --group-help: #9aa6b6;
  --group-sketch: #cf7ae0;
}`;

export function classicDarkThemeCss(graphiteCss) {
  const body = graphiteCss.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
  return [
    "/*",
    " * Generated by scripts/generate-classic-theme.mjs from graphite-theme.css - do not edit by hand.",
    " */",
    "",
    classicColors(body),
    "",
    CLASSIC_DARK_EXTRAS,
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const css = GRAPHITE_SOURCES.map((source) => readFileSync(path.join(root, source), "utf8")).join("\n");
  writeFileSync(path.join(root, CLASSIC_TARGET), classicThemeCss(css));
  console.log(`Wrote ${CLASSIC_TARGET}`);
  const graphite = readFileSync(path.join(root, GRAPHITE_SOURCE), "utf8");
  writeFileSync(path.join(root, CLASSIC_DARK_TARGET), classicDarkThemeCss(graphite));
  console.log(`Wrote ${CLASSIC_DARK_TARGET}`);
}
