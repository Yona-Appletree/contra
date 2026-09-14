import type { Beat } from "@caller/core";
import type { Dance } from "../dance/Dance.js";
import type { Formation } from "../formation/Formation.js";
import type { Timeline, TimelineEvent } from "../timeline/Timeline.js";

/**
 * Whatever decides what happens next. A decider keeps the timeline covered
 * ahead of the play head and never looks at the clock: the layers above ask for
 * beats, the decider produces events.
 *
 * The demo ships the script decider only (`createScriptDecider`). Later actor
 * deciders add policies and offers behind this same interface, which is why
 * nothing above the timeline may call a figure directly.
 */
export interface Decider {
  /** Produce events until every dancer is covered through `until`. Returns the new ones. */
  advance(until: Beat): TimelineEvent[];
  /** The timeline being filled. */
  timeline(): Timeline;
  /** Through what beat every dancer has a figure. */
  covered(): Beat;
}

/** The dances and formations a program's slugs and ids refer to. */
export interface ChoreoLibrary {
  dances: Readonly<Record<string, Dance>>;
  formations: Readonly<Record<string, Formation>>;
}

/** A library over two lists, keyed the way a `Program` and a `Dance` refer to them. */
export function createLibrary(
  dances: readonly Dance[],
  formations: readonly Formation[],
): ChoreoLibrary {
  return {
    dances: Object.fromEntries(dances.map((d) => [d.slug, d])),
    formations: Object.fromEntries(formations.map((f) => [f.id, f])),
  };
}

/** Look a program's dance up, with a useful error when it is missing. */
export function danceOf(library: ChoreoLibrary, slug: string): Dance {
  const dance = library.dances[slug];
  if (!dance) {
    throw new Error(`no dance "${slug}" (have: ${Object.keys(library.dances).join(", ")})`);
  }
  return dance;
}

/** Look a dance's formation up, with a useful error when it is missing. */
export function formationOf(library: ChoreoLibrary, dance: Dance): Formation {
  const formation = library.formations[dance.formation];
  if (!formation) {
    throw new Error(
      `dance "${dance.slug}" wants formation "${dance.formation}" (have: ${Object.keys(library.formations).join(", ")})`,
    );
  }
  return formation;
}

/** Which item of a program is running, and how far into it. */
export interface ScriptPosition {
  itemIndex: number;
  timeThrough: number;
  beat: Beat;
}

/**
 * Tuning for {@link import('./createScriptDecider.js').createScriptDecider}.
 *
 * The four `*Beats` numbers are the between-dances interval, in that order:
 * the music stops on the tune's last bar, the hall applauds, the caller
 * announces the next dance, everybody walks to their new places, and then they
 * stand ready for a phrase while the caller says "here we go". Nothing plays
 * through any of it — see `apps/web/src/program.ts`.
 */
export interface ScriptDeciderOptions {
  /** Beats the hall claps for at the end of a dance, before anything is said. */
  applauseBeats: Beat;
  /** Beats the caller spends announcing the next dance, standing still. */
  announceBeats: Beat;
  /** Beats spent walking to the new dance's start places, after the announcement. */
  lineUpBeats: Beat;
  /** Beats everybody stands in their new places before the next tune starts. */
  readyBeats: Beat;
  /** What the caller says over the applause, one bubble each. */
  applauseCalls: readonly string[];
  /**
   * What the caller says to get the hall into a formation that names no words
   * of its own ({@link import('../formation/Formation.js').Formation.lineUpCalls}).
   */
  lineUpCalls: readonly string[];
  /** What the caller says over the last beats before the tune comes in. */
  readyCall: string;
  /** Beats a call keeps being said after its figure starts. */
  utteranceTailBeats: Beat;
  /** The beat the program starts on. */
  startBeat: Beat;
}

/** What the caller says once everybody has lined up for a new dance. */
export const HANDS_FOUR = "HANDS FOUR FROM THE TOP";

/** What the caller says over the last beats before the tune comes back in. */
export const HERE_WE_GO = "HERE WE GO";

/** What the caller says over the applause, one bubble each. */
export const APPLAUSE_CALLS: readonly string[] = ["THANK YOUR PARTNER", "THANK THE BAND"];

/** The pacing the demo uses, all overridable. */
export const SCRIPT_DECIDER_DEFAULTS: ScriptDeciderOptions = {
  applauseBeats: 8,
  announceBeats: 16,
  lineUpBeats: 8,
  readyBeats: 4,
  applauseCalls: APPLAUSE_CALLS,
  lineUpCalls: [HANDS_FOUR],
  readyCall: HERE_WE_GO,
  utteranceTailBeats: 2,
  startBeat: 0,
};

/**
 * How long the whole gap between two dances is, in beats.
 *
 * Read from the options rather than written down twice: `apps/web`'s programme
 * arithmetic (`ITEM_BEATS`, `musicBeatOf`, `programBeatOf`) has to agree with
 * the decider exactly or the tune drifts against the dance, and the only way
 * to keep two numbers equal is to have one.
 */
export const betweenDancesBeats = (opts: ScriptDeciderOptions): Beat =>
  opts.applauseBeats + opts.announceBeats + opts.lineUpBeats + opts.readyBeats;
