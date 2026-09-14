import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * Golden frames for `@caller/hall`.
 *
 * Each fixture is rendered by the hidden `#/frame` route at zoom 6 and
 * compared with the committed PNG. Rewrite them with
 * `pnpm --filter @caller/web test:golden:update` (or `UPDATE_GOLDENS=1`), and
 * say so in the pull request when you do.
 */
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "golden");

/** Plan's validation strategy: a golden may differ by half a per cent of its pixels. */
const TOLERANCE = 0.005;

/** Per-pixel colour distance below which two pixels count as the same. */
const PIXEL_THRESHOLD = 0.1;

/**
 * Each golden: a fixture, the zoom it is judged at, and the file it lives in.
 * The dancer fixtures are judged at 6× (one dancer fills the frame); the hall
 * is judged at 1×, which is a phone, and 3×, which is a laptop and the zoom the
 * bubble has to be legible at.
 */
const GOLDENS: Array<{ name: string; zoom: number; file: string }> = [
  { name: "facings", zoom: 6, file: "facings.png" },
  { name: "two-hand-hold", zoom: 6, file: "two-hand-hold.png" },
  { name: "swing", zoom: 6, file: "swing.png" },
  { name: "hall-empty-2-lines", zoom: 1, file: "hall-empty-2-lines@1x.png" },
  { name: "hall-empty-2-lines", zoom: 3, file: "hall-empty-2-lines@3x.png" },
  { name: "hall-bubble", zoom: 3, file: "hall-bubble@3x.png" },
];

const UPDATE = process.env["UPDATE_GOLDENS"] === "1";

for (const golden of GOLDENS) {
  const { name, zoom } = golden;
  test(`golden frame: ${name} at ${zoom}×`, async ({ page }) => {
    const actual = await captureFixture(page, name, zoom);
    const file = join(GOLDEN_DIR, golden.file);

    if (UPDATE) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(file, actual);
      test.info().annotations.push({ type: "golden", description: `updated ${golden.file}` });
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
      await test
        .info()
        .attach(`${golden.file}-actual.png`, { body: actual, contentType: "image/png" });
      await test
        .info()
        .attach(`${golden.file}-diff.png`, {
          body: PNG.sync.write(diff),
          contentType: "image/png",
        });
    }
    expect(
      fraction,
      `${golden.file}: ${differing} px differ (${(fraction * 100).toFixed(3)}%)`,
    ).toBeLessThanOrEqual(TOLERANCE);
  });
}

test("the frame route says so when a fixture does not exist", async ({ page }) => {
  await page.goto("#/frame?fixture=not-a-fixture&zoom=6");
  await expect(page.getByTestId("frame-error")).toContainText("no fixture named");
});

async function captureFixture(
  page: import("@playwright/test").Page,
  name: string,
  zoom: number,
): Promise<Buffer> {
  await page.goto(`#/frame?fixture=${name}&zoom=${zoom}`);
  await page.waitForFunction(() => document.documentElement.dataset["frameReady"] === "true");
  return page.getByTestId("frame-canvas").screenshot();
}
