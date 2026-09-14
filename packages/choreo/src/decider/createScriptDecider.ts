import type { Beat } from "@caller/core";
import type { Dance, Program } from "../dance/Dance.js";
import { danceBeats, danceSchedule, validateDance } from "../dance/Dance.js";
import type {
  DancerId,
  Formation,
  GroupPlan,
  HallState,
  SetSpec,
  StationId,
} from "../formation/Formation.js";
import { createHall } from "../formation/Formation.js";
import type { AnyFigureDef, EndPose, FigureRegistry } from "../figure/FigureDef.js";
import { withDefaults } from "../figure/FigureDef.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import type { Group } from "../group/Group.js";
import { createGroup } from "../group/Group.js";
import type { Timeline, TimelineEvent } from "../timeline/Timeline.js";
import { createTimeline } from "../timeline/Timeline.js";
import type { ChoreoLibrary, Decider, ScriptDeciderOptions, ScriptPosition } from "./Decider.js";
import { SCRIPT_DECIDER_DEFAULTS, danceOf, formationOf } from "./Decider.js";
import { complementOf, resolveSelector } from "./resolveSelector.js";

/**
 * The script decider: it dances the program as written.
 *
 * Every time through, it asks the formation for the groups, plays the dance's
 * figure calls into each of them, gives every waiting couple the built-in
 * `wait-out`, says each call `lead` beats early, and then asks the formation's
 * progression what the set looks like next. After a dance's `timesThrough` it
 * announces the next dance over the last eight beats, walks everybody to that
 * dance's own first places over an eight-beat gap, and calls hands four from
 * the top. The program loops, so the demo cycles without anyone touching it.
 *
 * A dance's first places are the formation's stations unless it says otherwise
 * (`Dance.startPlaces`), which is what lets a becket dance whose first figure is
 * the progression be danced at all: the minor set the time through runs in is
 * the one that figure makes, so the dancers — the waiting couple included —
 * begin one couple place back along their own line.
 *
 * Nothing here knows what a lark is, what a swing is, or what a hall looks
 * like. Everything contra comes from the formation and the figure registry.
 */
export function createScriptDecider(
  program: Program,
  registry: FigureRegistry,
  hall: HallState,
  library: ChoreoLibrary,
  options: Partial<ScriptDeciderOptions> = {},
): Decider {
  if (program.items.length === 0) throw new Error(`program "${program.slug}" has no items`);
  const opts: ScriptDeciderOptions = { ...SCRIPT_DECIDER_DEFAULTS, ...options };

  if (!registry.has(WAIT_OUT.id)) registry.register(WAIT_OUT);
  if (!registry.has(WALK_TO_STATION.id)) registry.register(WALK_TO_STATION);

  const timeline = createTimeline(registry);
  const specs = hallSpecs(hall);
  let state: HallState = hall;
  let formation: Formation = formationOf(library, danceOf(library, program.items[0]!.dance));
  const at: ScriptPosition = { itemIndex: 0, timeThrough: 0, beat: opts.startBeat };
  /** Where the last figure emitted leaves each dancer. */
  const standingAt = new Map<DancerId, EndPose>();
  let groupSeq = 0;

  const emitFigure = (
    into: TimelineEvent[],
    group: Group,
    def: AnyFigureDef,
    params: object & { beats: Beat },
    stations: readonly StationId[],
    start: Beat,
  ): void => {
    if (stations.length === 0) return;
    const bindings: Record<StationId, DancerId> = {};
    for (const id of stations) {
      const dancer = group.members[id];
      if (dancer === undefined)
        throw new Error(`group "${group.id}" has nobody on station "${id}"`);
      bindings[id] = dancer;
    }
    const event: TimelineEvent = {
      kind: "figure",
      group: group.id,
      figure: def.id,
      params,
      bindings,
      start,
      end: start + params.beats,
    };
    timeline.add(event);
    into.push(event);

    const ends = def.ends(group, params);
    for (const [id, dancer] of Object.entries(bindings)) {
      const end = ends[id];
      if (end) standingAt.set(dancer, end);
    }
  };

  const say = (into: TimelineEvent[], text: string, start: Beat, end: Beat): void => {
    const event: TimelineEvent = {
      kind: "utterance",
      speaker: "caller",
      text,
      start: Math.max(opts.startBeat, start),
      end,
    };
    timeline.add(event);
    into.push(event);
  };

  /** The groups of the whole hall for one time through, registered on the timeline. */
  const planGroups = (): Array<{ plan: GroupPlan; group: Group }> => {
    const out: Array<{ plan: GroupPlan; group: Group }> = [];
    for (const set of state.sets) {
      for (const plan of formation.groups(set)) {
        const group = createGroup({ ...plan, id: `${plan.id}#${groupSeq++}` }, formation.roleSet);
        timeline.addGroup(group);
        out.push({ plan, group });
      }
    }
    return out;
  };

  /** One time through of `dance`, starting at `at.beat`. */
  const emitCycle = (into: TimelineEvent[], dance: Dance): Beat => {
    const cycle = danceBeats(dance);
    const start = at.beat;
    const schedule = danceSchedule(dance);

    for (const { group, plan } of planGroups()) {
      if (plan.kind === "wait") {
        // The registry's `wait-out`, not the built-in: a form may register its
        // own under the same id (contra does, to choose the crossing from the
        // formation), and taking the definition from the import would sample
        // one figure and record the other's `ends` — which the eight-beat
        // line-up between two dances then walks to, 51 px out.
        const def = registry.get(WAIT_OUT.id);
        // `startPlaces` matters only for a dance that progresses in its own
        // first figure: the waiting couple slides off the end of the line with
        // everybody else, so its crossing has to be reckoned from the place it
        // slid out of. Empty — every other dance — is the waiting place, which
        // is what `wait-out` did before there was a parameter at all.
        const params = withDefaults(
          def,
          { startPlaces: dance.startPlaces ?? {}, ...(dance.waitOut ?? {}) },
          cycle,
        );
        emitFigure(into, group, def, params, Object.keys(group.members), start);
        continue;
      }
      for (const { call, start: offset } of schedule) {
        const def = registry.get(call.figure);
        const params = withDefaults(def, call.params, call.beats);
        const selected = resolveSelector(call.who, formation, group.stations);
        emitFigure(into, group, def, params, selected, start + offset);

        const resting = complementOf(group.stations, selected);
        if (resting.length > 0) {
          const origins: Record<StationId, EndPose> = {};
          for (const id of resting) {
            const here = standingAt.get(group.members[id]!);
            if (here) origins[id] = here;
          }
          const stand = withDefaults(WALK_TO_STATION, { origins }, call.beats);
          emitFigure(into, group, WALK_TO_STATION, stand, resting, start + offset);
        }
      }
    }

    // The caller says each call once for the whole hall, not once per group.
    for (const { call, start: offset } of schedule) {
      const def = registry.get(call.figure);
      const text = call.call ?? def.call;
      say(into, text, start + offset - def.lead, start + offset + opts.utteranceTailBeats);
    }

    at.beat = start + cycle;
    state = { sets: state.sets.map((set) => formation.progression.next(set)) };
    return cycle;
  };

  /** The eight-beat line-up between two dances. */
  const emitLineUp = (into: TimelineEvent[], next: Dance): void => {
    const nextFormation = formationOf(library, next);
    if (nextFormation.id !== formation.id) {
      state = createHall(nextFormation, specs);
      formation = nextFormation;
    }
    const start = at.beat;
    // Everybody walks to the *next dance's* own first places, which are the
    // stations unless that dance progresses in its first figure.
    const endPlaces = next.startPlaces ?? {};
    for (const { group } of planGroups()) {
      const origins: Record<StationId, EndPose> = {};
      const to: Record<StationId, StationId> = {};
      for (const station of group.stations) {
        to[station.id] = station.id;
        const here = standingAt.get(group.members[station.id]!);
        if (here) origins[station.id] = here;
      }
      const params = withDefaults(WALK_TO_STATION, { origins, to, endPlaces }, opts.lineUpBeats);
      emitFigure(into, group, WALK_TO_STATION, params, Object.keys(group.members), start);
    }
    const tail = Math.min(HANDS_FOUR_LEAD, opts.lineUpBeats);
    say(into, HANDS_FOUR, start + opts.lineUpBeats - tail, start + opts.lineUpBeats);
    at.beat = start + opts.lineUpBeats;
  };

  /** One time through plus, when the dance is ending, the switch to the next. */
  const emitNext = (into: TimelineEvent[]): void => {
    const item = program.items[at.itemIndex]!;
    const dance = validateDance(danceOf(library, item.dance));
    const thisFormation = formationOf(library, dance);
    if (thisFormation.id !== formation.id) {
      state = createHall(thisFormation, specs);
      formation = thisFormation;
    }

    const cycleStart = at.beat;
    const cycle = emitCycle(into, dance);

    at.timeThrough += 1;
    if (at.timeThrough < item.timesThrough) return;

    at.timeThrough = 0;
    at.itemIndex = (at.itemIndex + 1) % program.items.length;
    const next = danceOf(library, program.items[at.itemIndex]!.dance);
    if (next.slug === dance.slug) return;

    const announce = Math.min(opts.announceBeats, cycle);
    say(
      into,
      `NEXT DANCE: ${next.title.toUpperCase()} BY ${next.author.toUpperCase()}`,
      cycleStart + cycle - announce,
      cycleStart + cycle,
    );
    emitLineUp(into, next);
  };

  return {
    timeline: (): Timeline => timeline,
    covered: () => (timeline.dancers().length === 0 ? opts.startBeat : timeline.covered()),
    advance(until) {
      const produced: TimelineEvent[] = [];
      let guard = 0;
      while (at.beat <= until) {
        emitNext(produced);
        if (++guard > MAX_CYCLES) throw new Error(`decider made no progress toward beat ${until}`);
      }
      return produced;
    },
  };
}

/** What the caller says once everybody has lined up for a new dance. */
export const HANDS_FOUR = "HANDS FOUR FROM THE TOP";
/** How long before the new dance the caller says it. */
export const HANDS_FOUR_LEAD = 4;

/** A runaway guard: no program needs this many times through to reach a beat. */
const MAX_CYCLES = 10_000;

/** The specs a hall's sets were built from, so a formation change can re-seed them. */
const hallSpecs = (hall: HallState): SetSpec[] =>
  hall.sets.map((set) => ({
    id: set.id,
    couples: set.couples.length,
    centre: set.frame.centre,
    axis: set.frame.axis,
  }));
