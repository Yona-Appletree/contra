import { expect, test } from "@playwright/test";
import { matchGolden, openHall } from "./golden.js";

/**
 * The front page: the hall demo.
 *
 * The dance itself is proved in `@caller/contra`'s registry test — every
 * encoded dance against AC1, AC5 and AC6 at every line length. What is proved
 * here is the page: that it draws, that the caller says the right thing at the
 * right beat (AC9), that choosing a dance moves the URL and the card, that a
 * click on play really starts the audio clock (AC4, director ruling DD12),
 * and the two goldens gate G2 is judged on.
 */

/** The first dance of the programme, and its first call. */
const FIRST_DANCE = "airpants";
const FIRST_CALL = "NEIGHBOR BALANCE AND SWING";

test("the hall draws, with the band, the lines and the caller", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openHall(page, { beat: 0, zoom: 2 });

  const canvas = page.getByTestId("hall-canvas");
  await expect(canvas).toBeVisible();
  // 268 × 342 world px at 2×, in device pixels. P1 made the lines longer —
  // eight couples and seven — so the world grew downward; its **width** is
  // fixed by the number of lines and is the 268 px a phone fits at 1× (U1).
  const box = await canvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));
  expect(box).toEqual({ w: 536, h: 684 });
  await expect(page.getByTestId("hall-card")).toContainText("Airpants");
  // V1 moved the version out of the footer and into the tab bar's badge.
  await expect(page.getByTestId("build-info-trigger")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the caller's bubble says the first figure's call within its lead (AC9)", async ({ page }) => {
  await openHall(page, { beat: 0, zoom: 2 });
  // At beat 0 the bubble is on the first figure of A1. (The programme starts
  // at beat 0, so the decider clips this one call's four-beat lead; every
  // later call gets the whole of it.)
  expect(await page.evaluate(() => window.hallDemo?.call(0))).toBe(FIRST_CALL);

  // A2's first figure starts at beat 16 and its call has a four-beat lead, so
  // at beat 13 the caller is already on it while the hall is still swinging.
  const early = await page.evaluate(() => window.hallDemo?.call(13));
  expect(early).toBe("LONG LINES FORWARD AND BACK");
  expect(await page.evaluate(() => window.hallDemo?.call(11))).not.toBe(early);
});

test("every figure of the first dance gets its call said before it starts", async ({ page }) => {
  await openHall(page, { beat: 0, zoom: 2 });
  const said = await page.evaluate(() => {
    const out: Array<string | undefined> = [];
    // A1 balance at 0, swing at 4, A2 at 16 and 24, B1 at 32 and 36, B2 at 48
    // and 54: one probe two beats into each figure.
    for (const beat of [1, 6, 17, 25, 33, 38, 49, 56]) out.push(window.hallDemo?.call(beat));
    return out;
  });
  for (const call of said) expect(call).toBeTruthy();
  expect(new Set(said).size).toBeGreaterThan(4);
});

test("choosing a dance changes the URL and the card", async ({ page }) => {
  await openHall(page, { beat: 0, zoom: 2 });
  await expect(page.getByTestId("hall-card")).toContainText("Airpants");

  await page.getByTestId("hall-dance-select").click();
  await page.getByRole("option", { name: "Kitchen Stomp" }).click();

  await expect(page.getByTestId("hall-card")).toContainText("Kitchen Stomp");
  await expect(page.getByTestId("hall-card")).toContainText("Becky Hill");
  await expect(page).toHaveURL(/#\/dance\/kitchen-stomp/);
});

test("the hall dances before anyone presses play, on the silent clock", async ({ page }) => {
  await page.goto(`#/dance/${FIRST_DANCE}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
  const first = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  await page.waitForTimeout(400);
  const later = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  expect(later).toBeGreaterThan(first);
  // Nothing is playing yet, so there is no audio context at all.
  expect(await page.evaluate(() => window.hallDemo?.audioState())).toBeNull();
});

test("play primes the tune and starts the audio clock (AC4, DD12)", async ({ page }) => {
  await page.goto(`#/dance/${FIRST_DANCE}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");

  await page.getByTestId("hall-play").click();
  await expect(page.getByTestId("hall-play")).toHaveText("Pause");

  // Audio cannot be heard in a headless browser. What can be checked is that
  // the context really is running and that the synth really primed a buffer,
  // which is what the director listens for on the deployed page.
  await page.waitForFunction(() => window.hallDemo?.primed() === true, undefined, {
    timeout: 20_000,
  });
  expect(await page.evaluate(() => window.hallDemo?.audioState())).toBe("running");

  // And the beat keeps moving, now off the audio clock.
  const first = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.hallDemo?.beat() ?? 0)).toBeGreaterThan(first);
});

/**
 * The between-dances interval is silent, and the next tune comes in at its own
 * beat 0.
 *
 * A programme item is 172 beats — nearly a minute and a half of wall clock — so
 * the page's `seek` hook jumps to four beats before the end of the first dance's
 * last time through and the switch is watched from there. What this proves that
 * the unit test cannot is that the page's own hand-over runs: the tune is the
 * clock, it stops, the silent clock carries the whole 44-beat interval, the
 * hall's applause fires at the moment it stops, and the tune takes over again
 * without the evening's beat going backwards.
 */
test("the between-dances interval is silent, claps, and the next tune starts at beat 0", async ({
  page,
}) => {
  await page.goto(`#/dance/${FIRST_DANCE}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
  await page.getByTestId("hall-play").click();
  await page.waitForFunction(() => window.hallDemo?.primed() === true, undefined, {
    timeout: 20_000,
  });
  await page.waitForFunction(() => window.hallDemo?.musicOn() === true, undefined, {
    timeout: 20_000,
  });

  // Two times through of 64 beats, then the 44-beat interval.
  expect(await page.evaluate(() => window.hallDemo?.applause())).toBe(0);
  await page.evaluate(() => window.hallDemo?.seek(124));
  const before = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  // A shade under 124: `Player.play` schedules its buffer `START_LATENCY`
  // ahead and rebases the clock to match, so the beat starts a tenth of a beat
  // behind the seek and catches up.
  expect(before).toBeGreaterThan(120);
  expect(before).toBeLessThan(128);

  // The tune stops where the dancing does.
  await page.waitForFunction(() => window.hallDemo?.musicOn() === false, undefined, {
    timeout: 20_000,
  });
  const lineUp = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  expect(lineUp).toBeGreaterThanOrEqual(128);
  expect(lineUp).toBeLessThan(172 + 2);

  // And the hall applauds, once, at that moment. Nothing headless can hear it
  // (DD12); that it fired exactly once is as far as this can go.
  expect(await page.evaluate(() => window.hallDemo?.applause())).toBe(1);

  // The silent clock carries the interval on its own, with nothing playing.
  await page.waitForTimeout(400);
  const carried = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  expect(carried).toBeGreaterThan(lineUp);
  expect(carried).toBeLessThan(172);
  expect(await page.evaluate(() => window.hallDemo?.musicOn())).toBe(false);

  // Forty-four beats is twenty-four seconds of wall clock, which is longer
  // than a Playwright test should sit and watch, so the last six of them are
  // what is actually watched: still inside the interval, still silent, and the
  // page notices the next dance for itself from there.
  await page.evaluate(() => window.hallDemo?.seek(166));
  expect(await page.evaluate(() => window.hallDemo?.musicOn())).toBe(false);

  // And the tune comes back in with the next dance.
  await page.waitForFunction(() => window.hallDemo?.musicOn() === true, undefined, {
    timeout: 20_000,
  });
  const after = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  // The second dance starts at 172 and the tune comes back with it, never
  // before it and never in the dance after. How far into it the frame loop
  // happens to notice depends on how long a headless frame took; the *phase*
  // is exact by construction, and `musicClock.test.ts` is where that is
  // measured.
  expect(after).toBeGreaterThanOrEqual(172);
  expect(after).toBeLessThan(172 + 128);
  expect(await page.evaluate(() => window.hallDemo?.audioState())).toBe("running");
});

/**
 * What the caller says between two dances (B1).
 *
 * The bubble is pixels on a canvas, so what is read here is the string the page
 * drew into it — `window.hallDemo.call(beat)`, the same function `draw` uses.
 * Airpants leads the programme and Butter is next, so this is the becket
 * announcement: the title and author, then the user's own three lines. The
 * page is frozen at the end of the interval so the decider has produced the
 * whole of it.
 */
test("the caller announces the next dance, and says the becket lines for a becket one", async ({
  page,
}) => {
  await openHall(page, { dance: FIRST_DANCE, beat: 172, zoom: 2 });
  const said = await page.evaluate(() => {
    const call = (beat: number): string | undefined => window.hallDemo?.call(beat);
    return {
      // 128 is where the dancing stops: eight beats of applause.
      thanks: call(130),
      band: call(134),
      // 136 is where the announcement starts: three bubbles, 16/3 beats each.
      title: call(138),
      handsFour: call(143),
      sides: call(149),
      // 152 walks and 160 takes hands four; the becket lines run over both.
      move: call(154),
      becket: call(159),
      partner: call(165),
      // 168 is the first potato; the dance's own first call takes the bubble
      // on potato 3, which is beat 170.
      potatoes: call(169),
      first: call(171),
    };
  });

  expect(said.thanks).toBe("THANK YOUR PARTNER");
  expect(said.band).toBe("THANK THE BAND");
  expect(said.title).toBe("NEXT: BUTTER, BY GENE HUBERT");
  expect(said.handsFour).toBe("TAKE HANDS FOUR FROM THE TOP");
  expect(said.sides).toBe("ROBINS ON THE RIGHT, LARKS ON THE LEFT");
  // Butter's becket progresses left, so the caller says left. The direction is
  // measured off the formation's own progression, never typed — see
  // `@caller/contra`'s `lineUpShift.test.ts` for the right-progressing branch.
  expect(said.move).toBe("MOVE ONE PLACE TO YOUR LEFT");
  expect(said.becket).toBe("THIS IS A BECKET DANCE");
  expect(said.partner).toBe("YOUR PARTNER IS ON THE SIDE OF THE SET WITH YOU");
  expect(said.potatoes).toBe("HERE WE GO");
  // The dance's own first figure, said over the last two potatoes.
  expect(said.first).not.toBe("HERE WE GO");
  expect(said.first ?? "").not.toBe("");
});

test("the card says which part of the interval the hall is in", async ({ page }) => {
  await openHall(page, { dance: FIRST_DANCE, beat: 140, zoom: 2 });
  await expect(page.getByTestId("hall-status")).toHaveText("The caller announces Butter");
});

test("the trails toggle and the zoom buttons change the canvas", async ({ page }) => {
  await openHall(page, { beat: 0, zoom: 2 });
  await page.getByTestId("hall-zoom-4").click();
  await expect
    .poll(async () => page.getByTestId("hall-canvas").evaluate((el: HTMLCanvasElement) => el.width))
    .toBe(268 * 4);
  await page.getByTestId("hall-trails").click();
  await expect(page.getByTestId("hall-trails")).toHaveAttribute("aria-pressed", "false");
});

/**
 * Gate G2's pictures: the front page at 1×, which is a phone, and at 3×.
 *
 * Both are frozen at beat 0 of the first dance, where the hall is standing in
 * its lines and the caller has just said the first call — the frame that says
 * most about whether this looks like a contra dance.
 */
for (const zoom of [1, 3]) {
  test(`golden: the front page at ${zoom}×`, async ({ page }) => {
    await openHall(page, { dance: FIRST_DANCE, beat: 0, zoom });
    const shot = await page.getByTestId("hall-canvas").screenshot();
    await matchGolden(`hall-front@${zoom}x.png`, shot);
  });
}

declare global {
  interface Window {
    hallDemo?: {
      audioState: () => string | null;
      primed: () => boolean;
      beat: () => number;
      musicOn: () => boolean;
      applause: () => number;
      seek: (to: number) => void;
      call: (at?: number) => string;
      bench: (frames: number) => number[];
    };
  }
}
