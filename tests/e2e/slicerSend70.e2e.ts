import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Build 70: the app server sends a design to the chosen slicer (runtime 6). */
describe("the app server's send to a slicer", () => {
  const port = 47800 + Math.floor(Math.random() * 90);
  const base = `http://127.0.0.1:${port}`;
  const home = mkdtempSync(join(tmpdir(), "pare-slicers-"));
  const bin = join(home, "bin");
  const opened = join(home, "opened.txt");
  let server: ChildProcess;
  const send = { "x-pare3d-send": "1", "content-type": "application/octet-stream" };

  beforeAll(async () => {
    // Stand-ins for two installed slicers: they write down the file they were asked to open.
    mkdirSync(bin);
    for (const command of ["prusa-slicer", "chitubox"]) {
      writeFileSync(join(bin, command), `#!/bin/sh\necho "${command} $1" >> "${opened}"\n`);
      chmodSync(join(bin, command), 0o755);
    }
    server = spawn(process.execPath, [resolve("mac/serve.mjs")], {
      env: { ...process.env, PORT: String(port), HOME: home, PATH: `${bin}:/usr/bin:/bin`, PARE3D_RELEASES_API: "http://127.0.0.1:9/none" },
      stdio: "ignore",
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await fetch(`${base}/__pare3d`)).ok) return;
      } catch {
        // not up yet
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error("server did not start");
  });
  afterAll(() => {
    server?.kill();
    rmSync(home, { recursive: true, force: true });
  });

  it("says which slicers are installed", async () => {
    const answer = await (await fetch(`${base}/__slicers`)).json();
    expect(answer.runtime).toBeGreaterThanOrEqual(6);
    expect(answer.installed).toEqual(["prusa", "chitubox"]);
    expect(answer.names.preform).toBe("PreForm");
  });

  it("saves the file in Pare 3D Exports and opens it in the chosen slicer", async () => {
    const stl = new Uint8Array([1, 2, 3, 4, 5]);
    const answer = await (await fetch(`${base}/__send-to-slicer?app=chitubox&name=Upper%20model.stl`, { method: "POST", headers: send, body: stl })).json();
    expect(answer.opened).toBe(true);
    const file = join(home, "Documents", "Pare 3D Exports", "Upper model.stl");
    expect(answer.path).toBe(file);
    expect(new Uint8Array(readFileSync(file))).toEqual(stl);
    for (let attempt = 0; attempt < 50 && !existsSync(opened); attempt += 1) await new Promise((done) => setTimeout(done, 50));
    expect(readFileSync(opened, "utf8").trim()).toBe(`chitubox ${file}`);
  });

  it("saves the file but says so when the slicer is not installed", async () => {
    const answer = await (await fetch(`${base}/__send-to-slicer?app=preform&name=a.3mf`, { method: "POST", headers: send, body: new Uint8Array([7]) })).json();
    expect(answer.opened).toBe(false);
    expect(answer.error).toMatch(/PreForm not found/);
    expect(existsSync(answer.path)).toBe(true);
    // The route builds before 70 used still answers, for Bambu Studio.
    const older = await (await fetch(`${base}/__send-to-bambu?name=b.stl`, { method: "POST", headers: send, body: new Uint8Array([7]) })).json();
    expect(older.opened).toBe(false);
    expect(older.error).toMatch(/Bambu Studio not found/);
  });

  it("refuses other pages, other slicers and other file types", async () => {
    expect((await fetch(`${base}/__send-to-slicer?app=prusa&name=a.stl`, { method: "POST", body: new Uint8Array([1]) })).status).toBe(403);
    expect((await fetch(`${base}/__send-to-slicer?app=prusa&name=a.stl`, { method: "POST", headers: { ...send, origin: "https://evil.example" }, body: new Uint8Array([1]) })).status).toBe(403);
    expect((await fetch(`${base}/__send-to-slicer?app=calc&name=a.stl`, { method: "POST", headers: send, body: new Uint8Array([1]) })).status).toBe(400);
    expect((await fetch(`${base}/__send-to-slicer?app=prusa&name=a.sh`, { method: "POST", headers: send, body: new Uint8Array([1]) })).status).toBe(400);
  });
});
