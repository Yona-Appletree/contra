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

/**
 * C3: a call lasts its spoken length plus a short tail, not a fixed span into
 * its figure — so "every figure gets its call said before it starts" is still
 * true, but the call is no longer on the bubble for the *whole* figure.
 *
 * Airpants' six calls start `lead` beats before their own figure (A1's first
 * call clipped to the programme's own beat 0) — 0, 12, 20, 28, 44, 50 — which
 * is the earliest beat each can be heard, and each is truthy and distinct
 * there.
 */
test("every figure of the first dance is called before it starts", async ({ page }) => {
  await openHall(page, { beat: 0, zoom: 2 });
  const said = await page.evaluate(() => {
    const starts = [0, 12, 20, 28, 44, 50];
    return starts.map((beat) => window.hallDemo?.call(beat));
  });
  for (const call of said) expect(call).toBeTruthy();
  expect(new Set(said).size).toBe(said.length);
});

/**
 * "The calls stay around too long... but not until the next call" (the user,
 * 2026-09-14). Beat 33 is deep into B1's partner swing (the call for it is
 * said over beats [28, 32)) with nothing else due for another eleven beats,
 * so the bubble is empty rather than still showing "PARTNER BALANCE AND
 * SWING".
 */
test("the bubble falls silent between two calls, rather than holding the last one", async ({
  page,
}) => {
  await openHall(page, { beat: 0, zoom: 2 });
  expect(await page.evaluate(() => window.hallDemo?.call(33))).toBe("");
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
  // U3: the play control is the 8-bit speaker icon now, named by its
  // accessible name rather than by text content.
  await expect(page.getByTestId("hall-play")).toHaveAttribute("aria-label", "Pause music");

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
 * clock, it stops, the silent clock carries the whole 44-beat interval — no
 * clap, no sound of any kind, until the potatoes (B4: "no one claps in contra")
 * — and the tune takes over again without the evening's beat going backwards.
 */
test("the between-dances interval is silent until the potatoes, and the next tune starts at beat 0", async ({
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

  // The silent clock carries the interval on its own, with nothing playing —
  // there is no clap, and nothing else, before the potatoes.
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
  // Nothing has counted in yet: the potatoes are the last four beats, 168-172.
  expect(await page.evaluate(() => window.hallDemo?.potatoes())).toBe(0);

  // The band counts the dance in — four chords, one a beat, the fourth a beat
  // before bar 1 — while the silent clock is still the one being read, so the
  // hall goes on standing in its rings rather than jumping to beat 0.
  // Nothing headless can hear them (DD12); that they were scheduled exactly
  // once, before the tune, is as far as this can go.
  // `packages/music/src/player/potatoes.test.ts` measures the buffer.
  await page.waitForFunction(() => (window.hallDemo?.potatoes() ?? 0) > 0, undefined, {
    timeout: 20_000,
  });
  expect(await page.evaluate(() => window.hallDemo?.musicOn())).toBe(false);

  // And the tune comes back in with the next dance.
  await page.waitForFunction(() => window.hallDemo?.musicOn() === true, undefined, {
    timeout: 20_000,
  });
  expect(await page.evaluate(() => window.hallDemo?.potatoes())).toBe(1);
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
 * What the caller says between two dances (B1, B4).
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
      // 128 is where the dancing stops: eight beats of thanks, partner then
      // neighbour — no clapping (B4: "no one claps in contra").
      partner: call(130),
      neighbor: call(134),
      // 136 is where the announcement starts: three bubbles, 16/3 beats each.
      title: call(138),
      handsFour: call(143),
      sides: call(149),
      // 152 walks and 160 takes hands four; the becket lines run over both.
      move: call(154),
      becket: call(159),
      becketPartner: call(165),
      // 168 is the first potato; the dance's own first call takes the bubble
      // on potato 3, which is beat 170.
      potatoes: call(169),
      first: call(171),
    };
  });

  expect(said.partner).toBe("THANK YOUR PARTNER");
  expect(said.neighbor).toBe("THANK YOUR NEIGHBOR");
  expect(said.title).toBe("NEXT: BUTTER, BY GENE HUBERT");
  expect(said.handsFour).toBe("TAKE HANDS FOUR FROM THE TOP");
  expect(said.sides).toBe("ROBINS ON THE RIGHT, LARKS ON THE LEFT");
  // Butter's becket progresses left, so the caller says left. The direction is
  // measured off the formation's own progression, never typed — see
  // `@caller/contra`'s `lineUpShift.test.ts` for the right-progressing branch.
  expect(said.move).toBe("MOVE ONE PLACE TO YOUR LEFT");
  expect(said.becket).toBe("THIS IS A BECKET DANCE");
  expect(said.becketPartner).toBe("YOUR PARTNER IS ON THE SIDE OF THE SET WITH YOU");
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
      potatoes: () => number;
      seek: (to: number) => void;
      call: (at?: number) => string;
      bench: (frames: number) => number[];
    };
  }
}
