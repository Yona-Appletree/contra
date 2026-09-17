import { ALL_DANCES, LAB_DANCES } from "@caller/contra";
import { expect, test } from "@playwright/test";

/**
 * **Every app route renders every dance** (M8).
 *
 * The milestone that widened the dance record — concurrent calls, calls of no
 * beats at all, phrase names beyond A1–B2, records with two passes — broke the
 * four app surfaces that flatten a phrase list at once, and a page that throws
 * on one dance throws on every page that shows it. So the smoke test is the
 * whole cross product: each of the three routes a dance appears on, for each of
 * the dances this package loads, shipped and lab alike.
 *
 * It is deliberately shallow. Each case asks only that the page rendered its own
 * marker and put nothing in the console — what the page *says* is the business
 * of `dancePage.spec.ts`, `hall.spec.ts` and the unit tests. What this catches is
 * the class of fault M8 could introduce: a record shape a surface cannot read.
 */

const SLUGS = ALL_DANCES.map((dance) => dance.slug);
const LAB = new Set(LAB_DANCES.map((dance) => dance.slug));

for (const slug of SLUGS) {
  test(`${slug} renders on its dance page, its stage and the card`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    // 1. The dance page, with the planner's own resolution table.
    await page.goto(`#/dances/${slug}`);
    await expect(page.getByTestId("dance-page")).toHaveAttribute("data-slug", slug);
    await expect(page.getByTestId("dance-page-resolution-error")).toHaveCount(0);
    await expect(page.getByTestId("dance-page-lab")).toHaveCount(LAB.has(slug) ? 1 : 0);

    // 2. The two cards, which are the surfaces that flatten the phrases: one
    //    row per written call on the calling card, one entry per call on the
    //    walkthrough (M13 replaced U3's static music card with both).
    await expect(page.getByTestId("calling-card-row")).not.toHaveCount(0);
    await expect(page.getByTestId("walkthrough-entry")).not.toHaveCount(0);
    await expect(page.getByTestId("walkthrough-wrap")).toBeVisible();

    // 3. The Stage, which is the planner drawing it.
    await page.goto(`#/dance/${slug}?beat=0`);
    await expect(page.getByTestId("hall-page")).toBeVisible();
    await expect(page.locator("canvas")).not.toHaveCount(0);

    expect(errors, `${slug}: the console`).toEqual([]);
  });
}
