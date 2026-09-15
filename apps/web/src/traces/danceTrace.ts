import type { Beat, Dance, FigureEvent, Timeline, Trace } from "@caller/choreo";
import { danceBeats, sampleTrace } from "@caller/choreo";
import {
  BECKET,
  LAB_RUN,
  danceAlone,
  danceBySlug,
  formationFor,
  threadsOnTheOldPath,
} from "@caller/contra";

/** Whether a dance's trace folds its along-hall drift, and by how much. */
export interface DanceTraceOptions {
  /**
   * Fold the along-hall progression into one minor set's own period (T6).
   * Default `true` — every dance trace wraps unless told otherwise, which is
   * what keeps a becket slide's ink the size of one minor set instead of a
   * smear the length of the whole time through. `false` is the `?wrap=0`
   * comparison the traces page exposes; a formation with no along-hall
   * period at all (`Formation.hallPitch`, none in the demo programme) never
   * wraps regardless of this flag.
   */
  wrap?: boolean;
}

/**
 * One dance's trace: one minor set, one time through, in the set's own axes.
 *
 * The four drawings all read this. It runs the dance through the script decider
 * exactly as the oracles do — `danceAlone`, the real hall, the real progression
 * — and then reads one minor set's four dancers off the timeline, so what the
 * pen draws is what the hall would draw.
 *
 * **Which engine** is the one thing it has to choose, and M5 is where the
 * choice stopped being free. Every plate in this repository was drawn on the
 * decider's own planner, and the two engines differ by up to 1.16 px at the ends
 * of a line (M3's cycle-start switch), so switching them all over is a diff on
 * forty committed drawings and not this milestone's to make. But a dance that
 * calls a **figure for two with no coded twin** cannot be drawn on the old path
 * at all — it asks the figure where it leaves four dancers and the figure
 * refuses by name — which is On the Prowl's shoulder round. So a dance is drawn
 * on the engine that can dance it, and the two are the same engine for every
 * dance drawn before this one.
 *
 * **For M11**: when the coded layer goes, every dance draws on the contra
 * planner and this choice goes with it. `openingFigure` below needs one change
 * when it does — on the new path the first figure of most demo dances is an
 * instance for **two**, so the four dancers of the minor set have to come off
 * the event's *group* rather than off its bindings.
 *
 * Every trace here is cached by slug and by whether it wraps, because a dance
 * card re-renders on every beat of the music and re-deciding a dance sixty
 * times a second is not a thing to do (director ruling E5: no renderer perf
 * change).
 */
export function danceTrace(dance: Dance, options: DanceTraceOptions = {}): Trace {
  const wrap = options.wrap ?? true;
  const cacheKey = `${dance.slug}:${wrap ? "wrap" : "nowrap"}`;
  const cached = CACHE.get(cacheKey);
  if (cached !== undefined) return cached;
  const beats = danceBeats(dance);
  const timeline = danceAlone(
    dance,
    couplesFor(dance),
    beats + LOOKAHEAD_BEATS,
    {},
    threadsOnTheOldPath(dance) ? {} : LAB_RUN,
  ).timeline();
  const opening = openingFigure(timeline);
  const pitch = wrap ? formationFor(dance).hallPitch : undefined;
  const trace = sampleTrace(timeline, {
    to: beats,
    dancers: Object.values(opening.bindings),
    frame: timeline.group(opening.group).frame,
    wrap: pitch === undefined ? undefined : { y: pitch },
  });
  CACHE.set(cacheKey, trace);
  return trace;
}

/** The same, by slug, for a page that only has the slug in hand. */
export function danceTraceBySlug(slug: string, options?: DanceTraceOptions): Trace | undefined {
  const dance = danceBySlug(slug);
  return dance === undefined ? undefined : danceTrace(dance, options);
}

/**
 * How many couples the set is danced with.
 *
 * Four for duple improper and six for becket — enough that the minor set being
 * traced has neighbours above and below it, so nobody in it is waiting out, and
 * few enough that deciding the dance stays quick. A becket set holds
 * `2 × places + 2` couples, so four is its shortest line and six its first
 * comfortable one.
 */
export function couplesFor(dance: Dance): number {
  return dance.formation === BECKET.id ? 6 : 4;
}

/** How far past the window the decider is run, so the last beat is covered. */
const LOOKAHEAD_BEATS: Beat = 8;

/** The traces already built, by dance slug. */
const CACHE = new Map<string, Trace>();

/**
 * The minor set whose four dancers get the pens: the first group to dance,
 * taken by group id so the same dance always draws the same four.
 */
function openingFigure(timeline: Timeline): FigureEvent {
  const opening = timeline
    .figures()
    .filter((event) => event.start === 0)
    .sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0));
  const first = opening[0];
  if (first === undefined) throw new Error("dance trace: nothing is danced at beat 0");
  return first;
}
