// Stands in for GitHub's releases API during the Windows check: serves a "latest release"
// whose assets are the update package just built, so the installed app's updater can be tried.
// Run with bun: bun fake-github.mjs <dist folder> <port>
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const [dist, portText] = process.argv.slice(2);
const port = Number(portText || 47300);
const origin = `http://127.0.0.1:${port}`;
createServer(async (req, res) => {
  const path = new URL(req.url, origin).pathname;
  if (path === "/latest") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      tag_name: "pare-test",
      assets: ["pare3d-update.json", "Pare-3D-app.tar.gz"].map((name) => ({ name, browser_download_url: `${origin}/files/${name}` })),
    }));
    return;
  }
  if (path.startsWith("/files/")) {
    try {
      const body = await readFile(join(dist, path.slice("/files/".length)));
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => console.log(`fake GitHub on ${origin}`));
