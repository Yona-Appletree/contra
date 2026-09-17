import { BUTTER_PROGRAM, BUTTER_TONIGHT } from "../src/dances/butter.js";
import { contraDialect } from "../src/dialect/contra/Contra.js";
import type { ContraFormation } from "../src/dialect/contra/formations.js";
import type { Dialect } from "../src/dialect/Dialect.js";
import { PAIR, PAIR_SOLO } from "../src/dialect/pair/Pair.js";
import { FIXTURE_PROGRAM } from "../src/lang/fixture.js";

/** A time through, and the four phrases it is made of. */
export const TIME_THROUGH_BEATS = 64;
const PHRASES = ["A1", "A2", "B1", "B2"] as const;

/** The floor the contra dialect is asked for: how the set stands, and how long it is. */
export interface Floor {
  formation: ContraFormation;
  couples: number;
}

/**
 * A program and the floor it wants. `fixed` is a dialect of its own — the
 * pair, which has no formation and no couples — and everything else is
 * contra, whose floor the transport's own controls decide.
 */
export interface Preset {
  label: string;
  source: string;
  fixed?: Dialect;
  floor?: Floor;
}

export const PRESETS: Record<string, Preset> = {
  pair: { label: "pair — bow, do-si-do, allemande", source: FIXTURE_PROGRAM, fixed: PAIR },
  solo: { label: "pair, nobody across", source: FIXTURE_PROGRAM, fixed: PAIR_SOLO },
  contra: {
    label: "contra — bow, do-si-do, allemande",
    source: FIXTURE_PROGRAM.replace("across", "neighbor"),
    floor: { formation: "becket", couples: 2 },
  },
  butter: {
    label: "Butter — tonight (chain and hey stood in)",
    source: BUTTER_TONIGHT,
    floor: { formation: "becket", couples: 4 },
  },
  butterFull: {
    label: "Butter — the dance (chain and hey not yet written)",
    source: BUTTER_PROGRAM,
    floor: { formation: "becket", couples: 4 },
  },
};

export const dialectOf = (preset: Preset, floor: Floor): Dialect =>
  preset.fixed ?? contraDialect(floor);

/** How many times through a run of `endBeat` beats is; never fewer than one. */
export const timesThrough = (endBeat: number): number =>
  Math.max(1, Math.ceil(endBeat / TIME_THROUGH_BEATS));

/** `time 3 · A2 · beat 71.50` — where the bar is, in a caller's own words. */
export const timeLabel = (beat: number): string => {
  const time = Math.floor(beat / TIME_THROUGH_BEATS) + 1;
  const phrase = PHRASES[Math.floor((beat % TIME_THROUGH_BEATS) / 16)] ?? "A1";
  return `time ${String(time)} · ${phrase} · beat ${beat.toFixed(2)}`;
};
