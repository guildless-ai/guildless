import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertDebugState, assertLayout, assertionsToFindings,
  type Assertion, type DebugStateLike, type Finding
} from "../src/lib/qa";
const OUT_ROOT = path.resolve(process.cwd(), "..", ".guildless", "visual-runs");
const RUN_ID = `vr-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
const OUT = path.join(OUT_ROOT, RUN_ID);
mkdirSync(path.join(OUT, "before"), { recursive: true });
mkdirSync(path.join(OUT, "after"), { recursive: true });

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 }
];

const findings: Finding[] = [];
const assertions: Assertion[] = [];
const domEvidence: unknown[] = [];

async function readDebug(page: Page): Promise<DebugStateLike | null> {
  return page.evaluate(() => (window as unknown as { __GUILDLESS_DEBUG__?: () => unknown }).__GUILDLESS_DEBUG__?.() as DebugStateLike | null ?? null);
}

async function measureLayout(page: Page) {
  return page.evaluate(() => {
    const panels = [...document.querySelectorAll("aside")].map((a) => {
      const r = a.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const fonts = [...document.querySelectorAll("aside, footer")].map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { width: window.innerWidth, height: window.innerHeight, panels, fonts };
  });
}

/** Compact text evidence a text-only agent can reason about (images not required). */
async function collectDomEvidence(page: Page) {
  return page.evaluate(() => {
    const regions: unknown[] = [];
    for (const el of [...document.querySelectorAll("aside, footer, main")]) {
      const r = el.getBoundingClientRect();
      const children = [...el.children];
      const occupied = children.length
        ? children.reduce((acc, c) => {
            const cr = c.getBoundingClientRect();
            acc.minX = Math.min(acc.minX, cr.x);
            acc.minY = Math.min(acc.minY, cr.y);
            acc.maxX = Math.max(acc.maxX, cr.x + cr.width);
            acc.maxY = Math.max(acc.maxY, cr.y + cr.height);
            return acc;
          }, { minX: r.x, minY: r.y, maxX: r.x, maxY: r.y })
        : null;
      const area = r.width * r.height;
      const usedArea = occupied ? Math.max(0, occupied.maxX - occupied.minX) * Math.max(0, occupied.maxY - occupied.minY) : 0;
      const overflow = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
      regions.push({
        tag: el.tagName.toLowerCase(),
        box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        whitespaceRatio: area > 0 ? Number((1 - usedArea / area).toFixed(2)) : 1,
        overflow,
        fontSize: parseFloat(getComputedStyle(el).fontSize),
        text
      });
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      regions,
      links: document.querySelectorAll("a[href]").length,
      buttons: [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30)),
      selectOptions: [...document.querySelectorAll("select option")].map((o) => o.textContent?.trim().slice(0, 40))
    };
  });
}

test("autonomous product QA captures evidence and runs machine assertions", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(2500);
  const liveButton = page.getByRole("button", { name: /Live|Watch live/ });
  if (await liveButton.isVisible()) {
    await liveButton.click();
  }
  await page.waitForTimeout(6000);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, "before", `god-${vp.name}.png`) });

    for (const name of ["Director", "Engineer", "Reviewer"]) {
      const button = page.getByRole("button", { name: new RegExp(name) }).first();
      if (await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, "before", `desk-${name}-${vp.name}.png`) });
      }
    }

    const layout = await measureLayout(page);
    assertions.push(...assertLayout(layout));
    domEvidence.push(await collectDomEvidence(page));
  }

  const select = page.locator("select").first();
  const runCount = await select.locator("option").count();
  if (runCount > 1) {
    await select.selectOption({ index: 1 });
    const fast = page.getByRole("button", { name: /Fast/ });
    if (await fast.isVisible()) {
      await fast.click();
      await page.waitForTimeout(5000);
    }
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, "before", "replay-verdict.png") });

  // Settle: wait until every agent that is at a workstation is calm before reading runtime state.
  for (let i = 0; i < 40; i += 1) {
    const d = await readDebug(page);
    const allCalm = d && Object.values(d.agents).every((a) => !a.atWorkstation || a.velocity < 1.5);
    if (allCalm) break;
    await page.waitForTimeout(250);
  }

  // Capture the calm end state so the screenshot matches the runtime evidence.
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "before", "replay-verdict.png") });

  // Double-read: avoid the single-frame arrival snap racing the debug read.
  await page.waitForTimeout(800);
  const debug = await readDebug(page);
  const debug2 = await readDebug(page);
  assertions.push(...assertDebugState(debug2));
  findings.push(...assertionsToFindings(assertions, [`visual-run: ${RUN_ID}`]));

  writeFileSync(path.join(OUT, "assertions.json"), `${JSON.stringify(assertions, null, 2)}\n`, "utf8");
  writeFileSync(path.join(OUT, "findings.json"), `${JSON.stringify(findings, null, 2)}\n`, "utf8");
  writeFileSync(path.join(OUT, "evidence.json"), `${JSON.stringify({ runId: RUN_ID, debug, assertions }, null, 2)}\n`, "utf8");
  writeFileSync(path.join(OUT, "dom-evidence.json"), `${JSON.stringify(domEvidence, null, 2)}\n`, "utf8");
  writeFileSync(path.join(OUT, "run-id.txt"), RUN_ID, "utf8");

  const critical = findings.filter((finding) => finding.severity === "critical");
  test.info().annotations.push({ type: "run-id", description: RUN_ID });
  if (critical.length > 0) {
    throw new Error(`critical findings: ${critical.map((f) => f.id).join(", ")}`);
  }
});
