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

const FIXTURES = ["facings", "two-hand-hold", "swing"];

const UPDATE = process.env["UPDATE_GOLDENS"] === "1";

for (const name of FIXTURES) {
  test(`golden frame: ${name}`, async ({ page }) => {
    const actual = await captureFixture(page, name);
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

test("the frame route says so when a fixture does not exist", async ({ page }) => {
  await page.goto("#/frame?fixture=not-a-fixture&zoom=6");
  await expect(page.getByTestId("frame-error")).toContainText("no fixture named");
});

async function captureFixture(
  page: import("@playwright/test").Page,
  name: string,
): Promise<Buffer> {
  await page.goto(`#/frame?fixture=${name}&zoom=6`);
  await page.waitForFunction(() => document.documentElement.dataset["frameReady"] === "true");
  return page.getByTestId("frame-canvas").screenshot();
}
