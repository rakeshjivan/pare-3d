// Pare 3D launcher for Windows (run by the bundled bun.exe from "Pare 3D.vbs").
// Finds or starts the local server, then opens the app in Edge or Chrome as its
// own window with its own profile; falls back to the default browser.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Pare 3D");
const profile = join(dataDir, "browser-profile");
mkdirSync(profile, { recursive: true });
const log = (line) => {
  try { appendFileSync(join(dataDir, "launcher.log"), `${new Date().toISOString()} ${line}\n`); } catch {}
};

async function isOurs(port) {
  try {
    const response = await fetch(`http://localhost:${port}/__pare3d`, { signal: AbortSignal.timeout(800) });
    return (await response.text()) === "pare3d";
  } catch {
    return false;
  }
}
async function isBusy(port) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let port = null;
let server = null;
for (const candidate of [47177, 47178, 47179, 47180, 47181]) {
  if (await isOurs(candidate)) { port = candidate; log(`reusing server on ${port}`); break; }
  if (await isBusy(candidate)) { log(`port ${candidate} used by something else`); continue; }
  server = spawn(process.execPath, [join(here, "serve.mjs")], { env: { ...process.env, PORT: String(candidate) }, stdio: "ignore", windowsHide: true, detached: true });
  for (let i = 0; i < 100 && !(await isOurs(candidate)); i += 1) await sleep(100);
  if (await isOurs(candidate)) { port = candidate; log(`started server on ${port}`); break; }
  server.kill();
  server = null;
}
if (!port) {
  log("could not start the server");
  process.exit(1);
}
const url = `http://localhost:${port}/`;

const programFiles = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
const browsers = [];
for (const base of programFiles) {
  browsers.push(join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
  browsers.push(join(base, "Google", "Chrome", "Application", "chrome.exe"));
}
const browser = browsers.find((path) => existsSync(path));
if (browser) {
  log(`using ${browser} at ${url}`);
  const appWindow = spawn(browser, [`--app=${url}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1440,900"], { stdio: "ignore", detached: true });
  appWindow.on("error", (error) => log(`browser failed: ${error.message}`));
  appWindow.unref();
  // The server is small and is reused by the next start, so it keeps running until sign-out.
} else {
  log(`no Edge or Chrome, opening ${url} in the default browser`);
  const opener = spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", windowsHide: true });
  opener.on("error", (error) => log(`could not open the browser: ${error.message}`));
}
if (server) server.unref();
