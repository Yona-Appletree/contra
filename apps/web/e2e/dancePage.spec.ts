import { expect, test } from "@playwright/test";

/**
 * `#/dances/<slug>`'s resolution table, and the Stage's engine switch (M3).
 *
 * A smoke test per route: what the planner makes of each call is now on the
 * dance page, and `?engine=new|old` is the switch gate G1 is reviewed through.
 */
test("the dance page lists what the planner makes of every call", async ({ page }) => {
  await page.goto("#/dances/airpants");
  await expect(page.getByTestId("dance-page")).toHaveAttribute("data-slug", "airpants");
  await expect(page.getByTestId("dance-page-resolution-error")).toHaveCount(0);

  const rows = page.getByTestId("dance-page-resolution").locator("li");
  // Airpants' six calls, each at least one instance; the gatherers are one
  // instance per pair, so there are more rows than calls.
  await expect(rows).not.toHaveCount(0);
  const figures = await rows.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-figure")),
  );
  expect(new Set(figures)).toEqual(
    new Set(["balance-and-swing", "long-lines", "allemande", "circle", "do-si-do"]),
  );
  // The two rules the table exists to show, read off the definitions.
  await expect(page.getByTestId("dance-page-resolution")).toContainText('anchor "meet"');
  await expect(page.getByTestId("dance-page-resolution")).toContainText('ends "home"');

  // A shipped dance is not a lab dance.
  await expect(page.getByTestId("dance-page-lab")).toHaveCount(0);
});

test("the Stage says which engine it is on, and links to the other", async ({ page }) => {
  await page.goto("#/dance/butter?beat=0");
  await expect(page.getByTestId("hall-page")).toHaveAttribute("data-engine", "new");
  await expect(page.getByTestId("hall-engine")).toContainText("the new engine");
  await expect(page.getByTestId("hall-engine-swap")).toHaveAttribute("href", /engine=old/);

  await page.goto("#/dance/butter?beat=0&engine=old");
  await expect(page.getByTestId("hall-page")).toHaveAttribute("data-engine", "old");
  await expect(page.getByTestId("hall-engine")).toContainText("the old engine");
  await expect(page.getByTestId("hall-engine-swap")).toHaveAttribute("href", /engine=new/);

  // The address bar keeps the engine it was given, so a reload is the same
  // hall: the page rewrites its own hash as the programme moves on, and it
  // used to drop every query it does not own when it did.
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toMatch(/engine=old/);
});
