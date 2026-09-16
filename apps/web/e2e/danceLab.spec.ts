import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The dance lab (M9h, director E6): `#/lab/dance` and `#/lab/dance/<slug>`.
 *
 * A smoke test per route — the index lists the five dances, each dance's page
 * draws every column's line, measures the length it is danced at, colours a dot
 * per checked length and picks. `DANCE_LAB_CROPS=1` writes the page and each
 * column to `data/local/dance-lab-page/`, which is gitignored; without it
 * nothing is written, so the default suite stays a smoke test.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const CROP_DIR = join(HERE, "../../..", "data/local/dance-lab-page");
const WRITE_CROPS = process.env.DANCE_LAB_CROPS === "1";

/** The five dances E6 is open on, and how many columns each page has. */
const DANCES = [
  { slug: "contrablend", columns: 4 },
  { slug: "annas-reel", columns: 4 },
  { slug: "jeremy-corners", columns: 5 },
  { slug: "the-set-monster", columns: 4 },
  { slug: "fatal-attraction", columns: 4 },
] as const;

test("the dance lab index lists the five dances", async ({ page }) => {
  await page.goto("#/lab/dance");
  await expect(page.getByTestId("dance-lab-index")).toBeVisible();
  const links = page.getByTestId("dance-lab-link");
  await expect(links).toHaveCount(DANCES.length);
  for (const { slug } of DANCES) {
    await expect(page.locator(`[data-testid="dance-lab-link"][data-slug="${slug}"]`)).toBeVisible();
  }
  // Filed under the Moves tab, beside the seam lab it is built on.
  await expect(page.getByTestId("tab-moves")).toHaveAttribute("aria-current", "page");
});

test("the seam lab points at it", async ({ page }) => {
  await page.goto("#/lab");
  await expect(page.locator('a[href="#/lab/dance"]').first()).toBeVisible();
});

for (const { slug, columns } of DANCES) {
  test(`${slug} shows its record and its readings side by side`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    // Frozen at the boundary's own beat is not useful for every dance; beat 0
    // is, because it is where the time through starts and where the loop wraps.
    await page.goto(`#/lab/dance/${slug}?beat=0`);

    const page_ = page.getByTestId("dance-lab-page");
    await expect(page_).toHaveAttribute("data-slug", slug);
    await expect(page_).toHaveAttribute("data-couples", "6");

    // A column per reading, the record first.
    const cols = page.getByTestId("dance-lab-column");
    await expect(cols).toHaveCount(columns);
    await expect(cols.nth(0)).toHaveAttribute("data-id", slug);
    await expect(cols.nth(0)).toHaveAttribute("data-letter", "A");

    // Every column that plans draws its whole line.
    const broken = await page.getByTestId("dance-lab-broken").count();
    await expect(
      page.locator('canvas[data-testid="dance-lab-canvas"][data-ready="1"]'),
    ).toHaveCount(columns - broken);

    // The numbers under each column land, and they are the oracles' own.
    await expect(page.getByTestId("dance-lab-controls")).toHaveAttribute("data-measured", "1", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("dance-lab-metrics")).toHaveCount(columns);
    await expect(page.getByTestId("dance-lab-metrics").first()).toContainText("progressed");

    // A dot per checked line length, and the one being danced is decided.
    const dots = page.getByTestId("dance-lab-dots").first().locator(".dance-lab-dot");
    expect(await dots.count()).toBeGreaterThanOrEqual(5);
    await expect(
      page.getByTestId("dance-lab-dots").first().locator('.dance-lab-dot[data-line="6"]'),
    ).toHaveAttribute("data-state", /pass|fail/);

    // The dance's own calls are the ruler, and the boundary is on it.
    await expect(page.getByTestId("dance-lab-ruler")).toBeVisible();
    await expect(page.getByTestId("dance-lab-boundary")).toBeVisible();

    // And a strip per column underneath, a frame every eight beats, every cell
    // drawn, in the same columns as every other reading's.
    const strips = page.getByTestId("dance-lab-strip");
    await expect(strips).toHaveCount(columns);
    for (let i = 0; i < columns; i++) {
      const cells = Number(await strips.nth(i).getAttribute("data-cells"));
      if (cells === 0) continue;
      await expect(strips.nth(i).locator('canvas[data-ready="1"]')).toHaveCount(cells);
    }

    // Picking shows the id the director is told, and nothing writes back.
    await page.getByTestId("dance-lab-pick-button").nth(1).click();
    await expect(page.getByTestId("dance-lab-picked")).toBeVisible();

    if (WRITE_CROPS) {
      mkdirSync(CROP_DIR, { recursive: true });
      writeFileSync(join(CROP_DIR, `page-${slug}.png`), await page.screenshot({ fullPage: true }));
      for (let i = 0; i < columns; i++) {
        const id = await cols.nth(i).getAttribute("data-id");
        writeFileSync(join(CROP_DIR, `${String(id)}.png`), await cols.nth(i).screenshot());
      }
    }
  });
}

test("a phone gets one column at a time, and the controls still fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("#/lab/dance/contrablend?beat=0");
  await expect(page.getByTestId("dance-lab-page")).toBeVisible();
  await expect(page.getByTestId("dance-lab-column")).toHaveCount(4);
  // U1: the page never scrolls sideways on a phone, whatever the line is.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  if (WRITE_CROPS) {
    mkdirSync(CROP_DIR, { recursive: true });
    writeFileSync(join(CROP_DIR, "contrablend-390.png"), await page.screenshot({ fullPage: true }));
  }
});

test("a dance the lab does not hold says so rather than blanking", async ({ page }) => {
  await page.goto("#/lab/dance/butter");
  await expect(page.getByTestId("dance-lab-missing")).toBeVisible();
});
