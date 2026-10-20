// Tiny local web server for Pare 3D. No packages needed (runs under Node or Bun).
//  - Serves the static app from ./app.
//  - /__pare3d answers "pare3d", so the launcher knows the server on the port is ours.
//  - POST /__send-to-bambu saves an exported file in Documents/Pare 3D Exports and
//    opens it in Bambu Studio.
//  - Auto-update: newer app files published as a GitHub release are downloaded,
//    checked and unpacked into the app's data folder, then served from there.
//    /__pare3d/update tells the page what happened.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const bundledRoot = join(fileURLToPath(new URL(".", import.meta.url)), "app");
const port = Number(process.env.PORT || 47177);
/** Raise when the launcher or this server change in a way new app files depend on. */
const RUNTIME_VERSION = 1;
const RELEASES_API = process.env.PARE3D_RELEASES_API || "https://api.github.com/repos/rakeshjivan/pare-3d/releases/latest";
// Only for the automated tests: lets a local test server stand in for GitHub.
const TEST_ORIGIN = process.env.PARE3D_TEST_ORIGIN || "";
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;
const DATA_DIR = platform() === "win32"
  ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Pare 3D")
  : platform() === "darwin"
    ? join(homedir(), "Library", "Application Support", "Pare 3D")
    : join(homedir(), ".pare3d");
const UPDATES_DIR = join(DATA_DIR, "updates");
/** Files are looked up here in order: the newest app files first, the ones before as a fallback. */
let roots = [bundledRoot];
const updateState = { serving: 0, bundled: 0, ready: 0, needsReinstall: 0, checking: false, error: "" };
const EXPORT_DIR = join(homedir(), "Documents", "Pare 3D Exports");
const MAX_UPLOAD = 512 * 1024 * 1024;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8", ".mp4": "video/mp4", ".webp": "image/webp",
};

async function resolveIn(root, urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, safe);
  if (!file.startsWith(root)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    await stat(file);
    return file;
  } catch {
    try { await stat(file + ".html"); return file + ".html"; } catch { return null; }
  }
}

/** A page opened before an update may still ask for its old files: they come from the older folder. */
async function resolveFile(urlPath) {
  for (const root of roots) {
    const file = await resolveIn(root, urlPath);
    if (file) return file;
  }
  return null;
}

/** Files whose names carry a version or a content hash never change: the browser may keep them. */
function cacheControl(path) {
  if (path.startsWith("/_next/static/") || /^\/occt\/[^/]+\//.test(path) || path.startsWith("/fonts/")) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD) {
        reject(new Error("file too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function run(command, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function openInBambuStudio(file) {
  if (platform() === "darwin") {
    for (const app of ["BambuStudio", "Bambu Studio"]) {
      if (await run("/usr/bin/open", ["-a", app, file])) return { opened: true };
    }
    return { opened: false, error: "Bambu Studio not found" };
  }
  if (platform() === "win32") {
    const candidates = [
      join(process.env.ProgramFiles || "C:\\Program Files", "Bambu Studio", "bambu-studio.exe"),
      join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Programs", "Bambu Studio", "bambu-studio.exe"),
    ];
    for (const exe of candidates) {
      if (await exists(exe)) {
        // Started detached; Bambu Studio keeps running after this answers.
        const child = spawn(exe, [file], { detached: true, stdio: "ignore" });
        child.unref();
        return { opened: true };
      }
    }
    return { opened: false, error: "Bambu Studio not found" };
  }
  return { opened: false, error: "not supported on this system" };
}

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json", "x-pare3d": "1" });
  res.end(JSON.stringify(value));
}

async function sendToBambu(req, res, url) {
  // Only the app's own page may use this: a custom header (which forces a CORS preflight that
  // this server never approves) and, when the browser names one, our own origin.
  const origin = req.headers.origin;
  const ownOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  if (req.headers["x-pare3d-send"] !== "1" || (origin && !ownOrigins.includes(origin))) {
    json(res, 403, { error: "not allowed" });
    return;
  }
  const requested = basename(url.searchParams.get("name") || "Pare 3D design.stl");
  const extension = extname(requested).toLowerCase();
  if (extension !== ".stl" && extension !== ".3mf") {
    json(res, 400, { error: "only STL or 3MF" });
    return;
  }
  const name = requested.replace(/[^\w .()+-]/g, "_").slice(0, 120) || `design${extension}`;
  try {
    const body = await readBody(req);
    await mkdir(EXPORT_DIR, { recursive: true });
    const file = join(EXPORT_DIR, name);
    await writeFile(file, body);
    const result = await openInBambuStudio(file);
    json(res, 200, { path: file, ...result });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

async function buildOf(root) {
  try {
    const value = Number((await readFile(join(root, "pare-build.txt"), "utf8")).trim());
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** At start: the newest complete app folder, the bundled one if nothing newer was installed. */
async function chooseRoots() {
  updateState.bundled = await buildOf(bundledRoot);
  let best = { root: bundledRoot, build: updateState.bundled };
  try {
    for (const name of await readdir(UPDATES_DIR)) {
      const match = /^app-(\d+)$/.exec(name);
      if (!match) continue;
      const root = join(UPDATES_DIR, name);
      const build = await buildOf(root);
      if (build === Number(match[1]) && build > best.build && (await resolveIn(root, "/"))) best = { root, build };
    }
  } catch {
    // No updates folder yet.
  }
  roots = best.root === bundledRoot ? [bundledRoot] : [best.root, bundledRoot];
  updateState.serving = best.build;
}

/** Only files from GitHub's own release storage, over HTTPS. */
function trustedDownload(url) {
  try {
    if (TEST_ORIGIN && url.startsWith(TEST_ORIGIN)) return true;
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "github.com" || hostname.endsWith(".githubusercontent.com"));
  } catch {
    return false;
  }
}

async function download(url) {
  if (!trustedDownload(url)) throw new Error(`untrusted download ${url}`);
  const response = await fetch(url, { redirect: "follow", headers: { accept: "application/octet-stream" } });
  if (!response.ok || !trustedDownload(response.url)) throw new Error(`download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function checkForUpdate() {
  if (updateState.checking || updateState.serving <= 0) return;
  updateState.checking = true;
  try {
    const response = await fetch(RELEASES_API, { headers: { accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const release = await response.json();
    const asset = (name) => (release.assets || []).find((entry) => entry.name === name)?.browser_download_url;
    const manifestUrl = asset("pare3d-update.json");
    const packageUrl = asset("Pare-3D-app.tar.gz");
    if (!manifestUrl || !packageUrl) return;
    const manifest = JSON.parse((await download(manifestUrl)).toString("utf8"));
    const build = Number(manifest.build);
    if (!Number.isFinite(build) || build <= Math.max(updateState.serving, updateState.ready)) return;
    if (Number(manifest.minRuntime || 1) > RUNTIME_VERSION) {
      // These app files need a newer launcher: the page offers the full download instead.
      updateState.needsReinstall = build;
      return;
    }
    const bytes = await download(packageUrl);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== String(manifest.sha256).toLowerCase()) throw new Error("checksum does not match");
    await mkdir(UPDATES_DIR, { recursive: true });
    const temp = join(UPDATES_DIR, `app-${build}.partial`);
    const archive = join(UPDATES_DIR, `app-${build}.tar.gz`);
    await rm(temp, { recursive: true, force: true });
    await mkdir(temp, { recursive: true });
    await writeFile(archive, bytes);
    // tar ships with macOS and with Windows 10 and 11.
    const tar = platform() === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
    if (!(await run(tar, ["-xzf", archive, "-C", temp]))) throw new Error("could not unpack the update");
    await rm(archive, { force: true });
    if ((await buildOf(temp)) !== build || !(await resolveIn(temp, "/"))) throw new Error("the update is incomplete");
    const finalRoot = join(UPDATES_DIR, `app-${build}`);
    await rm(finalRoot, { recursive: true, force: true });
    await rename(temp, finalRoot);
    // Served at once; the open page notices the new version and offers to reload.
    roots = [finalRoot, ...roots.filter((root) => root !== finalRoot)].slice(0, 2);
    updateState.ready = build;
    updateState.serving = build;
    updateState.error = "";
    // Older downloaded folders are no longer needed.
    for (const name of await readdir(UPDATES_DIR)) {
      const match = /^app-(\d+)$/.exec(name);
      if (match && Number(match[1]) < build && !roots.includes(join(UPDATES_DIR, name))) {
        await rm(join(UPDATES_DIR, name), { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (error) {
    updateState.error = error instanceof Error ? error.message : String(error);
  } finally {
    updateState.checking = false;
  }
}

await chooseRoots();

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (path === "/__pare3d") {
    res.writeHead(200, { "content-type": "text/plain", "x-pare3d": "1" });
    res.end("pare3d");
    return;
  }
  if (path === "/__pare3d/update") {
    json(res, 200, { ...updateState, runtime: RUNTIME_VERSION });
    return;
  }
  if (path === "/__send-to-bambu") {
    if (req.method === "POST") await sendToBambu(req, res, url);
    else json(res, 405, { error: "POST only" });
    return;
  }
  const file = await resolveFile(path);
  if (!file) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(join(roots[0], "404.html")).catch(() => "Not found"));
    return;
  }
  res.writeHead(200, {
    "content-type": types[extname(file).toLowerCase()] || "application/octet-stream",
    "cache-control": cacheControl(path),
    "x-pare3d": "1",
  });
  res.end(await readFile(file));
}).listen(port, "127.0.0.1", () => console.log(`Pare 3D running at http://localhost:${port}/  (close this window to stop)`));

setTimeout(() => void checkForUpdate(), 5000);
setInterval(() => void checkForUpdate(), UPDATE_EVERY_MS);
