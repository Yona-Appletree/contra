import type {
  Beat,
  Dance,
  DancerId,
  FigureEvent,
  StationId,
  Timeline,
  Trace,
} from "@caller/choreo";
import { HANDS_FOUR_GROUP, createHall, danceBeats, sampleTrace, stationRank } from "@caller/choreo";
import {
  LAB_RUN,
  danceAlone,
  danceBySlug,
  formationFor,
  isBecket,
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
    // On the engine that can dance it (M5): every dance written before On the
    // Prowl still draws on the decider's own planner, which is what every
    // committed plate was drawn on, and the ones whose figures have no coded
    // twin — On the Prowl, and M7's two — draw on the engine the Stage runs on.
    threadsOnTheOldPath(dance) ? {} : LAB_RUN,
  ).timeline();
  const opening = openingFigure(timeline);
  const pitch = wrap ? formationFor(dance).hallPitch : undefined;
  const seating = seatingOf(dance);
  const trace = sampleTrace(timeline, {
    to: beats,
    dancers: minorSetAt(timeline, opening, dance),
    frame: timeline.group(opening.group).frame,
    // **The rank is the place in the set, not the station a pen opened on.** A
    // figure resolved per pair opens on its own part (`lark`), whose leading
    // digits are none, and every pen would come out rank 0 — the ones and the
    // twos drawn in one shade. The formation's own seating is what says which
    // couple a dancer is in, and it is the same seating `danceAlone` sits them
    // down in.
    rankOf: (_station, dancer) => stationRank(seating.get(dancer) ?? ""),
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
  return isBecket(dance) ? 6 : 4;
}

/** How far past the window the decider is run, so the last beat is covered. */
const LOOKAHEAD_BEATS: Beat = 8;

/** The traces already built, by dance slug. */
const CACHE = new Map<string, Trace>();

/**
 * The minor set whose four dancers get the pens: the first group to dance,
 * taken by group id so the same dance always draws the same four.
 */
/**
 * The four dancers of the minor set the opening figure runs in.
 *
 * **Not the opening figure's own bindings** (M7). Since M2 a data figure is
 * resolved one instance **per pair**, so a dance whose first call is a balance
 * and swing opens with a two-dancer group and a plate drawn off its bindings has
 * two pens where it should have four. The minor set is the first two segments of
 * a group id either way — `set0/p0#3` and `set0/p0/swing/1L-2R#4` are the same
 * four dancers partitioned two ways — so every event of that minor set at beat
 * zero, pooled, is the four.
 */
function minorSetAt(timeline: Timeline, opening: FigureEvent, dance: Dance): string[] {
  // **A dance that opens in the lane has no minor set to read** (M7b). Whoosh's
  // first call is a grand right and left, which is resolved over the whole set
  // in one group (`set0/lane`), so pooling "everybody in the opening figure's
  // group at beat zero" is the whole hall and the plate came out with eight
  // pens. The formation's own first hands-four is the four to draw, and it is
  // the same partition every other call of the dance is resolved in.
  if (minorSetOf(opening.group).endsWith("/lane")) return firstFour(dance);
  // **The opening figure's own dancers first**, in its own binding order, and
  // then whoever else of the minor set is dancing at beat zero. A dance whose
  // first call takes the whole four gets exactly the list it always got —
  // pen for pen, in the same order — so not one plate drawn before this moves.
  const dancers = new Set(Object.values(opening.bindings));
  const mine = minorSetOf(opening.group);
  for (const event of timeline.figures()) {
    if (event.start !== 0 || minorSetOf(event.group) !== mine) continue;
    for (const dancer of Object.values(event.bindings)) dancers.add(dancer);
  }
  return [...dancers];
}

/** The four dancers of the formation's own first hands-four, in station order. */
function firstFour(dance: Dance): string[] {
  const formation = formationFor(dance);
  const hall = createHall(formation, [
    { id: "set0", couples: couplesFor(dance), centre: [0, 0], axis: 90 },
  ]);
  for (const set of hall.sets) {
    for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
      if (plan.kind !== "set") continue;
      const four = plan.stations
        .map((station) => plan.members[station.id])
        .filter((id): id is string => id !== undefined);
      if (four.length === 4) return four;
    }
  }
  return [];
}

/**
 * Which of the formation's own stations each dancer starts the dance on.
 *
 * Built from the same hall `danceAlone` builds — the formation's `start`, then
 * its own hands-four partition — so it is the seating the timeline was danced
 * in rather than a second opinion about it.
 */
function seatingOf(dance: Dance): Map<DancerId, StationId> {
  const formation = formationFor(dance);
  const hall = createHall(formation, [
    { id: "set0", couples: couplesFor(dance), centre: [0, 0], axis: 90 },
  ]);
  const seating = new Map<DancerId, StationId>();
  for (const set of hall.sets) {
    for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
      for (const [station, dancer] of Object.entries(plan.members)) seating.set(dancer, station);
    }
  }
  return seating;
}

/** The minor set a group instance belongs to: the first two segments of its id. */
const minorSetOf = (group: string): string =>
  group.split("/").slice(0, 2).join("/").replace(/#\d+$/, "");

function openingFigure(timeline: Timeline): FigureEvent {
  const opening = timeline
    .figures()
    .filter((event) => event.start === 0)
    .sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0));
  const first = opening[0];
  if (first === undefined) throw new Error("dance trace: nothing is danced at beat 0");
  return first;
}
