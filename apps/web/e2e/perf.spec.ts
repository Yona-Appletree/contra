import { expect, test } from "@playwright/test";

/**
 * Plan AC7, first half: the pair page's frame budget. The two-person fixture
 * is rendered 300 times at zoom 6 in headless Chromium and the median frame
 * has to come in under 8 ms.
 *
 * The number this reports is the number; nothing here is tuned toward the
 * budget. The runner it was measured on is part of the result, so the median
 * and the whole distribution are printed for the pull request to quote.
 */
const FRAMES = 300;
const BUDGET_MS = 8;

test("renders the pair under the frame budget at zoom 6", async ({ page }) => {
  await page.goto("#/frame?fixture=two-hand-hold&zoom=6");
  await page.waitForFunction(() => document.documentElement.dataset["frameReady"] === "true");

  // One warm-up pass, so the measurement is of a running renderer rather than
  // of the first shader and buffer allocation.
  await page.evaluate((n) => window.hallBench?.(n), 60);
  const times = await page.evaluate((n) => window.hallBench?.(n) ?? [], FRAMES);

  expect(times).toHaveLength(FRAMES);
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const median = at(0.5);
  const report = [
    `frames: ${FRAMES}`,
    `median: ${median.toFixed(3)} ms`,
    `p90: ${at(0.9).toFixed(3)} ms`,
    `p99: ${at(0.99).toFixed(3)} ms`,
    `max: ${(sorted[sorted.length - 1] ?? 0).toFixed(3)} ms`,
  ].join(" · ");
  console.log(`[AC7] hall pair frame at zoom 6 — ${report}`);
  test.info().annotations.push({ type: "perf", description: report });

  expect(median, `median frame time, ${report}`).toBeLessThan(BUDGET_MS);
});

/**
 * Plan AC7, second half: the hall's frame budget. Two lines of nine couples —
 * thirty-six dancers, the floor, the band and the caller's bubble — drawn 300
 * times at zoom 1, median under 16 ms.
 *
 * The number this reports is the number; nothing is tuned toward the budget.
 */
const HALL_BUDGET_MS = 16;
const HALL_COUPLES = 9;

test("renders a hall of two lines of nine couples under the frame budget at zoom 1", async ({
  page,
}) => {
  await page.goto(`#/?couples=${HALL_COUPLES}&zoom=1&beat=0`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");

  await page.evaluate((n) => window.hallDemo?.bench(n), 60);
  const times = await page.evaluate((n) => window.hallDemo?.bench(n) ?? [], FRAMES);

  expect(times).toHaveLength(FRAMES);
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const median = at(0.5);
  const report = [
    `couples: ${HALL_COUPLES * 2}`,
    `frames: ${FRAMES}`,
    `median: ${median.toFixed(3)} ms`,
    `p90: ${at(0.9).toFixed(3)} ms`,
    `p99: ${at(0.99).toFixed(3)} ms`,
    `max: ${(sorted[sorted.length - 1] ?? 0).toFixed(3)} ms`,
  ].join(" · ");
  console.log(`[AC7] hall frame at zoom 1 — ${report}`);
  test.info().annotations.push({ type: "perf", description: report });

  expect(median, `median frame time, ${report}`).toBeLessThan(HALL_BUDGET_MS);
});

declare global {
  interface Window {
    hallBench?: (frames: number) => number[];
    hallDemo?: {
      audioState: () => string | null;
      primed: () => boolean;
      beat: () => number;
      call: (at?: number) => string;
      bench: (frames: number) => number[];
    };
  }
}
