import type { Beat } from "@caller/core";
import type {
  AnyFigureDef,
  CycleEmission,
  CycleInput,
  CyclePlanner,
  Dance,
  DancerId,
  EndPose,
  Formation,
  Frame,
  Group,
  GroupId,
  HallState,
  SetId,
  SetState,
  Side,
  StationId,
} from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  WAIT_OUT,
  WALK_TO_STATION,
  danceBeats,
  danceSchedule,
  frameAngle,
  framePoint,
  localAngle,
  localPoint,
  withDefaults,
} from "@caller/choreo";
import type {
  Carried,
  CarriedHands,
  ContraFigure,
  ContraParams,
  HandJoin,
  Spot,
  Spots,
} from "../figures/ContraFigure.js";
import type { Library } from "../library/Library.js";
import { contraLibrary } from "../library/figures/index.js";
import { figureFor } from "../library/interpret.js";
import { legacyLibrary } from "../library/legacy.js";
import type { FigureInstance } from "./resolve.js";
import { resolveCall } from "./resolve.js";
import type { SetModel } from "./SetModel.js";
import { modelFromSet } from "./SetModel.js";

/**
 * **The contra cycle planner**: one time through, planned against set state
 * rather than against a dance's pre-threaded places.
 *
 * This is the whole point of M1. Today a dance's `params.from` and `carried` are
 * threaded at *load* time by `chainCalls`, on an abstract hands-four template,
 * by array adjacency; the decider then replays the answer into every real group.
 * Here, instead, a {@link SetModel} is built per set at the top of every time
 * through and each call is **resolved against it** (`resolve.ts`): who dances,
 * in which frame, starting from where each of them actually stands, holding
 * whatever they are already holding. The chain is gone from the path.
 *
 * With the legacy bridge in the library this must produce **pose-identical**
 * dancing to the old path — AC1, `planCycle.golden.test.ts`, 1e-9 px at every
 * 1/8 beat of every demo dance at every checked line length. So the order of
 * everything below deliberately mirrors `defaultCyclePlanner`: call, then set,
 * then group; the wait-out fill afterwards; one stable sort by start beat.
 * `timeline.dancers()`' insertion order falls out of that order, and the oracle
 * reports AC1 compares are sensitive to it.
 *
 * ## Where the model's spots come from, and why not `standingAt`
 *
 * At the top of a time through every dancer is put on **the dance's own first
 * places** — `Dance.startPlaces`, or the formation's stations — and not on the
 * decider's `standingAt`. That is what `chainCalls` does (it restarts from
 * `danceStart(spec)` for every cycle), and the two differ by the dance's own
 * closure error, which is allowed to be 0.01 px and would swamp AC1's 1e-9.
 * `standingAt` is still read, for exactly what the decider reads it for: the
 * `origins` of the dancers a `who` left standing. M3 is where a planner may
 * start from where people really are.
 */

/** How the contra planner is built. */
export interface ContraCyclePlannerOptions {
  /**
   * The figure definitions to resolve against.
   *
   * Left out, `contraLibrary`: every coded contra figure in the call's own
   * registry bridged, with the five migrated **definitions** replacing their own
   * bridges. Pass `legacyLibrary(registry)` for the all-bridged library M1
   * proved pose-identical, which is what `planCycle.golden.test.ts` does.
   */
  library?: Library;
}

/** A contra {@link CyclePlanner} over `options`. */
export function createContraCyclePlanner(options: ContraCyclePlannerOptions = {}): CyclePlanner {
  return (input: CycleInput) => planContraCycle(input, options);
}

/**
 * The contra planner over the **whole** library: the five migrated definitions
 * and the bridge for everything else. What `pnpm dance` runs and M3 switches
 * the Stage on to.
 *
 * A caller that uses this has to hand the decider a registry holding the five
 * interpreted figures as well — `contraDataEngine()` builds the pair — because
 * `poseAt` resolves a figure by id in the registry rather than in the emission.
 * Planning against one and drawing the other is refused by name below.
 */
export const contraCyclePlanner: CyclePlanner = createContraCyclePlanner();

/**
 * The contra planner with **every** figure bridged, which is what AC1 is about.
 *
 * AC1 is the hub's golden, not the gatherers': it asks whether resolving
 * against set state reproduces `chainCalls` when the figures are the same
 * figures. Every test of the hub itself names this one, and it keeps meaning
 * exactly what it meant in M1 for as long as any coded figure is left.
 */
export const legacyCyclePlanner: CyclePlanner = (input) =>
  planContraCycle(input, { library: legacyLibrary(input.registry) });

/** A half-open run of beats, measured from the start of a time through. */
type Span = readonly [Beat, Beat];

/**
 * Where one dancer stands, in the axes of the frame that put them there.
 *
 * The model's own `spot` is world px, which is what makes it a set-wide fact
 * rather than a group-local one. But a coded figure's `from` is **frame-local**,
 * and `localPoint(f, framePoint(f, x))` is not `x` — it is `x` plus about
 * 2 × 10⁻¹⁵ px of floating-point noise, which is harmless as a position and is
 * *not* harmless as a branch: a facing that lands exactly on 180° comes back as
 * −180° through the round trip, and the figures that normalise an angle near a
 * boundary then disagree with today's path by a whole turn.
 *
 * So the planner also remembers the frame-local number each spot was computed
 * as, and hands *that* back when the frame it is asked for is the same frame.
 * Nothing is rounded and nothing is snapped: it is the same arithmetic
 * `chainCalls` does today, with one lossy conversion not performed. A dancer
 * whose frame has changed (a widened group, another minor set) falls back to
 * the honest conversion from world px.
 */
interface LocalSpot {
  frame: Frame;
  spot: Spot;
}

/** A dancer's memoised frame-local spot, when it was computed in this very frame. */
function localIn(
  local: Map<DancerId, LocalSpot>,
  dancer: DancerId,
  frame: Frame,
): Spot | undefined {
  const memo = local.get(dancer);
  return memo && sameFrame(memo.frame, frame) ? memo.spot : undefined;
}

/** Whether two frames are the same frame, by value: `groupsFor` mints a fresh object per call. */
const sameFrame = (a: Frame, b: Frame): boolean =>
  a.centre[0] === b.centre[0] &&
  a.centre[1] === b.centre[1] &&
  a.axis === b.axis &&
  a.spacing === b.spacing;

/** One instance, planned: its emission, and the carried holds it is still gathering. */
interface Planned {
  group: Group;
  def: AnyFigureDef;
  /** Filled in as later instances discover what crosses the boundary into them. */
  carried: Carried;
  /** Which station each of this instance's dancers plays. */
  stationOf: Map<DancerId, StationId>;
}

function planContraCycle(
  input: CycleInput,
  options: ContraCyclePlannerOptions,
): { emissions: CycleEmission[]; next: HallState } {
  const { dance, formation, registry, hall, start, standingAt, mintGroup } = input;
  const library = options.library ?? contraLibrary(registry);
  const cycle = danceBeats(dance);
  const schedule = danceSchedule(dance);

  /** One model per set, every dancer on the dance's own first place. */
  const models = new Map<SetId, SetModel>();
  /** The frame-local number each dancer's spot was last computed as; see {@link LocalSpot}. */
  const local = new Map<DancerId, LocalSpot>();
  for (const set of hall.sets) {
    const first = firstPlaces(formation, dance, set);
    for (const [dancer, place] of first.local) local.set(dancer, place);
    models.set(set.id, modelFromSet(formation, set, first.world));
  }

  /** Which beats of this cycle each dancer has already been given a figure for. */
  const claimed = new Map<DancerId, Span[]>();
  const claim = (dancers: Iterable<DancerId>, from: Beat, to: Beat): void => {
    for (const dancer of dancers) {
      const spans = claimed.get(dancer) ?? [];
      spans.push([from, to]);
      claimed.set(dancer, spans);
    }
  };

  /** The instance that last gave each dancer a hold, for the carry across a boundary. */
  const lastInstance = new Map<DancerId, Planned>();
  const pending: Array<{ at: Beat; make: (standing: Map<DancerId, EndPose>) => CycleEmission[] }> =
    [];

  for (const { call, start: offset } of schedule) {
    const selector = call.group ?? HANDS_FOUR_GROUP;
    for (const set of hall.sets) {
      const model = models.get(set.id)!;
      const groups = formation.groupsFor(selector, set);
      const instances = resolveCall(
        call,
        { model, formation, library, groups, localOf: (dancer, f) => localIn(local, dancer, f) },
        start + offset,
      );
      const minted = new Map<GroupId, Group>();
      for (const instance of instances) {
        let group = minted.get(instance.group.id);
        if (group === undefined) {
          group = mintGroup(instance.group);
          minted.set(instance.group.id, group);
        }
        const stations = Object.keys(instance.cast);

        if (instance.holdPlace) {
          // The dancers this call left out stand where they are — the decider's
          // own `origins`, read at emission time out of the real `standingAt`,
          // because that is where they physically are rather than where the
          // chain thinks they should be.
          pending.push({
            at: offset,
            make: (standing) => {
              const origins: Record<StationId, EndPose> = {};
              for (const id of stations) {
                const here = standing.get(group.members[id]!);
                if (here) origins[id] = here;
              }
              return [
                {
                  group,
                  def: WALK_TO_STATION as AnyFigureDef,
                  params: withDefaults(WALK_TO_STATION, { origins }, instance.beats),
                  stations,
                  start: instance.start,
                },
              ];
            },
          });
          // A dancer standing still moves nowhere and holds nothing: their spot
          // is left where the chain has it, and whatever they were holding is
          // let go.
          for (const dancer of Object.values(instance.cast)) {
            model.dancers[dancer]!.holds = {};
            lastInstance.delete(dancer);
          }
          continue;
        }

        const definition = library.get(instance.figure);
        const fig = figureFor(definition, registry);
        const def = registry.get(instance.figure);
        // `poseAt` looks a figure up by **id in the registry**, not in the
        // emission, so a definition the planner resolves against and a figure
        // the timeline samples have to be the same thing. Saying so loudly is
        // better than dancing a coded swing to a data swing's plan.
        if (definition.shape.kind !== "legacy" && (def as unknown) !== (fig as unknown)) {
          throw new Error(
            `figure "${instance.figure}" is a definition in the library, but the registry holds a ` +
              `different figure under that id — build the registry with \`contraDataEngine()\``,
          );
        }
        const from = fromSpots(group, model, local);
        // The parameters the *chain* runs on: no carried holds, exactly as
        // `chainCalls` computes `moves` and `joins` before `carryHolds` writes
        // anything into them.
        const chainParams = withDefaults<ContraParams>(
          def,
          { ...callParams(instance), from, carried: NO_CARRIED },
          instance.beats,
        );
        const carried: Carried = { in: {}, out: {} };
        const planned: Planned = {
          group,
          def,
          carried,
          stationOf: new Map(Object.entries(instance.cast).map(([id, d]) => [d, id])),
        };

        carryInto(fig, chainParams, group, model, planned, lastInstance, instance.beats);

        pending.push({
          at: offset,
          make: () => [
            {
              group,
              def,
              params: withDefaults(def, { ...callParams(instance), from, carried }, instance.beats),
              stations,
              start: instance.start,
            },
          ],
        });

        advance(fig, chainParams, group, model, local, instance, planned, lastInstance);
        claim(Object.values(instance.cast), offset, offset + instance.beats);
      }
      // A call `ends` kept away from a widened group's true end claims those
      // beats for nobody, exactly as `defaultCyclePlanner` leaves them: the fill
      // below gives that couple its own whole-cycle `wait-out`.
    }
  }

  // Whatever the schedule did not claim: the outs wait it out, in their own
  // resting group — `defaultCyclePlanner`'s own second pass, unchanged, because
  // a waiting couple's crossing is the formation's business and not the set
  // model's until M6.
  for (const set of hall.sets) {
    for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
      if (plan.kind === "set") continue;
      const group = mintGroup(plan);
      const def = registry.get(WAIT_OUT.id);
      const swept = Object.values(group.members).some((d) => claimed.has(d));
      for (const [from, to] of gapsIn(cycle, Object.values(group.members), claimed)) {
        const params = withDefaults(
          def,
          {
            startPlaces: dance.startPlaces ?? {},
            join: from === 0,
            cross: to === cycle,
            ...(dance.waitOut ?? {}),
          },
          to - from,
        );
        pending.push({
          at: swept ? from : Number.POSITIVE_INFINITY,
          make: () => [
            { group, def, params, stations: Object.keys(group.members), start: start + from },
          ],
        });
      }
    }
  }

  // Stable, so same-beat ties keep the order the passes above found them in.
  const standing = new Map(standingAt);
  const emissions: CycleEmission[] = [];
  for (const p of [...pending].sort((a, b) => a.at - b.at)) {
    for (const emission of p.make(standing)) {
      emissions.push(emission);
      if (emission.stations.length === 0) continue;
      const ends = emission.def.ends(emission.group, emission.params);
      for (const id of emission.stations) {
        const dancer = emission.group.members[id];
        const end = ends[id];
        if (dancer !== undefined && end) standing.set(dancer, end);
      }
    }
  }

  return {
    emissions,
    next: { sets: hall.sets.map((set) => formation.progression.next(set)) },
  };
}

/** Nothing carried either way; `contraFigure`'s own default, spelled out. */
const NO_CARRIED: Carried = { in: {}, out: {} };

/** A call's own parameters, with the two the chain derives stripped back out. */
function callParams(instance: FigureInstance): Record<string, unknown> {
  const rest = { ...instance.params };
  delete rest["from"];
  delete rest["carried"];
  return rest;
}

/**
 * Where this group's dancers stand, in the group frame's own axes: the
 * legacy bridge's `params.from`.
 *
 * Every station the group has, not only the ones dancing — a coded figure's
 * `planContext` reads the whole layout, and one missing entry silently falls
 * back to the station rather than to where the dancer is.
 */
function fromSpots(group: Group, model: SetModel, local: Map<DancerId, LocalSpot>): Spots {
  const from: Spots = {};
  for (const station of group.stations) {
    const dancer = group.members[station.id];
    if (dancer === undefined) continue;
    const state = model.dancers[dancer];
    if (!state) continue;
    const memo = local.get(dancer);
    from[station.id] =
      memo && sameFrame(memo.frame, group.frame)
        ? memo.spot
        : {
            p: localPoint(group.frame, state.spot.p),
            facing: localAngle(group.frame, state.spot.facing),
          };
  }
  return from;
}

/**
 * Which of the holds the set is already carrying this instance takes over, and
 * what that means for the instance before it.
 *
 * The rule is `carryHolds`', moved from station adjacency in a dance's flat call
 * list to dancer state on the set: **the hands the previous instance was still
 * holding at its last beat that this one holds through its middle**. The middle
 * is the right question of the incoming figure because almost every figure takes
 * its hands over its first beat, so beat 0 would answer "nothing" for all of
 * them.
 */
function carryInto(
  fig: ContraFigure,
  chainParams: ContraParams,
  group: Group,
  model: SetModel,
  planned: Planned,
  lastInstance: Map<DancerId, Planned>,
  beats: Beat,
): void {
  for (const join of fig.joins(chainParams, beats / 2, group.stations, group.frame.spacing)) {
    const a = group.members[join.a];
    const b = group.members[join.b];
    if (a === undefined || b === undefined) continue;
    const held = model.dancers[a]?.holds[join.aSide];
    if (!held || held.with !== b || held.side !== join.bSide) continue;
    const before = lastInstance.get(a);
    // Both dancers have to be coming out of the *same* instance for the hold to
    // be one hand crossing one boundary.
    if (before === undefined || lastInstance.get(b) !== before) continue;
    writeCarried(planned.carried, "in", join);
    const wasA = before.stationOf.get(a);
    const wasB = before.stationOf.get(b);
    if (wasA === undefined || wasB === undefined) continue;
    writeCarried(before.carried, "out", {
      a: wasA,
      aSide: join.aSide,
      b: wasB,
      bSide: join.bSide,
    });
  }
}

/** Move the set on by one instance: its ends become spots, its last-beat joins become holds. */
function advance(
  fig: ContraFigure,
  chainParams: ContraParams,
  group: Group,
  model: SetModel,
  local: Map<DancerId, LocalSpot>,
  instance: FigureInstance,
  planned: Planned,
  lastInstance: Map<DancerId, Planned>,
): void {
  // `moves`, not `ends`: the same frame-local answer, which is what the spot
  // memo above needs and what `chainCalls` threads today. `ends` is exactly
  // this put through the group's frame, which is what the world spot is.
  const ends = fig.moves(chainParams, group.stations, group.frame.spacing);
  for (const [station, dancer] of Object.entries(instance.cast)) {
    const end = ends[station];
    const state = model.dancers[dancer];
    if (!state) continue;
    if (end) {
      state.spot = {
        p: framePoint(group.frame, end.p),
        facing: frameAngle(group.frame, end.facing),
      };
      local.set(dancer, { frame: group.frame, spot: end });
    }
    state.holds = {};
    lastInstance.set(dancer, planned);
  }
  const cast = new Set(Object.values(instance.cast));
  for (const join of fig.joins(chainParams, instance.beats, group.stations, group.frame.spacing)) {
    const a = group.members[join.a];
    const b = group.members[join.b];
    if (a === undefined || b === undefined) continue;
    // A figure reports its joins over its whole layout; only the dancers this
    // instance actually cast are holding anything because of it.
    if (!cast.has(a) || !cast.has(b)) continue;
    const stateA = model.dancers[a];
    const stateB = model.dancers[b];
    if (!stateA || !stateB) continue;
    stateA.holds[join.aSide] = { with: b, side: join.bSide };
    stateB.holds[join.bSide] = { with: a, side: join.aSide };
  }
}

/** Write one join into a `Carried`'s `in` or `out` side, both ways round. */
function writeCarried(carried: Carried, way: "in" | "out", join: HandJoin): void {
  const side: Record<StationId, CarriedHands> = carried[way];
  side[join.a] = { ...side[join.a], [join.aSide as Side]: { with: join.b, side: join.bSide } };
  side[join.b] = { ...side[join.b], [join.bSide as Side]: { with: join.a, side: join.aSide } };
}

/**
 * Where a dance picks everybody up: its own `startPlaces`, or the formation's
 * stations, in world px.
 *
 * Read off `groupsFor("hands-four", set)` rather than off the lattice, so that
 * a waiting couple lands on its own wait stations (which are not lattice homes
 * at all) and a becket dance's `startPlaces` reaches the waiting couple by the
 * same `WL`/`WR` ids the decider's `wait-out` uses.
 */
function firstPlaces(
  formation: Formation,
  dance: Dance,
  set: SetState,
): { world: Map<DancerId, EndPose>; local: Map<DancerId, LocalSpot> } {
  const world = new Map<DancerId, EndPose>();
  const local = new Map<DancerId, LocalSpot>();
  for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
    for (const station of plan.stations) {
      const dancer = plan.members[station.id];
      if (dancer === undefined) continue;
      const place = dance.startPlaces?.[station.id] ?? { p: station.p, facing: station.facing };
      world.set(dancer, {
        p: framePoint(plan.frame, place.p),
        facing: frameAngle(plan.frame, place.facing),
      });
      local.set(dancer, { frame: plan.frame, spot: { p: place.p, facing: place.facing } });
    }
  }
  return { world, local };
}

/**
 * The beats of `[0, cycle]` that no call gave any of `dancers` a figure for.
 *
 * `createScriptDecider`'s own, which is not exported; see its doc comment for
 * why the claims of a group's dancers are pooled.
 */
function gapsIn(cycle: Beat, dancers: readonly DancerId[], claimed: Map<DancerId, Span[]>): Span[] {
  const spans: Span[] = [];
  for (const dancer of dancers) spans.push(...(claimed.get(dancer) ?? []));
  if (spans.length === 0) return [[0, cycle]];

  const gaps: Span[] = [];
  let at: Beat = 0;
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (from > at) gaps.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < cycle) gaps.push([at, cycle]);
  return gaps;
}
