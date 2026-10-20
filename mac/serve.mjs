// Tiny local web server for Pare 3D. No packages needed (runs under Node or Bun).
//  - Serves the static app from ./app.
//  - /__pare3d answers "pare3d", so the launcher knows the server on the port is ours.
//  - POST /__send-to-bambu saves an exported file in Documents/Pare 3D Exports and
//    opens it in Bambu Studio (macOS).
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "app");
const port = Number(process.env.PORT || 47177);
const EXPORT_DIR = join(homedir(), "Documents", "Pare 3D Exports");
const MAX_UPLOAD = 512 * 1024 * 1024;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8", ".mp4": "video/mp4", ".webp": "image/webp",
};

async function resolveFile(urlPath) {
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

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (path === "/__pare3d") {
    res.writeHead(200, { "content-type": "text/plain", "x-pare3d": "1" });
    res.end("pare3d");
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
    res.end(await readFile(join(root, "404.html")).catch(() => "Not found"));
    return;
  }
  res.writeHead(200, {
    "content-type": types[extname(file).toLowerCase()] || "application/octet-stream",
    "cache-control": cacheControl(path),
    "x-pare3d": "1",
  });
  res.end(await readFile(file));
}).listen(port, "127.0.0.1", () => console.log(`Pare 3D running at http://localhost:${port}/  (close this window to stop)`));
