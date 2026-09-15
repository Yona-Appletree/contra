import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The seam lab (M3, gate G1): `#/lab` and `#/lab/seam/<a>--<b>`.
 *
 * A smoke test per route, plus the crop the pull request shows — the seam,
 * frozen on the boundary, both treatments side by side and a strip of each
 * underneath. `LAB_CROPS=1` writes those crops to `data/local/seam-lab/`,
 * which is gitignored; without it nothing is written and the assertions are
 * all that run, so the default suite stays a smoke test.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const CROP_DIR = join(HERE, "../../..", "data/local/seam-lab");
const WRITE_CROPS = process.env.LAB_CROPS === "1";

/** The seams the lab ships links to; it opens any seam key the corpus has. */
const SEAMS = ["hey--swing", "hey--balance-and-swing", "allemande--swing"] as const;

test("the lab index lists the seams it ships", async ({ page }) => {
  await page.goto("#/lab");
  await expect(page.getByTestId("lab-index")).toBeVisible();
  const links = page.getByTestId("lab-seam-link");
  await expect(links).toHaveCount(SEAMS.length);
  for (const key of SEAMS) {
    await expect(
      page
        .getByTestId("lab-seam-link")
        .filter({ hasText: key.replace("--", " → ") })
        .first(),
    ).toBeVisible();
  }
  // The Moves tab is the one this route is filed under.
  await expect(page.getByTestId("tab-moves")).toHaveAttribute("aria-current", "page");
});

test("the Moves page links to the lab", async ({ page }) => {
  await page.goto("#/moves");
  await expect(page.getByTestId("moves-lab-link")).toHaveAttribute("href", "#/lab");
});

for (const key of SEAMS) {
  test(`the lab dances ${key} through both engines at once`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    // Frozen on the boundary: beat 0 of the lab's own count is the seam.
    await page.goto(`#/lab/seam/${key}?beat=0`);

    const treatments = page.getByTestId("lab-treatment");
    await expect(treatments).toHaveCount(2);
    await expect(treatments.nth(0)).toHaveAttribute("data-engine", "old");
    await expect(treatments.nth(1)).toHaveAttribute("data-engine", "new");

    // Both tiles draw, and both strips draw every cell they claim.
    await expect(page.locator('canvas[data-testid="moves-canvas"][data-ready="1"]')).toHaveCount(2);
    const strips = page.getByTestId("lab-strip");
    await expect(strips).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const strip = strips.nth(i);
      const cells = Number(await strip.getAttribute("data-cells"));
      // Four beats before the boundary and eight after, a frame a beat.
      expect(cells).toBe(12);
      await expect(strip.locator('canvas[data-ready="1"]')).toHaveCount(cells);
    }

    // The oracle's numbers land for both treatments, and the lab says how far
    // apart the two are before it asks which is right.
    await expect(page.getByTestId("lab-controls")).toHaveAttribute("data-measured", "1");
    await expect(page.getByTestId("moves-metrics")).toHaveCount(2);
    await expect(page.getByTestId("lab-divergence")).toHaveAttribute("data-px", /^\d/);

    if (WRITE_CROPS) {
      mkdirSync(CROP_DIR, { recursive: true });
      for (let i = 0; i < 2; i++) {
        const engine = i === 0 ? "old" : "new";
        writeFileSync(
          join(CROP_DIR, `${key}-${engine}-tile.png`),
          await treatments.nth(i).screenshot(),
        );
        writeFileSync(
          join(CROP_DIR, `${key}-${engine}-strip.png`),
          await strips.nth(i).screenshot(),
        );
      }
      writeFileSync(
        join(CROP_DIR, `${key}-strips.png`),
        await page.getByTestId("lab-strips").screenshot(),
      );
      writeFileSync(join(CROP_DIR, `${key}-page.png`), await page.screenshot({ fullPage: true }));
    }
  });
}

test("an unknown seam says so rather than blanking", async ({ page }) => {
  await page.goto("#/lab/seam/not--a-seam");
  await expect(page.getByTestId("lab-missing")).toBeVisible();
});
