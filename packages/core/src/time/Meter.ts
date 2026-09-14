import type { Beat } from "./Clock.js";

/**
 * How beats group into bars and phrases. Comes from the tune, not from the
 * dance: a reel is 4 beats per bar and 2 bars per phrase, so phrases are the
 * 8 beats a contra figure is written against.
 */
export interface Meter {
  beatsPerBar: number;
  barsPerPhrase: number;
}

/** The meter every tune in the demo uses. */
export const REEL: Meter = { beatsPerBar: 4, barsPerPhrase: 2 };

/** Beats in one phrase. */
export const beatsPerPhrase = (meter: Meter): number => meter.beatsPerBar * meter.barsPerPhrase;

/** Which phrase `beat` falls in, counting from 0 and floored. */
export const phraseOf = (meter: Meter, beat: Beat): number =>
  Math.floor(beat / beatsPerPhrase(meter));

/** Position within the phrase, in `[0, beatsPerPhrase)`. */
export const beatInPhrase = (meter: Meter, beat: Beat): Beat => {
  const n = beatsPerPhrase(meter);
  return ((beat % n) + n) % n;
};
