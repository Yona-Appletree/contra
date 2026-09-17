import { DEMO_DANCES } from "@caller/contra";
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

test("choosing a dance is a native select", async ({ page }) => {
  // Not `?beat=`: that freezes the whole page for a golden, and re-pins the
  // clock to it on every redraw — including one a fresh dance picks (see the
  // next test). This wants the live page, exactly as a visitor gets it.
  await openHall(page, { zoom: 2 });
  await expect(page.getByTestId("hall-card")).toContainText("Airpants");

  // U4 requirement 1: "should probably just be native" — no Radix popover.
  const select = page.getByTestId("hall-dance-select");
  expect(await select.evaluate((el) => el.tagName)).toBe("SELECT");
  // One option per programme dance, read off the programme.
  await expect(select.locator("option")).toHaveCount(DEMO_DANCES.length);

  await select.selectOption("kitchen-stomp");
  // The pick takes effect straight away — the caller announces it (see the
  // next test for the full sequence, and why the URL does not move yet).
  await expect(page.getByTestId("hall-status")).toContainText("Kitchen Stomp");
});

/**
 * U4 requirement 6: "when you select a new dance it starts immediately which
 * makes it hard to see what's going on. it should start with the normal line
 * up." Picking a dance now starts at the beginning of its own line-up — the
 * announcement, walk, hands four, potatoes (B3) — not its dancing beat 0.
 *
 * A consequence, not a separate bug: the URL, the card and the select's own
 * displayed value all read "the dance now playing" (`position.dance`,
 * exactly as they did before U4, and exactly as the card does for every
 * *ordinary* dance-to-dance transition) — which for the whole of the
 * line-up is still whichever dance the programme's own loop happens to put
 * right before the one just picked, not the pick itself. They catch up the
 * moment the picked dance actually starts dancing.
 */
test("choosing a dance starts its line-up, not its dancing beat 0", async ({ page }) => {
  await openHall(page, { zoom: 2 });
  await page.getByTestId("hall-dance-select").selectOption("kitchen-stomp");

  await expect(page.getByTestId("hall-status")).toHaveText("The caller announces Kitchen Stomp");
  expect(await page.evaluate(() => window.hallDemo?.call())).toBe(
    "NEXT: KITCHEN STOMP, BY BECKY HILL",
  );
  await expect(page).not.toHaveURL(/#\/dance\/kitchen-stomp/);

  // The interval from the beginning of the announcement to the dance's own
  // beat 0 is 36 beats (16 announcement + 8 walk + 8 hands-four + 4 potatoes,
  // `LINEUP_BEATS` in `program.ts`) whichever dance it is.
  await page.evaluate(() => window.hallDemo?.seek((window.hallDemo?.beat() ?? 0) + 36));
  await expect(page.getByTestId("hall-card")).toContainText("Kitchen Stomp");
  await expect(page.getByTestId("hall-card")).toContainText("Becky Hill");
  await expect(page).toHaveURL(/#\/dance\/kitchen-stomp/);
});

/**
 * P3 replaced U4's reset button with the transport's |◀◀, which goes to the
 * dance's own **potatoes** rather than to the whole line-up ("a caller
 * practising needs the count-in", Yona at round 2). The five glyphs stand
 * where the speaker and the reset chip used to, and neither is on the Stage
 * any more.
 */
test("the transport replaces the speaker and the reset chip on the stage", async ({ page }) => {
  await openHall(page, { dance: FIRST_DANCE, zoom: 2 });

  for (const [id, label] of [
    ["hall-prev-dance", "Start of this dance"],
    ["hall-prev-move", "Start of this move"],
    ["hall-play", "Play"],
    ["hall-next-move", "Next move"],
    ["hall-next-dance", "Next dance"],
  ] as const) {
    await expect(page.getByTestId(id)).toHaveAttribute("aria-label", label);
  }
  await expect(page.getByTestId("hall-mute")).toHaveAttribute("aria-label", "Mute the band");
  await expect(page.getByTestId("hall-reset")).toHaveCount(0);
});

/**
 * AC1, clicked rather than computed: `transport.test.ts` is the whole ruling
 * as a table over the real programme, so what this adds is that the button
 * wired to each rule really seeks the live page's clock.
 *
 * Airpants' moves start at 0, 16, 24, 32, 48 and 54 within the cycle; the
 * second dance's potatoes are at 168 (`danceStartBeat(1)` = 172 − 4). The page
 * is left running on the silent clock (the attract mode, A1), so the beat is
 * read straight after each click and compared within half a beat.
 */
test("the four seeks land where the ruling says (AC1)", async ({ page }) => {
  await openHall(page, { zoom: 2 });

  const pressed = async (id: string, from: number): Promise<number> => {
    const button = page.getByTestId(id);
    // Hover first so the click itself is not also waiting for actionability:
    // the silent clock is running, and |◀'s rule reads the beat the press was
    // actually made on.
    await button.hover();
    await page.evaluate((beat) => window.hallDemo?.seek(beat), from);
    await button.click();
    return await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  };

  // |◀ two beats into A2 (16) restarts it; half a beat into it goes back to
  // A1 — the CD-player rule, no timed double press.
  expect(await pressed("hall-prev-move", 18)).toBeCloseTo(16, 0);
  expect(await pressed("hall-prev-move", 17.5)).toBeCloseTo(0, 0);
  // ▶| from inside A1 is A2's first beat.
  expect(await pressed("hall-next-move", 3)).toBeCloseTo(16, 0);
  // ▶▶| from inside the first dance is the second dance's own potatoes.
  expect(await pressed("hall-next-dance", 40)).toBeCloseTo(168, 0);
});

/**
 * AC2: ▶ primes the audio and starts the band; ▮▮ **freezes the whole
 * evening** (A1, D3) rather than only stopping the tune, as "pause" did before
 * P3; ▶ again picks it up where it stopped.
 */
test("play primes the tune, pause freezes the evening, play resumes it (AC2, AC4, DD12)", async ({
  page,
}) => {
  await page.goto(`#/dance/${FIRST_DANCE}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
  // The dancing start of the first dance, so the band has a tune to play.
  await page.evaluate(() => window.hallDemo?.seek(0));

  const play = page.getByTestId("hall-play");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await play.click();
  // D5: the transport's own labels, not the speaker's "Play music"/"Pause music".
  await expect(play).toHaveAttribute("aria-label", "Pause");
  await expect(play).toHaveAttribute("aria-pressed", "true");

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

  // ▮▮ holds the whole evening still: the hall, the card and the cursor stop
  // with the band, which is what A1 rules and what the glyph promises.
  await play.click();
  await expect(play).toHaveAttribute("aria-label", "Play");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.hallDemo?.paused())).toBe(true);
  const frozen = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.hallDemo?.beat() ?? 0)).toBe(frozen);

  // ▶ picks it up again with the band.
  await play.click();
  await page.waitForFunction(() => window.hallDemo?.musicOn() === true, undefined, {
    timeout: 20_000,
  });
  expect(await page.evaluate(() => window.hallDemo?.paused())).toBe(false);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.hallDemo?.beat() ?? 0)).toBeGreaterThan(frozen);
});

/**
 * AC3: a seek inside the dance that is sounding keeps the tune's own clock —
 * `goMusic` re-plays the tune from the target, so the beat is still a linear
 * function of `AudioContext.currentTime` and the notation goes on following
 * it. (A seek into a line-up hands back to the silent clock; that half is the
 * interval/potatoes test below, which seeks with `hallDemo.seek` and still
 * passes unchanged.)
 */
test("a ▶| inside the sounding dance keeps the tune's clock (AC3)", async ({ page }) => {
  await page.goto(`#/dance/${FIRST_DANCE}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
  await page.evaluate(() => window.hallDemo?.seek(0));
  await page.getByTestId("hall-play").click();
  await page.waitForFunction(() => window.hallDemo?.musicOn() === true, undefined, {
    timeout: 20_000,
  });

  await page.evaluate(() => window.hallDemo?.seek(20));
  const next = page.getByTestId("hall-next-move");
  await next.click();
  expect(await page.evaluate(() => window.hallDemo?.musicOn())).toBe(true);
  await next.click();
  expect(await page.evaluate(() => window.hallDemo?.musicOn())).toBe(true);
  // Still inside the first dance's own two times through, and still playing.
  const beat = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  expect(beat).toBeGreaterThan(20);
  expect(beat).toBeLessThan(128);
  expect(await page.evaluate(() => window.hallDemo?.audioState())).toBe("running");
});

/**
 * AC4: mute is **not** pause. The master gain goes to zero and everything else
 * carries on — the player is still the clock, the beat still advances, the
 * context is still running — and the flag outlives a dance change and a
 * reload on its own localStorage key.
 */
test("mute turns the band down without stopping anything (AC4)", async ({ page }) => {
  await page.goto(`#/dance/${FIRST_DANCE}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
  await page.evaluate(() => window.hallDemo?.seek(0));
  await page.getByTestId("hall-play").click();
  await page.waitForFunction(() => window.hallDemo?.musicOn() === true, undefined, {
    timeout: 20_000,
  });

  const mute = page.getByTestId("hall-mute");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-label", "Unmute the band");

  // `gain()` is the *live* value on a 10 ms ramp, so it is on its way to zero
  // rather than exactly zero the instant the chip is pressed.
  await page.waitForTimeout(100);
  const gain = await page.evaluate(() => window.hallDemo?.gain() ?? 1);
  expect(gain).toBeLessThan(0.01);
  expect(await page.evaluate(() => window.hallDemo?.muted())).toBe(true);

  // Nothing else moved: the band is still the clock and the hall still dances.
  expect(await page.evaluate(() => window.hallDemo?.musicOn())).toBe(true);
  expect(await page.evaluate(() => window.hallDemo?.audioState())).toBe("running");
  const before = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.hallDemo?.beat() ?? 0)).toBeGreaterThan(before);

  // Its own key, remembered.
  expect(await page.evaluate(() => window.localStorage.getItem("hall:muted"))).toBe("true");

  // A2: picking a dance rebuilds the evening and does not touch the mute.
  await page.getByTestId("hall-dance-select").selectOption("kitchen-stomp");
  await expect(mute).toHaveAttribute("aria-pressed", "true");

  // And it survives a reload.
  await page.goto(`#/dance/${FIRST_DANCE}`);
  await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
  await expect(page.getByTestId("hall-mute")).toHaveAttribute("aria-pressed", "true");
});

/** The Tunes tab's jukebox has no mute of its own and is unaffected (AC4). */
test("the Tunes tab has no mute chip", async ({ page }) => {
  await page.goto("#/tunes");
  await expect(page.getByTestId("hall-mute")).toHaveCount(0);
});

/**
 * AC5: the keyboard drives the same four seeks and the mute, wherever the
 * caller's hands are — space ▶/▮▮, ←/→ the moves, ⇧←/⇧→ the dances, m mute.
 */
test("the arrow keys and m drive the transport (AC5)", async ({ page }) => {
  await openHall(page, { zoom: 2 });

  await page.evaluate(() => window.hallDemo?.seek(3));
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.hallDemo?.beat() ?? 0)).toBeCloseTo(16, 0);

  await page.keyboard.press("Shift+ArrowRight");
  expect(await page.evaluate(() => window.hallDemo?.beat() ?? 0)).toBeCloseTo(168, 0);

  const mute = page.getByTestId("hall-mute");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("m");
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("m");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
});

/**
 * AC5's other half: none of it fires while something is being typed into. The
 * dance `<select>` is the one that matters — its own arrow keys pick a dance,
 * and the transport must not take them away.
 */
test("the keyboard does nothing while the dance select has focus (AC5)", async ({ page }) => {
  await openHall(page, { zoom: 2 });

  await page.getByTestId("hall-dance-select").focus();
  await page.evaluate(() => window.hallDemo?.seek(3));
  await page.keyboard.press("ArrowRight");
  // Whatever the select does with the key is the select's business; what must
  // not happen is the transport's own jump to A2's first beat.
  const guarded = await page.evaluate(() => window.hallDemo?.beat() ?? 0);
  expect(Math.abs(guarded - 16)).toBeGreaterThan(0.5);
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
  // U4: a bare `#/dance/<slug>` now opens on that dance's own line-up (the
  // announcement), not its dancing beat 0 (requirement 6) — this test wants
  // the *dancing* start of a known transition, so it seeks there explicitly
  // rather than sitting through the line-up's own potato first.
  await page.evaluate(() => window.hallDemo?.seek(0));
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

test("the trails toggle changes the canvas", async ({ page }) => {
  await openHall(page, { beat: 0, zoom: 2 });
  await page.getByTestId("hall-trails").click();
  await expect(page.getByTestId("hall-trails")).toHaveAttribute("aria-pressed", "false");
});

/**
 * U4 requirements 2 and 3: the tune and zoom selectors are gone from the
 * bar, but `?tune=` and `?zoom=` still work as deep links (for tests and
 * goldens) with no control in the bar to have driven them.
 */
test("?zoom= still sizes the canvas directly, with no selector left in the bar", async ({
  page,
}) => {
  await openHall(page, { beat: 0, zoom: 4 });
  const box = await page
    .getByTestId("hall-canvas")
    .evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));
  expect(box).toEqual({ w: 268 * 4, h: 342 * 4 });

  await expect(page.getByTestId("hall-zoom-4")).toHaveCount(0);
  await expect(page.getByTestId("hall-zoom-auto")).toHaveCount(0);
  await expect(page.getByTestId("hall-tune-select")).toHaveCount(0);
});

/**
 * Gate G2's pictures: the front page at 1×, which is a phone, and at 3×.
 *
 * Both are frozen at beat 0 of the first dance, where the hall is standing in
 * its lines and the caller has just said the first call — the frame that says
 * most about whether this looks like a contra dance.
 */
/**
 * A6 calls these two "canvas-only", and until P3 they were not quite: an
 * element screenshot captures whatever is painted *over* the element, so U3's
 * speaker and U4's reset chip were baked into the bottom-left corner of both
 * PNGs. P3 took those two off the canvas (the transport is in the band under
 * it now) and put the mute chip at the stage's top-right, which would have
 * moved the goldens for a reason that has nothing to do with the hall. So the
 * chrome overlaid on the stage is hidden for the shot, and the two PNGs were
 * regenerated once with the dancers alone in them — which is what gate G2
 * actually judges, and what no later phase's chrome can move again.
 */
const STAGE_CHROME_HIDDEN = ".caller-stage-corner { visibility: hidden; }";

for (const zoom of [1, 3]) {
  test(`golden: the front page at ${zoom}×`, async ({ page }) => {
    await openHall(page, { dance: FIRST_DANCE, beat: 0, zoom });
    const shot = await page.getByTestId("hall-canvas").screenshot({ style: STAGE_CHROME_HIDDEN });
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
      paused: () => boolean;
      muted: () => boolean;
      gain: () => number | null;
      seek: (to: number) => void;
      call: (at?: number) => string;
      bench: (frames: number) => number[];
    };
  }
}

/**
 * The notation's cursor follows the **music** beat, not the evening's. The
 * evening's beat counts the between-dances interval too, so handing it to the
 * notation (which takes its beat modulo the 64-beat cycle) put the cursor bars
 * off after the first dance and kept it walking through the silence — the
 * user's report of 2026-09-15. Beat 178 is the second dance's sixth beat
 * (bar 4 of the first line); beat 140 is inside the interval, where the cursor
 * waits on bar 1 for the potatoes.
 */
test("the notation's cursor follows the music beat, and waits on bar 1 through the interval", async ({
  page,
}) => {
  const classes = async (): Promise<string[]> =>
    page
      .locator('[data-testid="hall-notation"] .caller-music-current-measure')
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("class") ?? ""))]);

  await openHall(page, { dance: FIRST_DANCE, beat: 178, zoom: 2 });
  const dancing = await classes();
  expect(dancing.length).toBeGreaterThan(0);
  for (const c of dancing) expect(c).toMatch(/abcjs-l0\b/);
  for (const c of dancing) expect(c).toMatch(/abcjs-m3\b/);

  await openHall(page, { dance: FIRST_DANCE, beat: 140, zoom: 2 });
  const waiting = await classes();
  expect(waiting.length).toBeGreaterThan(0);
  for (const c of waiting) expect(c).toMatch(/abcjs-l0\b/);
  for (const c of waiting) expect(c).toMatch(/abcjs-m0\b/);
});
