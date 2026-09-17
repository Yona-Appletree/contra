import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * M10 P5: `#/spikes` lists the repo's visual spikes, and every link really
 * points at something the build produced — `apps/web/dist/spikes/<slug>/`,
 * which `scripts/copy-spikes.mjs` copies from the repo-root `spikes/`
 * directory as part of `pnpm --filter @caller/web build` (this suite's
 * `test:golden` depends on `build`, per `turbo.json`, so `dist/` is already
 * current by the time this runs). This proves the wiring — one link per
 * spike, each resolving to a real `index.html` — not the spikes' own content.
 */
const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

test("#/spikes lists every spike, each pointing at one the build copied", async ({ page }) => {
  await page.goto("#/spikes");

  const links = page.getByTestId("spike-link");
  await expect(links).toHaveCount(5);

  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs).toEqual([
    "/contra/spikes/hall/",
    "/contra/spikes/two-dancers/",
    "/contra/spikes/move-motion/",
    "/contra/spikes/moves-by-shape/",
    "/contra/spikes/hall-page/",
  ]);

  for (const href of hrefs) {
    const slug = href?.replace(/^\/contra\/spikes\//, "").replace(/\/$/, "");
    const target = join(DIST_DIR, "spikes", String(slug), "index.html");
    expect(existsSync(target), `${target} missing after build`).toBe(true);
  }
});
