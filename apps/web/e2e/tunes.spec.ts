import { expect, test } from "@playwright/test";

/**
 * The Tunes tab (F4): the jukebox, and one tune's own page.
 *
 * The playing tests are the ones that matter: they pick a tune, wait for the
 * band to load and the potatoes to pass, and read the beat off the page — the
 * same clock the notation's cursor and the chart's lit cell follow — then
 * pick another tune, or another band mid-tune, and expect the music to go on.
 *
 * The count is read off the page rather than off `@caller/music`'s `tunes`:
 * that package pulls abcjs in, which Playwright's Node loader cannot import
 * (it is CommonJS), and `tunes.test.tsx` already holds the book to the list.
 */
test("the jukebox lists every tune, and picking one plays it, then another", async ({ page }) => {
  await page.goto("#/tunes");
  await expect(page.getByTestId("tab-tunes")).toHaveAttribute("aria-current", "page");
  // Thirteen tunes at the time of writing; at least that many from now on.
  const rows = page.getByTestId("tune-row");
  expect(await rows.count()).toBeGreaterThanOrEqual(13);
  await expect(page.getByTestId("tunes-page")).toHaveAttribute("data-playing", "false");

  const second = rows.nth(1);
  const slug = (await second.getAttribute("data-slug")) ?? "";
  await second.click();
  await expect(page.getByTestId("tunes-page")).toHaveAttribute("data-tune", slug);
  await expect(page.getByTestId("tunes-page")).toHaveAttribute("data-playing", "true", {
    timeout: 20_000,
  });
  await expect(second).toHaveAttribute("data-sounding", "true");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain(`tune=${slug}`);
  // Through the potatoes and into the tune, with the next tune named.
  await expect(page.getByTestId("tune-page-status")).toContainText(/A1 · bar \d · 1st time/, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("tune-page-next")).toContainText("then ");

  // Another pick switches the jukebox over.
  const third = rows.nth(2);
  const other = (await third.getAttribute("data-slug")) ?? "";
  await third.click();
  await expect(page.getByTestId("tunes-page")).toHaveAttribute("data-tune", other);
  await expect(third).toHaveAttribute("data-sounding", "true", { timeout: 20_000 });
  await expect(second).toHaveAttribute("data-sounding", "false");
  await expect(page.getByTestId("tune-panel")).toHaveAttribute("data-slug", other);

  // The panel links the tune's own page.
  await expect(page.getByTestId("tune-page-link")).toHaveAttribute("href", `#/tunes/${other}`);
});

test("a tune page plays the tune, and the band switches without stopping it", async ({ page }) => {
  await page.goto("#/tunes/soldiers-joy");
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-playing", "false");
  await expect(page.getByTestId("tune-band-house")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("tune-play").click();
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-playing", "true", {
    timeout: 20_000,
  });
  // Through the four potatoes and into the tune.
  await expect
    .poll(async () => Number(await page.getByTestId("tune-page").getAttribute("data-beat")), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  await expect(page.getByTestId("tune-page-status")).toContainText(/A1 · bar \d/);

  await page.getByTestId("tune-band-banjo").click();
  await expect(page.getByTestId("tune-band-banjo")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-band", "banjo");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/band=banjo/);
  // Still the same page, still playing: the switch kept the beat rather than
  // remounting the page.
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-playing", "true", {
    timeout: 20_000,
  });
  const before = Number(await page.getByTestId("tune-page").getAttribute("data-beat"));
  await expect
    .poll(async () => Number(await page.getByTestId("tune-page").getAttribute("data-beat")), {
      timeout: 20_000,
    })
    .toBeGreaterThan(before);

  await page.getByTestId("tune-play").click();
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-playing", "false");
});

test("the jukebox and a tune page open on ?tune= and ?band=", async ({ page }) => {
  await page.goto("#/tunes?tune=kesh-jig&band=string");
  await expect(page.getByTestId("tunes-page")).toHaveAttribute("data-tune", "kesh-jig");
  await expect(page.getByTestId("tune-panel")).toHaveAttribute("data-band", "string");
  await expect(page.getByTestId("tune-band-piano")).toContainText("as written");

  await page.goto("#/tunes/kesh-jig?band=string");
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-band", "string");
});
