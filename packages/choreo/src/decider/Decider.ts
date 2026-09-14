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

/** Tuning for {@link import('./createScriptDecider.js').createScriptDecider}. */
export interface ScriptDeciderOptions {
  /** Beats between dances, spent walking to the new dance's start stations. */
  lineUpBeats: Beat;
  /** Beats before the end of the last time through that the next dance is announced. */
  announceBeats: Beat;
  /** Beats a call keeps being said after its figure starts. */
  utteranceTailBeats: Beat;
  /** The beat the program starts on. */
  startBeat: Beat;
}

/** The pacing the demo uses, all overridable. */
export const SCRIPT_DECIDER_DEFAULTS: ScriptDeciderOptions = {
  lineUpBeats: 8,
  announceBeats: 8,
  utteranceTailBeats: 2,
  startBeat: 0,
};
