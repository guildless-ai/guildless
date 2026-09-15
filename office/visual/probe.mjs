import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const port = 3217;
const { spawn } = await import("node:child_process");
const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: process.cwd(),
  stdio: "ignore"
});
await new Promise((r) => setTimeout(r, 8000));

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(8000);

const gl = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const ctx = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
  const renderer = ctx ? { ok: true, vendor: String(ctx.getParameter(ctx.VENDOR)) } : { ok: false };
  return { hasCanvas: !!canvas, renderer };
});
const shot = await page.screenshot({ path: "outputs/qa-probe.png" });
const size = shot.length;
console.log("webgl:", JSON.stringify(gl));
console.log("screenshot bytes:", size);
console.log("errors:", errors.slice(0, 5).join(" | "));
await browser.close();
server.kill();
writeFileSync("outputs/qa-probe.json", JSON.stringify({ gl, size, errors }, null, 2));
