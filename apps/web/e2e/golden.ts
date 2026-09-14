import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * Comparing a canvas against a committed PNG, with the plan's own tolerance.
 *
 * `frame.spec.ts` has its own copy of this from M3 and is deliberately left
 * alone — it guards the goldens gate G1 was decided on — so this is the
 * version the front page's goldens use.
 */

export const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "golden");

/** Plan's validation strategy: a golden may differ by half a per cent of its pixels. */
const TOLERANCE = 0.005;

/** Per-pixel colour distance below which two pixels count as the same. */
const PIXEL_THRESHOLD = 0.1;

const UPDATE = process.env["UPDATE_GOLDENS"] === "1";

/** Compare `actual` with the committed `file`, or rewrite it when updating. */
export async function matchGolden(file: string, actual: Buffer): Promise<void> {
  const path = join(GOLDEN_DIR, file);
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, actual);
    test.info().annotations.push({ type: "golden", description: `updated ${file}` });
    return;
  }

  const expected = PNG.sync.read(readFileSync(path));
  const got = PNG.sync.read(actual);
  expect(
    { width: got.width, height: got.height },
    `${file}: the frame changed size; the golden is stale`,
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
    await test.info().attach(`${file}-actual.png`, { body: actual, contentType: "image/png" });
    await test
      .info()
      .attach(`${file}-diff.png`, { body: PNG.sync.write(diff), contentType: "image/png" });
  }
  expect(
    fraction,
    `${file}: ${differing} px differ (${(fraction * 100).toFixed(3)}%)`,
  ).toBeLessThanOrEqual(TOLERANCE);
}

/** Open the front page frozen at one beat and one zoom, and wait for it to draw. */
export async function openHall(
  page: Page,
  query: { dance?: string; beat?: number; zoom?: number; couples?: number } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (query.beat !== undefined) params.set("beat", String(query.beat));
  if (query.zoom !== undefined) params.set("zoom", String(query.zoom));
  if (query.couples !== undefined) params.set("couples", String(query.couples));
  const path = query.dance === undefined ? "#/" : `#/dance/${query.dance}`;
  await page.goto(`${path}?${params.toString()}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
}
