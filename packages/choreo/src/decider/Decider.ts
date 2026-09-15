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
 * The five `*Beats` numbers are the between-dances interval, in that order: the
 * music stops on the tune's last bar, the hall turns and nods to thank the
 * people it danced with, the caller announces the next dance, everybody walks
 * to their new places, they take hands four in a ring (and a becket hall moves
 * one place round it), and then the band plays four potatoes into the dance.
 * Nothing plays through any of it but those four beats — see
 * `apps/web/src/program.ts`.
 */
export interface ScriptDeciderOptions {
  /**
   * Beats the hall spends thanking the people it danced with, before anything
   * is said: half turned to the partner, half to the neighbour. No clapping —
   * the user: "no one claps in contra."
   */
  thanksBeats: Beat;
  /** Beats the caller spends announcing the next dance, standing still. */
  announceBeats: Beat;
  /** Beats spent walking to the new dance's start places, after the announcement. */
  lineUpBeats: Beat;
  /**
   * Beats the hall spends taking hands four in a ring, and moving one place
   * round it when the formation's progression asks for a shift.
   *
   * B3's stretch. The ring is *held* past the end of it, into the potatoes:
   * the figure runs `ringBeats + readyBeats` and lets go over the last two, so
   * the hall is standing in its rings while the band counts it in and has its
   * hands back by its sides for beat 1.
   */
  ringBeats: Beat;
  /**
   * Beats between the hands four and the dance: the potatoes.
   *
   * Four strong chords from the band, one a beat — "it's basically '5 6 7 8'
   * before the '1 2 3 4 …' of the dance" — over which the hall opens out of its
   * ring and the caller says the first figure.
   */
  readyBeats: Beat;
  /** What the caller says over the thanks, one bubble each. */
  thanksCalls: readonly string[];
  /**
   * What the caller says to get the hall into a formation that names no words
   * of its own ({@link import('../formation/Formation.js').Formation.lineUpCalls}).
   */
  lineUpCalls: readonly string[];
  /**
   * What the caller says over the first potatoes, before the first figure's own
   * call takes the bubble.
   *
   * B3 kept this where B1 put it rather than dropping it (the brief offered
   * both): the potatoes are only two beats of bubble before the first call
   * needs it, and without something on them the hall would be reading "robins
   * on the right, larks on the left" for eighteen beats.
   */
  readyCall: string;
  /**
   * Beats a figure's own call keeps being said past its spoken length.
   *
   * C3: a call used to run a fixed two beats into its figure regardless of the
   * words; now it lasts however long it takes to say ({@link
   * import('./spokenBeats.js').spokenBeats}) plus this short tail, so the
   * bubble does not vanish on the word's last syllable. The user asked for
   * "maybe 1 or 2"; this is the low end of that. Only a figure's own call uses
   * it — the applause, announcement and line-up bubbles keep the explicit
   * windows B1 and B3 gave them.
   */
  utteranceTailBeats: Beat;
  /**
   * Beats before a dance's **first** figure that its call is said.
   *
   * A real caller says the first move over the potatoes, so the hall hears
   * "balance and swing" before beat 1 — the user: "The first call is done then.
   * Most of the time a two-beat call, so 2 potatoes and then 'balance and
   * swing'." Every *later* call keeps its own figure's `lead`, which is the
   * calls-in-rhythm milestone's business and not this one's.
   */
  firstCallLeadBeats: Beat;
  /** The beat the program starts on. */
  startBeat: Beat;
}

/**
 * What the caller says to get a hall standing for the next dance, in the user's
 * own words: "take hands four from the top with the robins on the right, larks
 * on the left."
 *
 * Two bubbles rather than one sentence because the caller's bubble is sixteen
 * columns wide (DD16) and the whole of it is five lines there.
 */
export const HANDS_FOUR_CALLS: readonly string[] = [
  "TAKE HANDS FOUR FROM THE TOP",
  "ROBINS ON THE RIGHT, LARKS ON THE LEFT",
];

/**
 * The first of {@link HANDS_FOUR_CALLS}, kept under its old name.
 *
 * B1 exported `HANDS_FOUR` as the single thing a caller said to line a hall up;
 * B3 makes it the first of two. Anything that names the phrase still gets the
 * phrase.
 */
export const HANDS_FOUR = HANDS_FOUR_CALLS[0]!;

/** What the caller says over the first two potatoes, before the first figure. */
export const HERE_WE_GO = "HERE WE GO";

/**
 * What the caller says over the thanks, one bubble each — the user's later
 * ruling replacing the morning's "clap, etc." (B4, DD39): thank your partner,
 * then your neighbour, nobody claps.
 */
export const THANKS_CALLS: readonly string[] = ["THANK YOUR PARTNER", "THANK YOUR NEIGHBOR"];

/** The pacing the demo uses, all overridable. */
export const SCRIPT_DECIDER_DEFAULTS: ScriptDeciderOptions = {
  thanksBeats: 8,
  announceBeats: 16,
  lineUpBeats: 8,
  ringBeats: 8,
  readyBeats: 4,
  thanksCalls: THANKS_CALLS,
  lineUpCalls: HANDS_FOUR_CALLS,
  readyCall: HERE_WE_GO,
  utteranceTailBeats: 1,
  firstCallLeadBeats: 2,
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
  opts.thanksBeats + opts.announceBeats + opts.lineUpBeats + opts.ringBeats + opts.readyBeats;
