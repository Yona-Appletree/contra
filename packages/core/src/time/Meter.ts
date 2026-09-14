import type { Beat } from "./Clock.js";

/**
 * How beats group into bars and phrases, in the dance count: a beat is a
 * dance count, not a musical beat. A reel or jig bar is 2 beats (a 32-bar
 * tune is 64 beats), and a phrase — the A1/A2/B1/B2 a contra figure is
 * written against — is 8 bars, i.e. 16 beats.
 */
export interface Meter {
  beatsPerBar: number;
  barsPerPhrase: number;
}

/** The meter a reel tune uses. */
export const REEL: Meter = { beatsPerBar: 2, barsPerPhrase: 8 };

/** The meter a jig tune uses: a 6/8 jig bar is also two dance beats. */
export const JIG: Meter = { beatsPerBar: 2, barsPerPhrase: 8 };

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
