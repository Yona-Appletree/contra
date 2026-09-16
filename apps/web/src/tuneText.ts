import type { Beat } from "@caller/core";
import type { Tune } from "@caller/music";

/**
 * The words the Tunes tab prints for a tune's data (F4): its key as a
 * player would say it, and where in the tune a beat falls.
 */

/** `D` → "D major", `Em` → "E minor", `AMix` → "A mixolydian". */
export function keyName(key: string): string {
  const found = /^\s*([A-G])([#b]?)([A-Za-z]*)/.exec(key);
  if (found === null) return key;
  const [, letter = "", accidental = "", modeWord = ""] = found;
  const tonic = `${letter}${accidental === "#" ? "♯" : accidental === "b" ? "♭" : ""}`;
  const mode = MODE_NAMES[modeWord.toLowerCase().slice(0, 3)];
  return mode === undefined ? key : `${tonic} ${mode}`;
}

/** ABC's mode words, by their first three letters, with the bare key as major. */
const MODE_NAMES: Readonly<Record<string, string>> = {
  "": "major",
  maj: "major",
  m: "minor",
  min: "minor",
  aeo: "minor",
  dor: "dorian",
  mix: "mixolydian",
  lyd: "lydian",
  phr: "phrygian",
  loc: "locrian",
};

/** The four phrases of a 64-beat tune, in the order the card and the notation use. */
export const PHRASE_NAMES = ["A1", "A2", "B1", "B2"] as const;

/** Where in the tune a beat is: which phrase, which bar of it (1-based), or the count-in. */
export function positionText(tune: Pick<Tune, "meter" | "beatsPerCycle">, beat: Beat): string {
  if (beat < 0) return "counting in";
  const bar = barAt(tune, beat);
  const phrase = PHRASE_NAMES[Math.floor(bar / tune.meter.barsPerPhrase)] ?? "";
  return `${phrase} · bar ${String((bar % tune.meter.barsPerPhrase) + 1)}`;
}

/** The bar a beat falls in, 0 to 31, wrapping every cycle. */
export function barAt(tune: Pick<Tune, "meter" | "beatsPerCycle">, beat: Beat): number {
  const cycle = tune.beatsPerCycle;
  const t = ((beat % cycle) + cycle) % cycle;
  return Math.floor(t / tune.meter.beatsPerBar);
}

/**
 * Where a jukebox's medley beat falls: which item of a queue of `n` tunes is
 * sounding, the beat within it (0 to `timesThrough × 64 − 1`, or negative
 * through the potatoes before the first), and which time through that is.
 * The queue wraps, as the player's own sequence does.
 */
export function jukeboxPosition(
  beat: Beat,
  n: number,
  timesThrough: number,
  beatsPerCycle = 64,
): { index: number; beat: Beat; timeThrough: number } {
  const per = timesThrough * beatsPerCycle;
  if (beat < 0 || n <= 0) return { index: 0, beat, timeThrough: 1 };
  const item = Math.floor(beat / per);
  const inTune = beat - item * per;
  return {
    index: item % n,
    beat: inTune,
    timeThrough: Math.floor(inTune / beatsPerCycle) + 1,
  };
}
