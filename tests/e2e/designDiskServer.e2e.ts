import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Fork (build 32): the app server keeps the designs on disk (/__designs, runtime 5). */
describe("the app server's design store", () => {
  const port = 47900 + Math.floor(Math.random() * 90);
  const base = `http://127.0.0.1:${port}`;
  const home = mkdtempSync(join(tmpdir(), "pare-designs-"));
  let server: ChildProcess;
  const write = { "x-pare3d-send": "1", "content-type": "application/octet-stream" };

  beforeAll(async () => {
    server = spawn(process.execPath, [resolve("mac/serve.mjs")], { env: { ...process.env, PORT: String(port), HOME: home, PARE3D_RELEASES_API: "http://127.0.0.1:9/none" }, stdio: "ignore" });
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

  it("lists, saves, reads, refuses older revisions and deletes", async () => {
    const listed = await (await fetch(`${base}/__designs`)).json();
    expect(listed.runtime).toBeGreaterThanOrEqual(5);
    expect(listed.ids).toEqual([]);

    const first = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
    let answer = await (await fetch(`${base}/__designs/abc-123?revision=10`, { method: "PUT", headers: write, body: first })).json();
    expect(answer.saved).toBe(true);
    const read = await fetch(`${base}/__designs/abc-123`);
    expect(read.headers.get("x-revision")).toBe("10");
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(first);

    answer = await (await fetch(`${base}/__designs/abc-123?revision=5`, { method: "PUT", headers: write, body: new Uint8Array([9, 9, 9, 9]) })).json();
    expect(answer.saved).toBe(false);
    expect(new Uint8Array(await (await fetch(`${base}/__designs/abc-123`)).arrayBuffer())).toEqual(first);

    expect((await (await fetch(`${base}/__designs`)).json()).ids).toEqual(["abc-123"]);
    expect((await fetch(`${base}/__designs/abc-123`, { method: "DELETE", headers: write })).ok).toBe(true);
    expect((await fetch(`${base}/__designs/abc-123`)).status).toBe(404);
  });

  it("only lets the app's own page write, and only plain ids", async () => {
    expect((await fetch(`${base}/__designs/x?revision=1`, { method: "PUT", body: new Uint8Array([1, 2, 3, 4]) })).status).toBe(403);
    expect((await fetch(`${base}/__designs/x?revision=1`, { method: "PUT", headers: { ...write, origin: "https://evil.example" }, body: new Uint8Array([1, 2, 3, 4]) })).status).toBe(403);
    expect((await fetch(`${base}/__designs/..%2Fescape?revision=1`, { method: "PUT", headers: write, body: new Uint8Array([1, 2, 3, 4]) })).status).toBe(400);
  });
});
