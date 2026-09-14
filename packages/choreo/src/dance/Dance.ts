import type { Beat } from "@caller/core";
import type { StationId } from "../formation/Formation.js";

/**
 * Which dancers of a group a figure call is aimed at. `'all'` is every station;
 * an array names stations directly; any other string is a tag the formation
 * defines (see `Formation.tags`).
 *
 * The pairing tags — contra's `'neighbors'` and `'partners'` — name *who you
 * dance it with*, not a subset of the floor, so a formation resolves them to
 * the whole group and the pairing itself is a figure parameter. That is M8's
 * business; here they are carried and resolved, not interpreted.
 */
export type Selector =
  | "all"
  | "larks"
  | "robins"
  | "ones"
  | "twos"
  | "neighbors"
  | "partners"
  | StationId[];

/** One figure in a dance. Data only: no functions, so it serialises. */
export interface FigureCall {
  /** A figure id in the registry. */
  figure: string;
  beats: Beat;
  params?: object;
  who?: Selector;
  /** Overrides the figure's own call text for this dance. */
  call?: string;
}

/** The four phrases of a contra tune, in order. */
export type PhraseName = "A1" | "A2" | "B1" | "B2";

/** One phrase of a dance. */
export interface DancePhrase {
  name: PhraseName;
  figures: FigureCall[];
}

/** A dance, as data. Survives `JSON.parse(JSON.stringify(dance))` unchanged. */
export interface Dance {
  slug: string;
  title: string;
  author: string;
  /** A formation id. */
  formation: string;
  phrases: DancePhrase[];
  notes?: string;
}

/** One dance in a program, with the medley it is danced to. */
export interface ProgramItem {
  /** A dance slug. */
  dance: string;
  /** A medley slug, for `@caller/music`. */
  medley: string;
  timesThrough: number;
}

/** An evening, as data. */
export interface Program {
  slug: string;
  items: ProgramItem[];
}

/** How many beats a phrase's figures add up to. */
export const phraseBeats = (phrase: DancePhrase): Beat =>
  phrase.figures.reduce((sum, f) => sum + f.beats, 0);

/**
 * How long one time through is: the sum of every phrase.
 *
 * Derived from the dance's own data, never from a meter constant — the beat is
 * the dance count, and a dance says how many counts it takes.
 */
export const danceBeats = (dance: Dance): Beat =>
  dance.phrases.reduce((sum, p) => sum + phraseBeats(p), 0);

/**
 * Check a dance is well formed, throwing on the first problem.
 *
 * Every phrase must be the same length and every figure must end on a figure
 * boundary inside it (vision D11: figure ends are fixed to phrase boundaries,
 * which is what lets the decider switch dances mid-tune without a feature).
 */
export function validateDance(dance: Dance): Dance {
  if (dance.phrases.length === 0) throw new Error(`dance "${dance.slug}" has no phrases`);
  const first = phraseBeats(dance.phrases[0]!);
  for (const phrase of dance.phrases) {
    if (phrase.figures.length === 0) {
      throw new Error(`dance "${dance.slug}" phrase ${phrase.name} has no figures`);
    }
    const beats = phraseBeats(phrase);
    if (beats !== first) {
      throw new Error(
        `dance "${dance.slug}" phrase ${phrase.name} is ${beats} beats, ${dance.phrases[0]!.name} is ${first}`,
      );
    }
    for (const call of phrase.figures) {
      if (!(call.beats > 0)) {
        throw new Error(`dance "${dance.slug}" ${phrase.name}: "${call.figure}" has no duration`);
      }
    }
  }
  return dance;
}

/** Every figure call of a dance in order, with the beat it starts on. */
export function danceSchedule(dance: Dance): Array<{ call: FigureCall; start: Beat; phrase: PhraseName }> {
  const out: Array<{ call: FigureCall; start: Beat; phrase: PhraseName }> = [];
  let beat = 0;
  for (const phrase of dance.phrases) {
    for (const call of phrase.figures) {
      out.push({ call, start: beat, phrase: phrase.name });
      beat += call.beats;
    }
  }
  return out;
}
