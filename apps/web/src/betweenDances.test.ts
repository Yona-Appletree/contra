import type { UtteranceEvent } from "@caller/choreo";
import { HANDS_FOUR_CALLS, HERE_WE_GO, THANKS_CALLS, nextDanceCall } from "@caller/choreo";
import { reachReport } from "@caller/choreo";
import { becketHandsFourCalls, DEMO_DANCES, danceBySlug } from "@caller/contra";
import { FONT, layoutBubble } from "@caller/hall";
import { layoutHall } from "@caller/hall";
import { describe, expect, it } from "vitest";
import {
  ANNOUNCE_BEATS,
  BETWEEN_DANCES_BEATS,
  CYCLE_BEATS,
  ITEM_BEATS,
  POTATO_BEATS,
  RING_BEATS,
  THANKS_BEATS,
  TIMES_THROUGH,
  WALK_BEATS,
  bandPlaying,
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
 * clap, etc." — reversed by the user's later word (B4, DD39): "no one claps in
 * contra." This is where the beats of that are pinned: how long each stretch
 * is, what the caller says over it, and that every one of those sentences fits
 * in the sixteen-column bubble the hall draws (DD16).
 *
 * The audio cannot be heard here or anywhere headless.
 */

/** The demo hall the page ships: two lines, five couples and four. */
const world = layoutHall({ lines: 2, couplesPerLine: [5, 4] });

/** The width the hall's own caller bubble wraps at (`BUBBLE_MAX_COLS` in `hall.tsx`). */
const MAX_COLS = 16;

/** Where the interval after the first dance of a programme starts, and its parts. */
const GAP = TIMES_THROUGH * CYCLE_BEATS;
const ANNOUNCE = GAP + THANKS_BEATS;
const WALK = ANNOUNCE + ANNOUNCE_BEATS;
const RING = WALK + WALK_BEATS;
const POTATOES = RING + RING_BEATS;

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

describe("the interval is five stretches of the silent clock", () => {
  it("is 8 thanks, 16 announcement, 8 walk, 8 hands four and 4 potatoes — 44 in all", () => {
    expect([THANKS_BEATS, ANNOUNCE_BEATS, WALK_BEATS, RING_BEATS, POTATO_BEATS]).toEqual([
      8, 16, 8, 8, 4,
    ]);
    expect(BETWEEN_DANCES_BEATS).toBe(44);
    expect(ITEM_BEATS).toBe(TIMES_THROUGH * CYCLE_BEATS + BETWEEN_DANCES_BEATS);
    expect(ITEM_BEATS).toBe(172);
  });

  it("names each stretch at its own beats, and nothing while the hall is dancing", () => {
    for (let beat = 0; beat < GAP; beat += 8) expect(betweenDancesAt(beat)).toBeNull();
    expect(betweenDancesAt(GAP)).toBe("thanks");
    expect(betweenDancesAt(ANNOUNCE - 1e-9)).toBe("thanks");
    expect(betweenDancesAt(ANNOUNCE)).toBe("announcement");
    expect(betweenDancesAt(WALK - 1e-9)).toBe("announcement");
    expect(betweenDancesAt(WALK)).toBe("walk");
    expect(betweenDancesAt(RING - 1e-9)).toBe("walk");
    expect(betweenDancesAt(RING)).toBe("hands-four");
    expect(betweenDancesAt(POTATOES - 1e-9)).toBe("hands-four");
    expect(betweenDancesAt(POTATOES)).toBe("potatoes");
    expect(betweenDancesAt(ITEM_BEATS - 1e-9)).toBe("potatoes");
  });

  it("reads back off the programme, looping with it", () => {
    const program = createDemoProgram(world);
    for (const [beat, phase] of [
      [0, null],
      [GAP + 1, "thanks"],
      [ANNOUNCE + 1, "announcement"],
      [WALK + 1, "walk"],
      [RING + 1, "hands-four"],
      [POTATOES + 1, "potatoes"],
      [ITEM_BEATS, null],
      [3 * ITEM_BEATS + GAP + 1, "thanks"],
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
    expect(status(GAP + 1)).toBe(`Thanks for ${DEMO_DANCES[0]!.title}`);
    expect(status(ANNOUNCE + 1)).toBe(`The caller announces ${DEMO_DANCES[1]!.title}`);
    expect(status(WALK + 1)).toBe(`Lining up for ${DEMO_DANCES[1]!.title}`);
    expect(status(RING + 1)).toBe(`Hands four for ${DEMO_DANCES[1]!.title}`);
    expect(status(POTATOES + 1)).toBe(`Potatoes for ${DEMO_DANCES[1]!.title}`);
  });

  /**
   * R1, in the user's words: "band shouldn't be playing when no dancing is
   * happening." The band goes still for the whole interval and picks its
   * instruments back up on the first potato, which is what a real band does.
   */
  it("has the band playing while a tune is on, still all interval, and back on the potatoes", () => {
    for (const beat of [0, 1, 63, 64, GAP - 1]) expect(bandPlaying(beat), `${beat}`).toBe(true);
    for (let beat = GAP; beat < POTATOES; beat += 1) {
      expect(bandPlaying(beat), `beat ${String(beat)}`).toBe(false);
    }
    for (let beat = POTATOES; beat < ITEM_BEATS; beat += 1) {
      expect(bandPlaying(beat), `beat ${String(beat)}`).toBe(true);
    }
    expect(bandPlaying(ITEM_BEATS)).toBe(true);
    // And it holds for every later item too, not only the first.
    expect(bandPlaying(3 * ITEM_BEATS + GAP + 1)).toBe(false);
    expect(bandPlaying(3 * ITEM_BEATS + POTATOES + 1)).toBe(true);
  });
});

describe("what the caller says between two dances", () => {
  it("thanks the partner and then the neighbour, not the band", () => {
    const said = saidOver(undefined, GAP, ANNOUNCE);
    expect(said.map((u) => u.text)).toEqual([...THANKS_CALLS]);
    expect(said[0]!.start).toBe(GAP);
    expect(said[said.length - 1]!.end).toBe(ANNOUNCE);
  });

  it("announces every dance by name and then how to take hands four", () => {
    // Airpants leads the programme, so Butter — the demo's only becket — is
    // the dance being announced in the first interval. Every formation gets
    // the same two line-up bubbles now: the words are about the ring, and a
    // ring is a ring.
    const butter = danceBySlug("butter")!;
    expect(DEMO_DANCES[1]!.slug).toBe("butter");
    const becket = saidOver(undefined, ANNOUNCE, WALK);
    expect(becket.map((u) => u.text)).toEqual([nextDanceCall(butter), ...HANDS_FOUR_CALLS]);
    expect(becket[0]!.text).toBe("NEXT: BUTTER, BY GENE HUBERT");

    // Butter leads, so the dance being announced is duple improper again.
    const duple = saidOver("butter", ANNOUNCE, WALK);
    expect(duple.map((u) => u.text)).toEqual([nextDanceCall(DEMO_DANCES[2]!), ...HANDS_FOUR_CALLS]);

    // Three bubbles over sixteen beats, whichever formation it is.
    for (const said of [becket, duple]) {
      for (const [i, u] of said.entries()) {
        expect(u.start).toBeCloseTo(ANNOUNCE + (i * ANNOUNCE_BEATS) / 3, 9);
        expect(u.end).toBeCloseTo(ANNOUNCE + ((i + 1) * ANNOUNCE_BEATS) / 3, 9);
      }
    }
  });

  it("gives a becket hall the user's own three sentences over the walk and the ring", () => {
    // The direction is derived, not typed: `MOVE ONE PLACE TO YOUR LEFT`
    // because Butter's becket progresses left. A right-progressing becket says
    // RIGHT — see `@caller/contra`'s `lineUpShift.test.ts`.
    const said = saidOver(undefined, WALK, POTATOES);
    expect(said.map((u) => u.text)).toEqual([...becketHandsFourCalls("left")]);
    expect(said[0]!.text).toBe("MOVE ONE PLACE TO YOUR LEFT");
    expect(said[0]!.start).toBe(WALK);
    expect(said[said.length - 1]!.end).toBe(POTATOES);
  });

  it("says nothing extra while a duple improper hall lines up", () => {
    expect(saidOver("butter", WALK, POTATOES)).toEqual([]);
  });

  it("says here we go over the first potatoes and the first figure over the last two", () => {
    const said = saidOver(undefined, POTATOES, ITEM_BEATS);
    expect(said[0]!.text).toBe(HERE_WE_GO);
    expect(said[0]!.start).toBe(POTATOES);
    // The dance's own first call lands on potato 3: two beats before beat 1,
    // which is the user's "2 potatoes and then 'balance and swing'". "HERE WE
    // GO" ends exactly there, so the bubble hands over rather than overlapping.
    const first = said[1]!;
    expect(first.start).toBe(ITEM_BEATS - 2);
    expect(said[0]!.end).toBe(first.start);
    expect(POTATOES + POTATO_BEATS).toBe(ITEM_BEATS);
    expect(first.end).toBeGreaterThan(ITEM_BEATS);
  });
});

describe("every sentence fits the caller's bubble", () => {
  /** How the hall would lay this call out, at the width `hall.tsx` uses. */
  const bubble = (text: string) =>
    layoutBubble(FONT, text, world.caller, { world: world.world, maxCols: MAX_COLS });

  const everything: string[] = [
    ...THANKS_CALLS,
    HERE_WE_GO,
    ...HANDS_FOUR_CALLS,
    ...becketHandsFourCalls("left"),
    ...becketHandsFourCalls("right"),
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

/**
 * The arms, over the whole interval.
 *
 * AC1: a hand is never further from its own shoulder than the arm can reach.
 * The hands-four ring is the first thing between two dances to *place* a hand
 * at all — before B3 everybody's arms hung by their sides from the last note
 * to the first — so this is where the invariant has to be re-proved.
 */
describe("nobody reaches further than an arm goes", () => {
  // ~20k arm solves; a couple of hundred ms here, and CI's runner is up to
  // fifteen times slower than this Mac under the full turbo run.
  it(
    "holds AC1 through the thanks, the walk, the ring and the potatoes",
    { timeout: 20_000 },
    () => {
      const program = createDemoProgram(world);
      // One interval, which is all this milestone changed; the dancing beats
      // either side of it are every other milestone's oracle.
      program.decider.advance(ITEM_BEATS + 4);
      const report = reachReport(program.decider.timeline(), GAP, ITEM_BEATS + 2);
      expect(report.hands).toBeGreaterThan(0);
      expect(
        report.maxShort,
        `worst: ${JSON.stringify(report.worst)} over ${String(report.hands)} hands`,
      ).toBeLessThanOrEqual(0);
    },
  );
});
