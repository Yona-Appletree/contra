import { expect, test } from "@playwright/test";

/**
 * The Tunes tab (F4): the book of tunes, and one tune's page playing.
 *
 * The playing test is the one that matters: it presses play, waits for the
 * band to load and the potatoes to pass, and reads the beat off the page —
 * the same clock the notation's cursor and the chart's lit cell follow — and
 * then switches the band mid-tune and expects the tune to keep playing.
 *
 * The count is read off the page rather than off `@caller/music`'s `tunes`:
 * that package pulls abcjs in, which Playwright's Node loader cannot import
 * (it is CommonJS), and `tunes.test.tsx` already holds the page to the list.
 */
test("the Tunes tab lists every tune, and a card opens its page", async ({ page }) => {
  await page.goto("#/tunes");
  await expect(page.getByTestId("tab-tunes")).toHaveAttribute("aria-current", "page");
  // Thirteen tunes at the time of writing; at least that many from now on.
  const cards = await page.getByTestId("tune-card").count();
  expect(cards).toBeGreaterThanOrEqual(13);
  await expect(page.getByTestId("tune-play")).toHaveCount(cards);

  const first = page.getByTestId("tune-card-link").first();
  const slug = await first.getAttribute("data-slug");
  await first.click();
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-slug", slug ?? "");
  await expect(page.getByTestId("tune-ref").first()).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByTestId("tune-set-link").first()).toHaveAttribute("href", /^#\/\?tune=/);
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

test("a tune page with ?band= opens on that band", async ({ page }) => {
  await page.goto("#/tunes/kesh-jig?band=string");
  await expect(page.getByTestId("tune-page")).toHaveAttribute("data-band", "string");
  await expect(page.getByTestId("tune-band-piano")).toContainText("as written");
});
