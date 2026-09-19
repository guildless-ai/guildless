import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.cwd(), "..", ".guildless", "visual-runs");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 }
];

async function gotoOffice(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(6000);
}

for (const vp of VIEWPORTS) {
  test(`layout @ ${vp.name}`, async ({ page }) => {
    await gotoOffice(page, vp);
    await page.screenshot({ path: path.join(OUT, `god-${vp.name}.png`) });

    const narrow = vp.width < 1200;

    // Side panels must exist and stay inside the viewport.
    const asides = page.locator("aside");
    expect(await asides.count()).toBeGreaterThan(0);
    const visible = asides.filter({ visible: true });
    const visibleCount = await visible.count();
    // On wide screens both panels are visible; on narrow screens they collapse to drawers.
    expect(visibleCount).toBeGreaterThanOrEqual(narrow ? 0 : 2);
    for (let i = 0; i < visibleCount; i += 1) {
      const box = await visible.nth(i).boundingBox();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
      }
    }

    // Minimum readable font size inside panels and footer.
    const tooSmall = await page.locator("aside, footer").evaluateAll((els) => {
      const sizes = (els as HTMLElement[]).map((e) => parseFloat(getComputedStyle(e).fontSize));
      return Math.min(...sizes, 99);
    });
    expect(tooSmall).toBeGreaterThanOrEqual(12);

    if (narrow) {
      // Drawer toggles must be available so panels can be opened.
      const toggles = page.locator("button", { hasText: "◀" }).or(page.locator("button", { hasText: "▶" }));
      expect(await toggles.count()).toBeGreaterThan(0);
    }

    // Follow Director / Engineer / Reviewer via the right panel controls.
    for (const name of ["Director", "Engineer", "Reviewer"]) {
      const button = page.getByRole("button", { name: new RegExp(name) }).first();
      if (await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, `follow-${name}-${vp.name}.png`) });
      }
    }
  });
}

test("replay ends on the real verdict", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoOffice(page, { width: 1440, height: 900 });
  await page.screenshot({ path: path.join(OUT, "replay-start.png") });

  const select = page.locator("select").first();
  const runCount = await select.locator("option").count();
  if (runCount > 1) {
    await select.selectOption({ index: 1 });
    const fast = page.getByRole("button", { name: /Fast/ });
    if (await fast.isVisible()) {
      await fast.click();
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(OUT, "replay-after.png") });
      const right = page.locator("aside", { hasText: "Active agent" });
      const verdict = await right.textContent();
      expect(verdict).toMatch(/ACCEPTED|REJECTED/);
    }
  }
});
