import type { UtteranceEvent } from "@caller/choreo";
import { APPLAUSE_CALLS, HANDS_FOUR, HERE_WE_GO, nextDanceCall } from "@caller/choreo";
import { BECKET_LINE_UP_CALLS, DEMO_DANCES, danceBySlug } from "@caller/contra";
import { FONT, layoutBubble } from "@caller/hall";
import { layoutHall } from "@caller/hall";
import { describe, expect, it } from "vitest";
import {
  ANNOUNCE_BEATS,
  APPLAUSE_BEATS,
  BETWEEN_DANCES_BEATS,
  CYCLE_BEATS,
  ITEM_BEATS,
  READY_BEATS,
  TIMES_THROUGH,
  WALK_BEATS,
  betweenDancesAt,
  betweenDancesStatus,
  createDemoProgram,
  positionAt,
} from "./program.js";

/**
 * The gap between two dances, as the page runs it.
 *
 * B1's ruling, in the user's words: "dance should stop between the dances.
 * caller should announce the dance, if its becket say 'turn one place to your
 * left …'. a little fanfare at the end of each dance would sell the illusion —
 * clap, etc." This is where the beats of that are pinned: how long each
 * stretch is, what the caller says over it, and that every one of those
 * sentences fits in the sixteen-column bubble the hall draws (DD16).
 *
 * The audio cannot be heard here or anywhere headless; `packages/music`'s
 * `applause.test.ts` measures the buffer instead.
 */

/** The demo hall the page ships: two lines, five couples and four. */
const world = layoutHall({ lines: 2, couplesPerLine: [5, 4] });

/** The width the hall's own caller bubble wraps at (`BUBBLE_MAX_COLS` in `hall.tsx`). */
const MAX_COLS = 16;

/** Where the interval after the first dance of a programme starts, and its parts. */
const GAP = TIMES_THROUGH * CYCLE_BEATS;
const ANNOUNCE = GAP + APPLAUSE_BEATS;
const WALK = ANNOUNCE + ANNOUNCE_BEATS;
const READY = WALK + WALK_BEATS;

/** Everything the caller says in `[from, to)`, in the order they start. */
const saidOver = (first: string | undefined, from: number, to: number): UtteranceEvent[] => {
  const program = createDemoProgram(world, first);
  // One item, so no case runs more than one time through twice over.
  program.decider.advance(ITEM_BEATS);
  return program.decider
    .timeline()
    .utterances()
    .filter((u) => u.start >= from && u.start < to)
    .sort((a, b) => a.start - b.start);
};

describe("the interval is four stretches of the silent clock", () => {
  it("is 8 applause, 16 announcement, 8 walk and 4 ready — 36 in all", () => {
    expect([APPLAUSE_BEATS, ANNOUNCE_BEATS, WALK_BEATS, READY_BEATS]).toEqual([8, 16, 8, 4]);
    expect(BETWEEN_DANCES_BEATS).toBe(36);
    expect(ITEM_BEATS).toBe(TIMES_THROUGH * CYCLE_BEATS + BETWEEN_DANCES_BEATS);
    expect(ITEM_BEATS).toBe(164);
  });

  it("names each stretch at its own beats, and nothing while the hall is dancing", () => {
    for (let beat = 0; beat < GAP; beat += 8) expect(betweenDancesAt(beat)).toBeNull();
    expect(betweenDancesAt(GAP)).toBe("applause");
    expect(betweenDancesAt(ANNOUNCE - 1e-9)).toBe("applause");
    expect(betweenDancesAt(ANNOUNCE)).toBe("announcement");
    expect(betweenDancesAt(WALK - 1e-9)).toBe("announcement");
    expect(betweenDancesAt(WALK)).toBe("walk");
    expect(betweenDancesAt(READY - 1e-9)).toBe("walk");
    expect(betweenDancesAt(READY)).toBe("ready");
    expect(betweenDancesAt(ITEM_BEATS - 1e-9)).toBe("ready");
  });

  it("reads back off the programme, looping with it", () => {
    const program = createDemoProgram(world);
    for (const [beat, phase] of [
      [0, null],
      [GAP + 1, "applause"],
      [ANNOUNCE + 1, "announcement"],
      [WALK + 1, "walk"],
      [READY + 1, "ready"],
      [ITEM_BEATS, null],
      [3 * ITEM_BEATS + GAP + 1, "applause"],
    ] as const) {
      const at = positionAt(program, beat);
      expect(at.between, `beat ${String(beat)}`).toBe(phase);
      expect(at.liningUp).toBe(phase !== null);
    }
  });

  it("says what it is doing under the card", () => {
    const program = createDemoProgram(world);
    const status = (beat: number): string => betweenDancesStatus(positionAt(program, beat));
    expect(status(0)).toBe("Time through 1 of 2");
    expect(status(CYCLE_BEATS)).toBe("Time through 2 of 2");
    expect(status(GAP + 1)).toBe(`Applause for ${DEMO_DANCES[0]!.title}`);
    expect(status(ANNOUNCE + 1)).toBe(`The caller announces ${DEMO_DANCES[1]!.title}`);
    expect(status(WALK + 1)).toBe(`Lining up for ${DEMO_DANCES[1]!.title}`);
    expect(status(READY + 1)).toBe(`Ready for ${DEMO_DANCES[1]!.title}`);
  });
});

describe("what the caller says between two dances", () => {
  it("thanks the partner and the band over the applause", () => {
    const said = saidOver(undefined, GAP, ANNOUNCE);
    expect(said.map((u) => u.text)).toEqual([...APPLAUSE_CALLS]);
    expect(said[0]!.start).toBe(GAP);
    expect(said[said.length - 1]!.end).toBe(ANNOUNCE);
  });

  it("announces a becket dance by name, then the user's own three lines", () => {
    // Airpants leads the programme, so Butter — the demo's only becket — is
    // the dance being announced in the first interval.
    const butter = danceBySlug("butter")!;
    expect(DEMO_DANCES[1]!.slug).toBe("butter");
    const said = saidOver(undefined, ANNOUNCE, WALK);
    expect(said.map((u) => u.text)).toEqual([nextDanceCall(butter), ...BECKET_LINE_UP_CALLS]);
    expect(said[0]!.text).toBe("NEXT: BUTTER, BY GENE HUBERT");
    // Four bubbles over sixteen beats is four beats each.
    for (const [i, u] of said.entries()) {
      expect(u.start).toBe(ANNOUNCE + i * 4);
      expect(u.end).toBe(ANNOUNCE + (i + 1) * 4);
    }
  });

  it("announces a duple improper dance by name, then hands four from the top", () => {
    // Butter leads, so the dance being announced is duple improper again.
    const next = DEMO_DANCES[2]!;
    const said = saidOver("butter", ANNOUNCE, WALK);
    expect(said.map((u) => u.text)).toEqual([nextDanceCall(next), HANDS_FOUR]);
    // Two bubbles over sixteen beats is eight beats each.
    expect(said[0]!.end).toBe(ANNOUNCE + 8);
    expect(said[1]!.end).toBe(WALK);
  });

  it("says nothing new over the walk, then here we go before the tune", () => {
    expect(saidOver(undefined, WALK, READY)).toEqual([]);
    const ready = saidOver(undefined, READY, ITEM_BEATS);
    // "HERE WE GO" first, and then the next dance's own first calls leading
    // into their figures as they always do. Butter's shift left has a four-beat
    // lead, so its call starts on the same beat this one does; the bubble shows
    // whichever was said first and this one is on the timeline first, so "HERE
    // WE GO" holds the bubble until the dance begins.
    expect(ready[0]!.text).toBe(HERE_WE_GO);
    expect(ready[0]!.start).toBe(READY);
    expect(ready[0]!.end).toBe(ITEM_BEATS);
    for (const u of ready.slice(1)) expect(u.start).toBeGreaterThanOrEqual(READY);
  });
});

describe("every sentence fits the caller's bubble", () => {
  /** How the hall would lay this call out, at the width `hall.tsx` uses. */
  const bubble = (text: string) =>
    layoutBubble(FONT, text, world.caller, { world: world.world, maxCols: MAX_COLS });

  const everything: string[] = [
    ...APPLAUSE_CALLS,
    HERE_WE_GO,
    HANDS_FOUR,
    ...BECKET_LINE_UP_CALLS,
    ...DEMO_DANCES.map(nextDanceCall),
  ];

  it("wraps every one of them inside the world, four lines at most", () => {
    // Four is what the longest title in the programme needs — "NEXT: NEIGHBOR,
    // NEIGHBOR ON THE WALL, BY MAIA MCCORMICK" — and it still sits inside the
    // hall. Every other sentence the caller says between two dances is two or
    // three.
    for (const text of everything) {
      const box = bubble(text);
      expect(box.lines.length, text).toBeLessThanOrEqual(4);
      expect(box.x, text).toBeGreaterThanOrEqual(-world.world.w / 2);
      expect(box.x + box.w, text).toBeLessThanOrEqual(world.world.w / 2);
      expect(box.y, text).toBeGreaterThanOrEqual(-world.world.h / 2);
      expect(box.y + box.h, text).toBeLessThanOrEqual(world.world.h / 2);
    }
  });

  it("never has to break a word, so nothing is cut off", () => {
    for (const text of everything) {
      for (const word of text.split(" ")) {
        expect(word.length, `"${word}" in "${text}"`).toBeLessThanOrEqual(MAX_COLS);
      }
    }
  });
});
