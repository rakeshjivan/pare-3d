// Drives the real Windows app's window (WebView2) through its debugging port: the home screen
// must show, a starter design must open in the editor, and no page errors may happen.
// Screenshots go to the folder given as the first argument.
import { chromium } from "playwright-core";

const out = process.argv[2] || ".";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 60000 });
const context = browser.contexts()[0];
const deadline = Date.now() + 60000;
let page;
while (!page && Date.now() < deadline) {
  page = context.pages().find((entry) => entry.url().startsWith("http://localhost:"));
  if (!page) await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!page) throw new Error("the app window never loaded the app: " + context.pages().map((p) => p.url()).join(", "));
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
console.log("app page:", page.url());
await page.waitForSelector(".dashboard-actions-band", { timeout: 120000 });
await page.screenshot({ path: `${out}/windows-home.png` });
const build = await page.locator(".pare-build-badge, [class*=build-badge]").first().textContent().catch(() => "");
console.log("build badge:", build);
await page.locator('[data-starter="box"]').click();
await page.waitForSelector(".toolbar-section", { timeout: 120000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/windows-editor.png` });
const shapes = await page.locator("canvas").count();
console.log("canvases:", shapes);
if (shapes < 1) throw new Error("the 3D view did not appear");
if (errors.length) throw new Error("page errors: " + errors.join(" | "));
console.log("Windows app check passed");
await browser.close();
