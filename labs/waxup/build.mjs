// Bundles the lab into one HTML file (dist/waxup-lab.html): the app, three.js, Pare 3D's Dental Studio
// code, and the manifold and unrar wasm, inline.
import esbuild from "../../node_modules/esbuild-wasm/lib/main.js";
const { build } = esbuild;
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const result = await build({
  entryPoints: [resolve(import.meta.dirname, "src/main.ts")],
  bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", minify: true,
  alias: { "@": resolve(root, "apps/web/src") },
  nodePaths: [resolve(root, "node_modules")],
  loader: { ".wasm": "binary" },
  external: ["node:*", "fs", "path", "url", "module", "worker_threads", "crypto"],
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "var process = globalThis.process || { env: {} };" },
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
const html = readFileSync(resolve(import.meta.dirname, "page.html"), "utf8").replace("/*BUNDLE*/", () => js);
mkdirSync(resolve(import.meta.dirname, "dist"), { recursive: true });
writeFileSync(resolve(import.meta.dirname, "dist/waxup-lab.html"), html);
console.log(`dist/waxup-lab.html ${(html.length / 1048576).toFixed(2)} MB`);
// The published page: the Artifact host wraps the content in its own document, so the wrapper goes.
const page = html.replace(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/i, "").replace(/<\/head>\s*<body>/i, "").replace(/<\/body>\s*<\/html>\s*$/i, "");
writeFileSync(resolve(import.meta.dirname, "dist/waxup-lab-page.html"), page);
