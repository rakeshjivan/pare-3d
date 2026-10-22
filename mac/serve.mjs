// Tiny local web server for Pare 3D. No packages needed (runs under Node or Bun).
//  - Serves the static app from ./app.
//  - /__pare3d answers "pare3d", so the launcher knows the server on the port is ours.
//  - POST /__send-to-bambu saves an exported file in Documents/Pare 3D Exports and
//    opens it in Bambu Studio.
//  - Auto-update: newer app files published as a GitHub release are downloaded,
//    checked and unpacked into the app's data folder, then served from there.
//    /__pare3d/update tells the page what happened.
//  - /__files: where exports and backups go, chosen with the system's own folder picker (runtime 3);
//    POST /__files/save writes an export there, or asks where with the system's save dialog.
//  - /__designs (runtime 5): the designs themselves, one file each in the app's data folder, so they
//    are not held in the browser engine's storage, whose quota ran out on a Mac (build 32).
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
// 4 (build 29): /__pare3d/quit, and launchers replace a server older than themselves.
// 5 (build 32): /__designs keeps the designs on disk. App files still work with 4 (they fall back
// to the browser's storage), so the update manifest's minRuntime stays 4.
const RUNTIME_VERSION = 5;
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
const DESIGNS_DIR = join(DATA_DIR, "designs");
/** Files are looked up here in order: the newest app files first, the ones before as a fallback. */
let roots = [bundledRoot];
const updateState = { serving: 0, bundled: 0, ready: 0, needsReinstall: 0, checking: false, error: "" };
const EXPORT_DIR = join(homedir(), "Documents", "Pare 3D Exports");
const BACKUP_DIR = join(homedir(), "Documents", "Pare 3D Backups");
const BACKUP_KEEP_DAYS = 14;
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

/** Same rule as for Bambu: only the app's own page, with the custom header. */
function allowedLocalWrite(req) {
  const origin = req.headers.origin;
  const ownOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  return req.headers["x-pare3d-send"] === "1" && (!origin || ownOrigins.includes(origin));
}

/**
 * Automatic backup: the page hands over the same ZIP "Back up all" makes; it is kept as one file
 * per day in Documents/Pare 3D Backups, the newest BACKUP_KEEP_DAYS days.
 */
async function writeBackup(req, res) {
  if (!allowedLocalWrite(req)) {
    json(res, 403, { error: "not allowed" });
    return;
  }
  try {
    const body = await readBody(req);
    if (body.length < 22 || body[0] !== 0x50 || body[1] !== 0x4b) throw new Error("not a backup file");
    const backupDir = (await readFileSettings()).backups;
    await mkdir(backupDir, { recursive: true });
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const name = `Pare 3D backup ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
    const file = join(backupDir, name);
    await writeFile(file, body);
    const old = (await readdir(backupDir)).filter((entry) => /^Pare 3D backup \d{4}-\d{2}-\d{2}\.zip$/.test(entry)).sort().reverse().slice(BACKUP_KEEP_DAYS);
    for (const entry of old) await rm(join(backupDir, entry), { force: true }).catch(() => {});
    json(res, 200, { path: file, folder: backupDir, at: now.getTime() });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

/*
 * The designs (runtime 5). Each is the .lyl package the page made, in DESIGNS_DIR as <id>.lyl, with
 * <id>.json holding its revision. A write goes to a temporary file first and is renamed into place,
 * so a crash never leaves half a design; one older than what is stored is refused, as the browser
 * store did. Only the app's own page may write or delete.
 */
const DESIGN_ID = /^[A-Za-z0-9_-]{1,120}$/;

async function designMeta(id) {
  try {
    const meta = JSON.parse(await readFile(join(DESIGNS_DIR, `${id}.json`), "utf8"));
    return { revision: Number(meta.revision) || 0, updatedAt: Number(meta.updatedAt) || 0 };
  } catch {
    return null;
  }
}

async function handleDesigns(req, res, url) {
  const id = decodeURIComponent(url.pathname.slice("/__designs".length).replace(/^\//, ""));
  try {
    if (!id) {
      if (req.method !== "GET") return json(res, 405, { error: "GET only" });
      let ids = [];
      try {
        ids = (await readdir(DESIGNS_DIR)).filter((name) => name.endsWith(".lyl")).map((name) => name.slice(0, -4)).filter((name) => DESIGN_ID.test(name));
      } catch {
        // No designs yet.
      }
      return json(res, 200, { runtime: RUNTIME_VERSION, folder: DESIGNS_DIR, ids });
    }
    if (!DESIGN_ID.test(id)) return json(res, 400, { error: "bad id" });
    const file = join(DESIGNS_DIR, `${id}.lyl`);
    if (req.method === "GET") {
      const meta = await designMeta(id);
      let bytes;
      try {
        bytes = await readFile(file);
      } catch {
        return json(res, 404, { error: "not found" });
      }
      res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store", "x-pare3d": "1", "x-revision": String(meta?.revision ?? 0), "x-updated-at": String(meta?.updatedAt ?? 0) });
      res.end(bytes);
      return;
    }
    if (!allowedLocalWrite(req)) return json(res, 403, { error: "not allowed" });
    if (req.method === "PUT") {
      const revision = Number(url.searchParams.get("revision"));
      if (!Number.isFinite(revision)) return json(res, 400, { error: "no revision" });
      const body = await readBody(req);
      if (body.length < 4) return json(res, 400, { error: "empty design" });
      const meta = await designMeta(id);
      if (meta && meta.revision > revision) return json(res, 200, { saved: false, revision: meta.revision });
      await mkdir(DESIGNS_DIR, { recursive: true });
      const temp = join(DESIGNS_DIR, `${id}.lyl.partial`);
      await writeFile(temp, body);
      await rename(temp, file);
      const updatedAt = Date.now();
      await writeFile(join(DESIGNS_DIR, `${id}.json`), JSON.stringify({ revision, updatedAt }));
      return json(res, 200, { saved: true, revision, updatedAt });
    }
    if (req.method === "DELETE") {
      await rm(file, { force: true });
      await rm(join(DESIGNS_DIR, `${id}.json`), { force: true });
      return json(res, 200, { deleted: true });
    }
    return json(res, 405, { error: "unknown" });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
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

/*
 * Where files go (runtime 3). Exports go to Downloads and backups to Documents/Pare 3D Backups until
 * the person picks other folders; the choice is kept in the app's data folder. The pickers are the
 * system's own (macOS through osascript, Windows through PowerShell), so they look like every other
 * app's. Text for them travels in environment variables, never inside the script.
 */
const SETTINGS_FILE = join(DATA_DIR, "files.json");
const DOWNLOADS_DIR = join(homedir(), "Downloads");

async function readFileSettings() {
  let saved = {};
  try {
    saved = JSON.parse(await readFile(SETTINGS_FILE, "utf8"));
  } catch {
    // Nothing chosen yet.
  }
  const folder = (value, fallback) => (typeof value === "string" && value.trim() ? value : fallback);
  return { exports: folder(saved.exports, DOWNLOADS_DIR), backups: folder(saved.backups, BACKUP_DIR), ask: saved.ask === true };
}

async function writeFileSettings(patch) {
  const next = { ...(await readFileSettings()), ...patch };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

/** Runs a picker; its answer is what it printed, or null when the person cancelled. */
function runPicker(command, args, env) {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    child.stdout.on("data", (chunk) => { out += chunk.toString("utf8"); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      const value = out.trim();
      // A folder comes back with a trailing slash on macOS; a drive root (C:\\, /) keeps its own.
      resolve(code === 0 && value ? (/^([A-Za-z]:[\\/]|\/)$/.test(value) ? value : value.replace(/[\\/]+$/, "")) : null);
    });
  });
}

const PS_HEAD = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false };";

function chooseFolder(prompt, start) {
  if (platform() === "darwin") {
    return runPicker("osascript", [
      "-e", "activate",
      "-e", 'set startAt to system attribute "PARE_START"',
      "-e", 'set chosen to choose folder with prompt (system attribute "PARE_PROMPT") default location (POSIX file startAt)',
      "-e", "POSIX path of chosen",
    ], { PARE_PROMPT: prompt, PARE_START: start });
  }
  if (platform() === "win32") {
    return runPicker("powershell.exe", ["-NoProfile", "-STA", "-Command",
      `${PS_HEAD} $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = $env:PARE_PROMPT; $d.SelectedPath = $env:PARE_START; $d.ShowNewFolderButton = $true; if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }`,
    ], { PARE_PROMPT: prompt, PARE_START: start });
  }
  return Promise.resolve(null);
}

function chooseSaveFile(prompt, start, name) {
  if (platform() === "darwin") {
    return runPicker("osascript", [
      "-e", "activate",
      "-e", 'set startAt to system attribute "PARE_START"',
      "-e", 'set chosen to choose file name with prompt (system attribute "PARE_PROMPT") default name (system attribute "PARE_NAME") default location (POSIX file startAt)',
      "-e", "POSIX path of chosen",
    ], { PARE_PROMPT: prompt, PARE_START: start, PARE_NAME: name });
  }
  if (platform() === "win32") {
    return runPicker("powershell.exe", ["-NoProfile", "-STA", "-Command",
      `${PS_HEAD} $d = New-Object System.Windows.Forms.SaveFileDialog; $d.Title = $env:PARE_PROMPT; $d.InitialDirectory = $env:PARE_START; $d.FileName = $env:PARE_NAME; $d.OverwritePrompt = $true; if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.FileName) }`,
    ], { PARE_PROMPT: prompt, PARE_START: start, PARE_NAME: name });
  }
  return Promise.resolve(null);
}

/** A file name from the page, made safe: no folders, no characters the systems refuse. */
function safeFileName(raw) {
  const name = basename(String(raw || "")).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().slice(0, 180);
  return name && name !== "." && name !== ".." ? name : "Pare 3D export";
}

async function freeName(folder, name) {
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let number = 1; ; number += 1) {
    const candidate = join(folder, number === 1 ? name : `${stem} ${number}${ext}`);
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
}

function showInFolder(target, isFile) {
  if (platform() === "darwin") spawn("open", isFile ? ["-R", target] : [target], { stdio: "ignore", detached: true }).unref();
  else if (platform() === "win32") spawn("explorer.exe", isFile ? [`/select,${target}`] : [target], { stdio: "ignore", detached: true }).unref();
}

/** Files saved through /__files/save this session: these may be shown in their folder wherever they are. */
const savedPaths = new Set();

async function handleFiles(req, res, url) {
  const action = url.pathname.slice("/__files".length) || "/";
  if (req.method === "GET" && action === "/") {
    json(res, 200, { ...(await readFileSettings()), downloads: DOWNLOADS_DIR, home: homedir(), platform: platform(), runtime: RUNTIME_VERSION });
    return;
  }
  if (req.method !== "POST" || !allowedLocalWrite(req)) {
    json(res, 403, { error: "not allowed" });
    return;
  }
  try {
    if (action === "/choose") {
      const which = url.searchParams.get("which") === "backups" ? "backups" : "exports";
      const current = await readFileSettings();
      const prompt = url.searchParams.get("prompt") || (which === "backups" ? "Choose where Pare 3D keeps backups" : "Choose where Pare 3D saves exports");
      const chosen = await chooseFolder(prompt, current[which]);
      json(res, 200, chosen ? { ...(await writeFileSettings({ [which]: chosen })), chosen: true } : { ...current, chosen: false });
      return;
    }
    if (action === "/reset") {
      const which = url.searchParams.get("which") === "backups" ? "backups" : "exports";
      json(res, 200, await writeFileSettings({ [which]: which === "backups" ? BACKUP_DIR : DOWNLOADS_DIR }));
      return;
    }
    if (action === "/ask") {
      json(res, 200, await writeFileSettings({ ask: url.searchParams.get("on") === "1" }));
      return;
    }
    if (action === "/show") {
      const which = url.searchParams.get("which") === "backups" ? "backups" : "exports";
      const settings = await readFileSettings();
      await mkdir(settings[which], { recursive: true }).catch(() => {});
      const file = url.searchParams.get("file");
      // Only a file inside one of the chosen folders is revealed.
      if (file && (savedPaths.has(file) || file.startsWith(settings.exports) || file.startsWith(settings.backups))) showInFolder(file, true);
      else showInFolder(settings[which], false);
      json(res, 200, { ok: true });
      return;
    }
    if (action === "/save") {
      const body = await readBody(req);
      const name = safeFileName(url.searchParams.get("name"));
      const settings = await readFileSettings();
      let target;
      if (settings.ask || url.searchParams.get("ask") === "1") {
        target = await chooseSaveFile(url.searchParams.get("prompt") || "Save", settings.exports, name);
        if (!target) {
          json(res, 200, { cancelled: true });
          return;
        }
      } else {
        await mkdir(settings.exports, { recursive: true });
        target = await freeName(settings.exports, name);
      }
      await writeFile(target, body);
      savedPaths.add(target);
      json(res, 200, { path: target, folder: target.slice(0, target.length - basename(target).length).replace(/[\\/]+$/, ""), name: basename(target) });
      return;
    }
    json(res, 404, { error: "unknown" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
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
  // Fork (build 29): a newer app asks an older server still running in the background to make way.
  if (path === "/__pare3d/quit" && req.method === "POST") {
    json(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 100);
    return;
  }
  if (path === "/__pare3d/update") {
    json(res, 200, { ...updateState, runtime: RUNTIME_VERSION });
    return;
  }
  if (path === "/__backup") {
    if (req.method === "POST") await writeBackup(req, res);
    else json(res, 200, { folder: (await readFileSettings()).backups, runtime: RUNTIME_VERSION });
    return;
  }
  if (path === "/__designs" || path.startsWith("/__designs/")) {
    await handleDesigns(req, res, url);
    return;
  }
  if (path === "/__files" || path.startsWith("/__files/")) {
    await handleFiles(req, res, url);
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
