import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The figure lab's pictures (O1): one figure's strip, pen plot and
 * figure-strip cell, for `pnpm figure <id>` to print the path of and an agent
 * to `Read`.
 *
 * Skipped entirely unless `FIGURE_LAB_ID` and `FIGURE_LAB_OUT` are both set —
 * `packages/contra/scripts/figureLab.mjs` sets both before running this file
 * on its own (`pnpm --filter @caller/web exec playwright test
 * e2e/figureLab.spec.ts`) — so it costs one skipped test in the ordinary
 * `playwright test` run and writes nothing there.
 *
 * Reuses the Moves page exactly as it stands (T2, F3b): the strip is the same
 * `?strip=1&bare=1` route `e2e/gallery.spec.ts` screenshots, and the pen plot
 * and figure-strip cell are the two `[data-testid="trace-svg"]` panels every
 * `#/moves/<id>` row already draws beside its canvas — nothing here is a new
 * rendering path, so what an agent reads is exactly what the Moves tab shows.
 */
const ID = process.env.FIGURE_LAB_ID;
const OUT = process.env.FIGURE_LAB_OUT;

/**
 * `pnpm figure <id> --chain <n>`'s candidate, as the page's own `?chain=`
 * (F10) — so the pictures show the same figure the numbers above them measure.
 * Unset, which is every ordinary run, is no query and the shipped default.
 */
const CHAIN = process.env.FIGURE_LAB_CHAIN;
const CHAIN_QUERY = CHAIN === undefined ? "" : `chain=${CHAIN}`;

/** The brief's zoom for the strip picture. */
const ZOOM = 4;

test("figure lab pictures", async ({ page }) => {
  test.skip(ID === undefined || OUT === undefined, "only runs for `pnpm figure <id>`");
  mkdirSync(OUT!, { recursive: true });

  await page.goto(
    `#/moves/${ID}?bare=1&strip=1&zoom=${ZOOM}${CHAIN_QUERY ? `&${CHAIN_QUERY}` : ""}`,
  );
  const strip = page.getByTestId("moves-strip");
  await expect(strip).toHaveAttribute("data-key", ID!);
  const cells = Number(await strip.getAttribute("data-cells"));
  await expect(strip.locator('canvas[data-ready="1"]')).toHaveCount(cells);
  writeFileSync(join(OUT!, `${ID}-strip.png`), await strip.screenshot());

  await page.goto(`#/moves/${ID}${CHAIN_QUERY ? `?${CHAIN_QUERY}` : ""}`);
  const traces = page.getByTestId("moves-row-traces").first();
  await expect(traces).toBeVisible();
  const pen = traces.locator('[data-testid="trace-svg"][data-kind="pen"]');
  const stripCell = traces.locator('[data-testid="trace-svg"][data-kind="strip"]');
  await expect(pen).toBeVisible();
  await expect(stripCell).toBeVisible();
  writeFileSync(join(OUT!, `${ID}-pen.png`), await pen.screenshot());
  writeFileSync(join(OUT!, `${ID}-strip-cell.png`), await stripCell.screenshot());
});
