import { medleys } from "@caller/music";
import { describe, expect, it } from "vitest";
import { tuneAt } from "./routes/hall.js";
import {
  BETWEEN_DANCES_BEATS,
  CYCLE_BEATS,
  ITEM_BEATS,
  MUSIC_BEATS_PER_ITEM,
  TIMES_THROUGH,
  lineUpStartOf,
  musicBeatOf,
  musicItemEnd,
  programBeatOf,
  shownMusicBeat,
} from "./program.js";

/**
 * The gap between two dances is silent, and the next tune starts at its own
 * beat 0.
 *
 * M9's page looped the tune through the eight-beat line-up, so every dance
 * switch put the music eight beats out of phase with the dance; after eight
 * switches the drift was a whole time through, and the tune changed in the
 * middle of the last dance. B1 made the gap a real between-dances interval —
 * applause, announcement, walk, ready — which is 36 beats and would drift four
 * and a half times as fast. The arithmetic below is what the page runs on
 * instead: the music counts dancing beats only, whatever the gap is.
 */

/** Four dances, so the programme makes three switches. */
const DANCES = 4;
const starts = Array.from({ length: DANCES }, (_, i) => i * ITEM_BEATS);

describe("the tune starts at its own beat 0 at every dance start", () => {
  it("is on a tune-cycle boundary at every dance start, over three switches", () => {
    for (const start of starts) {
      const music = musicBeatOf(start);
      expect(music, `dance at beat ${String(start)}`).not.toBeNull();
      expect(music! % CYCLE_BEATS, `dance at beat ${String(start)}`).toBe(0);
    }
  });

  it("is the drift the old arithmetic had, one whole interval a switch", () => {
    // The number this test exists to remove: with the tune looping through the
    // gap, the programme beat itself was the tune's beat, and each dance start
    // fell another `BETWEEN_DANCES_BEATS` further into a 64-beat tune cycle.
    const drift = starts.map((s) => s % CYCLE_BEATS);
    expect(drift).toEqual(starts.map((_, i) => (i * BETWEEN_DANCES_BEATS) % CYCLE_BEATS));
    expect(BETWEEN_DANCES_BEATS).toBe(36);
    // Two switches would already be more than a whole time through.
    expect(2 * BETWEEN_DANCES_BEATS).toBeGreaterThan(CYCLE_BEATS);
  });

  it("reads back to the same beat of the evening", () => {
    for (const start of starts) {
      expect(programBeatOf(musicBeatOf(start)!)).toBe(start);
    }
    // And through a whole dance, not only at its start.
    for (let into = 0; into < MUSIC_BEATS_PER_ITEM; into += 7) {
      const beat = 2 * ITEM_BEATS + into;
      expect(programBeatOf(musicBeatOf(beat)!)).toBeCloseTo(beat, 9);
    }
  });

  it("has no music beat at all during a line-up", () => {
    for (const start of starts) {
      for (let into = MUSIC_BEATS_PER_ITEM; into < ITEM_BEATS; into += 1) {
        expect(musicBeatOf(start + into), `beat ${String(start + into)}`).toBeNull();
      }
    }
  });

  it("stops the tune where the line-up starts", () => {
    for (const [index, start] of starts.entries()) {
      const music = musicBeatOf(start)!;
      expect(musicItemEnd(music)).toBe((index + 1) * MUSIC_BEATS_PER_ITEM);
      expect(lineUpStartOf(music)).toBe(start + MUSIC_BEATS_PER_ITEM);
    }
  });

  it("gives each dance a whole number of tune cycles", () => {
    expect(MUSIC_BEATS_PER_ITEM).toBe(TIMES_THROUGH * CYCLE_BEATS);
    expect(MUSIC_BEATS_PER_ITEM % CYCLE_BEATS).toBe(0);
  });
});

describe("the tune changes between two dances, never inside one", () => {
  const medley = medleys[0]!;

  it("plays one tune for the whole of each dance", () => {
    for (const [index, start] of starts.entries()) {
      const first = tuneAt(medley, shownMusicBeat(start));
      for (let into = 0; into < MUSIC_BEATS_PER_ITEM; into += 4) {
        expect(tuneAt(medley, shownMusicBeat(start + into)).slug, `dance ${String(index)}`).toBe(
          first.slug,
        );
      }
      // Through the line-up after it, the notation is already on the next tune.
      const next = tuneAt(medley, shownMusicBeat(start + MUSIC_BEATS_PER_ITEM + 1));
      expect(next.slug).toBe(tuneAt(medley, shownMusicBeat(start + ITEM_BEATS)).slug);
    }
  });

  it("changes tune at every switch of this medley", () => {
    // `reel-set` is two tunes, each `timesThroughEach` cycles, and a dance is
    // exactly that many cycles — so it is a new tune every dance.
    expect(medley.timesThroughEach * CYCLE_BEATS).toBe(MUSIC_BEATS_PER_ITEM);
    const played = starts.map((s) => tuneAt(medley, shownMusicBeat(s)).slug);
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
  });
});
