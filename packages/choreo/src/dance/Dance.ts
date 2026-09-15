import type { Beat } from "@caller/core";
import type { EndPose } from "../figure/FigureDef.js";
import type { GroupSelector, StationId } from "../formation/Formation.js";

/**
 * The tags contra formations happen to define, named for the sake of editor
 * completion. They are not the whole list and this package never reads them: a
 * square defines `heads` and `sides` and has no `ones` at all.
 */
export type CommonSelector =
  "all" | "larks" | "robins" | "ones" | "twos" | "neighbors" | "partners";

/**
 * Which dancers of a group a figure call is aimed at. `'all'` is every station;
 * an array names stations directly; **any other string is a tag the formation
 * defines** and resolves (see `Formation.tags`), which is what keeps the
 * selector form-neutral.
 *
 * The pairing tags — contra's `'neighbors'` and `'partners'` — name *who you
 * dance it with*, not a subset of the floor, so a formation resolves them to
 * the whole group and the pairing itself is a figure parameter. That is M8's
 * business; here they are carried and resolved, not interpreted.
 */
export type Selector = CommonSelector | (string & Record<never, never>) | StationId[];

/** One figure in a dance. Data only: no functions, so it serialises. */
export interface FigureCall {
  /** A figure id in the registry. */
  figure: string;
  beats: Beat;
  params?: object;
  who?: Selector;
  /**
   * How wide this call draws its dancers from — which partition of the whole set
   * it runs in ({@link Formation.groupsFor}). Left out is `"hands-four"`, the
   * ordinary minor set, which is every call written so far.
   *
   * `who` picks dancers *within* a group; this picks the group. A figure that
   * reaches past the minor set — a shadow allemande, a diagonal chain, long
   * lines that sweep the couple standing out — says so here, and `who` then
   * names its dancers in the wider layout exactly as it does in the narrow one.
   */
  group?: GroupSelector;
  /**
   * Which true end(s) a widened group's call is willing to widen into. Default
   * `"both"`.
   *
   * A selector like `"line"` computes the *widest* widening it can — up to six
   * stations, four dancing plus a waiting couple at each true end that has
   * one — regardless of this field (`Formation.groupsFor` never reads it).
   * `ends` is what the decider consults, per call, to decide whether *this*
   * call actually reaches a given true end's waiting couple: `long-lines`
   * ("dancers standing out normally do participate") is `"both"`,
   * `down-the-hall` ("dancers out at the bottom... have to walk down, too") is
   * `"bottom"`, so a `wait-top` couple is never swept into it even in the same
   * schedule as a `"both"` call that does sweep it in. Read by asking the
   * formation for two well-known tag names, `"wait-top"`/`"wait-bottom"` — the
   * same vocabulary `GroupPlan.kind`'s two outs already use — and excluding
   * whichever of them this call's `ends` does not permit; a formation that
   * never widens anything need not define either tag.
   */
  ends?: "both" | "top" | "bottom";
  /** Overrides the figure's own call text for this dance. */
  call?: string;
  /**
   * Overrides the rhythm estimate ({@link import('../decider/spokenBeats.js').spokenBeats})
   * of how long this call takes to say, in beats.
   *
   * Left out — every call so far — is the estimate from the words themselves;
   * this is for the rare call the estimate gets wrong (a number spelled out,
   * an abbreviation, a name).
   */
  spokenBeats?: Beat;
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
  /**
   * Where each station's dancer stands at beat 0 of **every** time through, in
   * the group frame's own axes. Left out — the usual case — means the
   * formation's own stations.
   *
   * A dance whose first figure is the progression starts somewhere else. A
   * becket dance that shifts left in its first two beats dances the rest of the
   * time through with the couple it shifted *to*, so the minor set a time
   * through runs in is the one the shift makes, and the dancers begin one
   * couple place back along their own line. The stations stay the formation's;
   * this says where the dance picks people up from and, by the same token,
   * where it has to leave them — closure (AC5) is measured against these places
   * in the progressed set, not against the stations.
   *
   * Two things read it: the eight-beat line-up walks people here rather than to
   * the stations, and a waiting couple's `wait-out` crosses over from here. The
   * dance's own figures are told by their own parameters, which is what
   * `chainCalls` threads.
   */
  startPlaces?: Record<StationId, EndPose>;
  /**
   * Parameters for the figure a waiting couple is given (`wait-out`), for the
   * dances that need to say something about it. Left out is the figure's own
   * defaults, which is every dance so far bar one.
   *
   * A becket dance that shifts left in two beats needs its waiting couple to
   * slide off the end of the line in the same two beats: `wait-out` takes four
   * to step together by default, and a couple still sliding at beat 2 is 0.06 px
   * from the couple sliding into the place it is leaving (AC6 wants 8).
   */
  waitOut?: object;
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
export function danceSchedule(
  dance: Dance,
): Array<{ call: FigureCall; start: Beat; phrase: PhraseName }> {
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
