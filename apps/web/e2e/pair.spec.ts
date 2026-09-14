import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * The pair page (M5): two golden frames, and one strip per figure.
 *
 * The strips are the gate G1 artifact — one rendered frame per beat of each
 * figure at zoom 6 — and are written to `e2e/strips/` on every run, so a
 * reviewer can look at exactly what the current code draws. Only the goldens
 * are compared; `pnpm --filter @caller/web test:golden:update` rewrites them.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, "golden");
const STRIP_DIR = join(HERE, "strips");

/** Plan's validation strategy: a golden may differ by half a per cent of its pixels. */
const TOLERANCE = 0.005;
const PIXEL_THRESHOLD = 0.1;

const UPDATE = process.env["UPDATE_GOLDENS"] === "1";

/**
 * Beats 6 and 20 come from the milestone brief; beat 12 is the middle of the
 * first swing, which the brief's label meant and its number missed (the
 * sequence puts the balance at 4–8 and the swing at 8–16).
 */
const GOLDEN_BEATS: Array<{ name: string; beat: number; what: string }> = [
  { name: "pair-beat-6", beat: 6, what: "mid balance" },
  { name: "pair-beat-12", beat: 12, what: "mid swing" },
  { name: "pair-beat-20", beat: 20, what: "mid allemande" },
];

/** Every call of the 64-beat sequence, in order, as the page indexes them. */
const FIGURES: Array<{ index: number; name: string; beats: number }> = [
  { index: 0, name: "01-walk-in", beats: 4 },
  { index: 1, name: "02-balance", beats: 4 },
  { index: 2, name: "03-swing-2-turns", beats: 8 },
  { index: 3, name: "04-allemande-left-1.5", beats: 8 },
  { index: 4, name: "05-do-si-do", beats: 8 },
  { index: 5, name: "06-balance-taking-hands", beats: 4 },
  { index: 6, name: "07-swing-2.5-turns", beats: 12 },
  { index: 7, name: "08-allemande-left-once", beats: 8 },
  { index: 8, name: "09-fall-back", beats: 8 },
];

for (const { name, beat, what } of GOLDEN_BEATS) {
  test(`pair golden: beat ${beat} (${what})`, async ({ page }) => {
    await page.goto(`#/pair?beat=${beat}&zoom=6`);
    await page.waitForFunction(() => document.documentElement.dataset["pairReady"] === "true");
    const actual = await page.getByTestId("pair-canvas").screenshot();
    const file = join(GOLDEN_DIR, `${name}.png`);

    if (UPDATE) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(file, actual);
      test.info().annotations.push({ type: "golden", description: `updated ${name}.png` });
      return;
    }

    const expected = PNG.sync.read(readFileSync(file));
    const got = PNG.sync.read(actual);
    expect(
      { width: got.width, height: got.height },
      `${name}: the frame changed size; the golden is stale`,
    ).toEqual({ width: expected.width, height: expected.height });

    const diff = new PNG({ width: expected.width, height: expected.height });
    const differing = pixelmatch(
      expected.data,
      got.data,
      diff.data,
      expected.width,
      expected.height,
      {
        threshold: PIXEL_THRESHOLD,
      },
    );
    const fraction = differing / (expected.width * expected.height);
    if (fraction > TOLERANCE) {
      await test.info().attach(`${name}-actual.png`, { body: actual, contentType: "image/png" });
      await test
        .info()
        .attach(`${name}-diff.png`, { body: PNG.sync.write(diff), contentType: "image/png" });
    }
    expect(
      fraction,
      `${name}: ${differing} px differ (${(fraction * 100).toFixed(3)}%)`,
    ).toBeLessThanOrEqual(TOLERANCE);
  });
}

test("per-figure strips at zoom 6 (gate G1 artifact)", async ({ page }) => {
  await page.setViewportSize({ width: 4000, height: 400 });
  mkdirSync(STRIP_DIR, { recursive: true });
  for (const { index, name, beats } of FIGURES) {
    await page.goto(`#/pair?strip=${index}&zoom=6&bare=1`);
    const strip = page.getByTestId("pair-strip");
    await expect(strip).toHaveAttribute("data-figure", /./);
    await expect(strip.locator('canvas[data-ready="1"]')).toHaveCount(beats);
    const png = await strip.screenshot();
    writeFileSync(join(STRIP_DIR, `${name}.png`), png);
    await test.info().attach(`strip-${name}.png`, { body: png, contentType: "image/png" });
  }
});

test("the pair page plays, scrubs and pauses", async ({ page }) => {
  await page.goto("#/pair");
  await page.waitForFunction(() => document.documentElement.dataset["pairReady"] === "true");
  await expect(page.getByTestId("pair-readout")).toContainText("Walk in");

  // Gate G1 ruling D: the selector is 1, 2, 3, 4, 6 and opens at 2.
  await expect(page.getByTestId("pair-zoom-2")).toHaveAttribute("aria-pressed", "true");
  for (const z of [1, 3, 4, 6]) {
    await expect(page.getByTestId(`pair-zoom-${String(z)}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
  await expect(page.getByTestId("pair-zoom-8")).toHaveCount(0);

  await page.getByTestId("pair-play").click();
  await expect(page.getByTestId("pair-play")).toHaveText("Play");

  await page.getByTestId("pair-scrub").fill("20");
  await expect(page.getByTestId("pair-readout")).toContainText("Allemande left 1½");

  await page.getByTestId("pair-scrub").fill("40");
  await expect(page.getByTestId("pair-readout")).toContainText("Swing 2.5 turns");
});

test("the figure strip toggles and shows one frame per beat", async ({ page }) => {
  await page.goto("#/pair?beat=12&zoom=4");
  await page.getByTestId("pair-strip-toggle").click();
  const strip = page.getByTestId("pair-strip");
  await expect(strip).toHaveAttribute("data-figure", "swing");
  await expect(strip.locator('canvas[data-ready="1"]')).toHaveCount(8);
});
