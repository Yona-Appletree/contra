import type { Beat } from "@caller/core";
import { angleDiff } from "@caller/core";
import type {
  AnyFigureDef,
  CycleEmission,
  CycleInput,
  CyclePlanner,
  Dance,
  DancerId,
  EndPose,
  FigureCall,
  Formation,
  Frame,
  Group,
  GroupId,
  GroupPlan,
  HallState,
  PhraseName,
  SetId,
  SetState,
  Side,
  StationId,
} from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  WAIT_OUT,
  WALK_TO_STATION,
  callBeats,
  concurrentCalls,
  createGroup,
  createHall,
  danceBeats,
  dancePassSpans,
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
import { contraDataEngine } from "../library/engine.js";
import { contraLibrary } from "../library/figures/index.js";
import { figureFor } from "../library/interpret.js";
import { legacyLibrary } from "../library/legacy.js";
import { progressionOf, progressModel, progressSet } from "./lattice.js";
import { parseRelation, relate } from "./relations.js";
import type { FigureInstance } from "./resolve.js";
import { gathersOnPlaces, resolveConcurrent, TRADE_PARAM } from "./resolve.js";
import type { SetShapeKind, ShapeGroup, TargetShape } from "./shape.js";
import { LINES_SHAPE, shapeFromEnds } from "./shape.js";
import { setRulesOf } from "./SetRules.js";
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
 * ## Where the model's spots come from at the top of a time through
 *
 * Two answers, and which one is right depends on what is being asked.
 *
 * **`"standing"`** — the decider's own `standingAt`, where the last figure
 * really left each dancer — is what the new path does since M3, and it is the
 * whole point of a hub that holds set state. A swing's honest end (M2) is a
 * place a few pixels off the formation's own, and with the cycle restarting
 * from the dance's first places that honest end was thrown away at the
 * boundary: every dancer snapped back on to their station between one time
 * through and the next. Now a time through picks people up where the one
 * before it put them down, and the seam across the boundary is dance rather
 * than a jump.
 *
 * **`"first-places"`** — `Dance.startPlaces`, or the formation's stations — is
 * what `chainCalls` does (it restarts from `danceStart(spec)` for every cycle),
 * and it is therefore what AC1 has to compare against: the two differ by the
 * dance's own closure error, which is allowed to be 0.01 px and would swamp
 * AC1's 1e-9. {@link legacyCyclePlanner}, the all-bridged planner every test of
 * the hub itself names, keeps it.
 *
 * Either way `standingAt` is also read for what the decider reads it for: the
 * `origins` of the dancers a `who` left standing.
 */

/** Where the model's spots come from at the top of a time through. */
export type CycleStart = "standing" | "first-places";

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
  /**
   * Where each dancer stands when a time through begins; see the module note.
   *
   * Left out, `"standing"` — where the last figure really left them, which is
   * M3's deliberate switch and the reason a honest end survives the boundary.
   */
  start?: CycleStart;
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
 *
 * Which is also why it keeps `start: "first-places"`: `chainCalls` restarts
 * every time through from the dance's own first places, so a planner being
 * compared against `chainCalls` has to as well. M3's switch to `"standing"` is
 * a change in what is danced, not in how it is computed, and belongs on the
 * path that is allowed to dance differently.
 */
export const legacyCyclePlanner: CyclePlanner = (input) =>
  planContraCycle(input, { library: legacyLibrary(input.registry), start: "first-places" });

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
  // **The passes of the record** (M8). One for every dance written before this
  // milestone, in which case the loop below runs once over `[0, cycle]` with the
  // hall's own seating and the arithmetic is unchanged to the last digit.
  const spans = dancePassSpans(dance);
  const perPass = dance.phrases.length / spans.length;
  const schedule = passSchedule(dance, perPass);

  /** One model per set, every dancer where this time through picks them up. */
  const models = new Map<SetId, SetModel>();
  /** The frame-local number each dancer's spot was last computed as; see {@link LocalSpot}. */
  const local = new Map<DancerId, LocalSpot>();
  const from = options.start ?? "standing";
  /** {@link from}, under a name the fill's own `[from, to]` cannot shadow. */
  const picksUpWhereItLeftOff = from === "standing";

  /**
   * One waiting couple's `wait-out` parameters, in one place.
   *
   * Shared by the fill below and by the **write-back** at a mid-cycle shift,
   * which has to know where this very figure will leave the couple; the two
   * would drift apart written twice.
   */
  const waitParams = (
    def: AnyFigureDef,
    group: Group,
    standing: ReadonlyMap<DancerId, EndPose>,
    gap: { join: boolean; cross: boolean; beats: Beat },
  ): object & { beats: Beat } =>
    withDefaults(
      def,
      {
        startPlaces: dance.startPlaces ?? waitingFrom(group, standing, local),
        join: gap.join,
        cross: gap.cross,
        // **The becket end-of-set crossing lands one couple place short**
        // (M9c), because a time through that picks everybody up where the last
        // one left them leaves every body one couple place behind the place the
        // boundary's shift has just named theirs — and the waiting couple is a
        // body like any other. See `ContraWaitOutParams.crossShort`; a planner
        // that restarts from the first places instead teleports everybody on to
        // the new places and the crossing must land on its own.
        crossShort: picksUpWhereItLeftOff,
        ...(dance.waitOut ?? {}),
      },
      gap.beats,
    );

  /**
   * **The outs write back** (M9c).
   *
   * A couple that has been standing out for a run of beats and is about to
   * dance has been moved by its `wait-out` — it stepped together, walked to the
   * waiting place, and crossed the set if the run ended there — and that
   * `wait-out` is planned in the fill, which runs after every call of every
   * pass. So the model still had the couple where the time through began, and
   * the first call that swept it in started it from a place it had left. The
   * seam was the whole width of the crossing:
   *
   * - Fatal Attraction, `walk-to-station -> allemande` at beat 40, 37.7359 px
   *   at every checked length — a run ended by a call that carries the
   *   progression;
   * - Jeremy Corners at the odd lengths, `wait-out -> diamond` at beat 192,
   *   32.0000 px, exactly the width of the set — a run ended by a **pass**
   *   boundary. At two and four couples nobody ever waits, which is the whole
   *   of why only the odd lengths showed it.
   *
   * The fill is what moves them and the fill is what is asked, so the two
   * cannot disagree: {@link waitParams} is the one place the parameters are
   * written. `standingAt` is the right map to ask with, because such a gap
   * begins at the couple's own beat 0 and nothing has moved them yet — which is
   * also why the fill's own sort puts it first.
   */
  const writeOutsBack = (
    model: SetModel,
    state: SetState,
    claimedSoFar: Map<DancerId, Span[]>,
    runFrom: Beat,
    runTo: Beat,
  ): void => {
    for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, state)) {
      if (plan.kind === "set") continue;
      const members = Object.values(plan.members);
      // Only a couple that stood out for the **whole** of this run: one with no
      // gap was dancing, and one with a partial gap is already accounted for by
      // the call that claimed the rest of it.
      const whole = gapsIn({ start: runFrom, end: runTo }, members, claimedSoFar).find(
        ([a, b]) => a === runFrom && b === runTo,
      );
      if (whole === undefined) continue;
      const group = mintGroup(plan);
      const def = registry.get(WAIT_OUT.id);
      const ends = def.ends(
        group,
        waitParams(def, group, standingAt, {
          join: true,
          cross: true,
          beats: whole[1] - whole[0],
        }),
      );
      for (const [station, dancer] of Object.entries(group.members)) {
        const end = ends[station];
        const dancerState = model.dancers[dancer];
        if (end === undefined || dancerState === undefined) continue;
        dancerState.spot = { p: end.p, facing: end.facing };
        // The memo is frame-local to a frame this pose was not computed in;
        // dropping it makes the next reader convert honestly.
        local.delete(dancer);
      }
    }
  };
  for (const set of hall.sets) {
    const first = firstPlaces(formation, dance, set);
    // `"standing"` takes each dancer's real place where the decider has one and
    // the dance's own first place where it does not — the very first time
    // through of the evening, before anything has been emitted, and any dancer
    // the decider has never given a figure to. The frame-local memo is seeded
    // only for the ones that came from `firstPlaces`: it exists to hand back
    // the exact number a place was computed as, and a world spot the decider
    // measured was not computed in this frame.
    const world = new Map<DancerId, EndPose>();
    for (const [dancer, place] of first.world) {
      const standing = from === "standing" ? standingAt.get(dancer) : undefined;
      if (standing === undefined) {
        world.set(dancer, place);
        const memo = first.local.get(dancer);
        if (memo) local.set(dancer, memo);
      } else {
        world.set(dancer, standing);
        local.delete(dancer);
      }
    }
    models.set(set.id, modelFromSet(formation, set, world));
  }

  /**
   * Which beats each dancer has already been given a figure for.
   *
   * **Per pass, not per cycle** (M8): a two-pass record progresses between its
   * passes, so the couples standing out are not the same couples, and a waiting
   * couple's gap is a gap in its own pass.
   */
  let claimed = new Map<DancerId, Span[]>();
  /**
   * Everybody any call of the **whole** record gave a figure to.
   *
   * `claimed` is per pass and answers "which beats of this pass are spoken
   * for"; this answers "was this couple ever swept into a call", which is a
   * question about the cycle: a couple that dances in the second pass and waits
   * out the first has to have its first pass's `wait-out` sorted before that
   * second-pass figure, or the two reach one dancer's timeline out of order.
   */
  const everClaimed = new Set<DancerId>();
  const claim = (dancers: Iterable<DancerId>, from: Beat, to: Beat): void => {
    for (const dancer of dancers) {
      const spans = claimed.get(dancer) ?? [];
      spans.push([from, to]);
      claimed.set(dancer, spans);
      everClaimed.add(dancer);
    }
  };

  /** The instance that last gave each dancer a hold, for the carry across a boundary. */
  const lastInstance = new Map<DancerId, Planned>();
  const pending: Array<{ at: Beat; make: (standing: Map<DancerId, EndPose>) => CycleEmission[] }> =
    [];

  /** How the hall is seated for the pass being planned; the last is what `next` is. */
  const states = new Map<SetId, SetState>(hall.sets.map((set) => [set.id, set]));
  /**
   * One per **seating**: a run of beats, what it claimed, and how the hall was
   * seated for it.
   *
   * One per pass until M9b, because the seating only ever changed at a pass
   * boundary. A call that carries the progression itself changes it in the
   * middle, and which couples are standing out changes with it — so a pass with
   * such a call is two runs, each filled against its own seating. Without that
   * the couple that was out before the progression is given no `wait-out` at
   * all and the timeline refuses the dance by name ("has no figure at beat 0").
   */
  const fills: Array<{
    span: { start: Beat; end: Beat };
    claimed: Map<DancerId, Span[]>;
    states: Map<SetId, SetState>;
  }> = [];
  const shift = progressionOf(dance);
  const progressEvery = dance.progressEvery ?? 1;

  for (const [passIndex, span] of spans.entries()) {
    claimed = new Map<DancerId, Span[]>();
    /** Whether a call of this pass carried the progression itself (M9b). */
    let progressedInPass = false;
    /** Where the seating this pass is running in started, in the pass's own beats. */
    let seatedFrom: Beat = span.start;
    for (const { call, start: offset, pass } of schedule) {
      if (pass !== passIndex) continue;
      const selector = call.group ?? HANDS_FOUR_GROUP;
      // **A call that carries the progression** (M9b) ends one seating and
      // starts another; the seating it ran in is what its own run of beats has
      // to be filled against, so it is snapshotted before any set is shifted.
      const carries = progressesHere(call);
      const seatedIn = carries ? new Map(states) : undefined;
      for (const set of hall.sets) {
        const model = models.get(set.id)!;
        const groups = formation.groupsFor(selector, states.get(set.id)!);
        const instances = resolveConcurrent(
          call,
          { model, formation, library, groups, localOf: (dancer, f) => localIn(local, dancer, f) },
          start + offset,
        );
        const minted = new Map<GroupId, Group>();
        /** The shape this call formed, one group per instance that formed one (M7). */
        const formed: ShapeGroup[] = [];
        let formedKind: SetShapeKind | undefined;
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
                params: withDefaults(
                  def,
                  { ...callParams(instance), from, carried },
                  instance.beats,
                ),
                stations,
                start: instance.start,
              },
            ],
          });

          advance(fig, chainParams, group, model, local, instance, planned, lastInstance);
          rebind(instance, model);
          // **The set's shape, recorded** (M7). A figure whose `ends` name a
          // target shape has just put its dancers into one, and the next call —
          // and `pnpm dance`'s own table — may ask what shape the set is in. It is
          // read off where the figure really left them rather than off its claim,
          // so the model's shape is a measurement like everything else in the hub.
          const target = targetOf(definition);
          if (target !== undefined) {
            formedKind = target.shape;
            formed.push(
              shapeFromEnds(
                target.shape,
                Object.values(instance.cast).map((dancer) => ({
                  dancer,
                  p: model.dancers[dancer]!.spot.p,
                  facing: model.dancers[dancer]!.spot.facing,
                })),
              ),
            );
          }
          claim(Object.values(instance.cast), offset, offset + instance.beats);
        }
        if (formedKind !== undefined) {
          model.shape = { kind: formedKind, groups: formed };
        } else if (instances.some((i) => !i.holdPlace && gathersOnPlaces(library.get(i.figure)))) {
          // A **gatherer** puts the set back into its own two lines: settling
          // everybody on the formation's places is what un-forms a ring or a line
          // of four, and is why "bend the line, circle, swing" leaves a set in
          // lines again without anything having to say so.
          model.shape = LINES_SHAPE;
        }
        // A call `ends` kept away from a widened group's true end claims those
        // beats for nobody, exactly as `defaultCyclePlanner` leaves them: the fill
        // below gives that couple its own whole-pass `wait-out`.

        // **The progression, where the record says it happens** (M9b). A call
        // that carries the progression shifts the slots at *its* end, so every
        // relation the rest of the time through names is read from where the
        // dance has actually got to. Nobody moves — the dancers stay exactly
        // where the figure left them, which is what a boundary shift does too —
        // and the boundary's own shift is dropped for this pass below. See
        // {@link PROGRESSES_PARAM}.
        if (carries) {
          progressedInPass = true;
          writeOutsBack(model, states.get(set.id)!, claimed, seatedFrom, offset + callBeats(call));
          states.set(set.id, progressSet(formation, model, states.get(set.id)!, shift));
          models.set(set.id, progressModel(model, shift));
        }
      }
      if (seatedIn !== undefined) {
        const until = offset + callBeats(call);
        fills.push({ span: { start: seatedFrom, end: until }, claimed, states: seatedIn });
        seatedFrom = until;
      }
    }

    // What this pass's schedule did not claim is filled in **after every pass
    // has been planned** — see the fill loop below, and `everClaimed` for why.
    fills.push({ span: { start: seatedFrom, end: span.end }, claimed, states: new Map(states) });

    // **The pass boundary** (M8). The set progresses at the end of every pass
    // unless the record says otherwise, and the dancers stay exactly where the
    // last figure left them: what moves is the **slots**, which is what makes the
    // second pass's "N2" a different dancer from the first pass's.
    //
    // **Unless a call of this pass has already done it** (M9b): a set
    // progresses once per pass however the record writes it, so a pass whose
    // own figure carried the progression has nothing left to do here.
    //
    // The outs write back here too, and only while there is another pass of
    // this record to read the model: after the last one the cycle ends and the
    // decider's own `standingAt` is what the next time through picks up. See
    // {@link writeOutsBack} — Jeremy Corners' `wait-out -> diamond` seam.
    for (const set of hall.sets) {
      const model = models.get(set.id)!;
      if (passIndex + 1 < spans.length) {
        writeOutsBack(model, states.get(set.id)!, claimed, seatedFrom, span.end);
      }
      if (!progressedInPass && (passIndex + 1) % progressEvery === 0) {
        states.set(set.id, progressSet(formation, model, states.get(set.id)!, shift));
        if (passIndex + 1 < spans.length) models.set(set.id, progressModel(model, shift));
      }
    }
  }

  // Whatever no call claimed: the outs wait it out, in their own resting group —
  // `defaultCyclePlanner`'s own second sweep, unchanged, because a waiting
  // couple's crossing is the formation's business and not the set model's since
  // M6. Each pass is read against **its own** seating, which is what a record
  // with a progression between its passes needs, and the whole lot runs after
  // every pass has been planned so that `everClaimed` is complete — a couple that
  // waits out the first pass and dances the second has to have its first pass's
  // `wait-out` sorted before that second-pass figure.
  for (const fill of fills) {
    for (const set of hall.sets) {
      for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, fill.states.get(set.id)!)) {
        if (plan.kind === "set") continue;
        const group = mintGroup(plan);
        const def = registry.get(WAIT_OUT.id);
        const swept = Object.values(group.members).some((d) => everClaimed.has(d));
        for (const [from, to] of gapsIn(fill.span, Object.values(group.members), fill.claimed)) {
          const join = from === fill.span.start;
          pending.push({
            // A couple **no call of the whole record** swept in is sorted after
            // every call of the cycle, so that its wait-out is added last;
            // `cycle + from` rather than infinity since M8, because a two-pass
            // record has one such fill per pass and a dancer's own events have
            // to reach the timeline in order. Every real call starts before
            // `cycle`, so this still sorts after all of them.
            at: swept ? from : cycle + from,
            make: (standing) => [
              {
                group,
                def,
                params: waitParams(def, group, standing, {
                  join,
                  cross: to === fill.span.end,
                  beats: to - from,
                }),
                stations: Object.keys(group.members),
                start: start + from,
              },
            ],
          });
        }
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

  // **The cycle boundary, on the slots** (M6, Q14). Every dancer's slot moves by
  // their own role's share of the dance's progression and the hall's seating is
  // read back off where that leaves them. For the single progression every
  // dance in the programme dances, that is the formation's own
  // `Progression.next`, unchanged — see `lattice.ts` for the two paths and why.
  //
  // Since M8 the shift is applied at the end of **every pass** rather than once
  // at the end of the record, so there is nothing left to do here: `states`
  // already holds what each set looks like afterwards.
  return { emissions, next: { sets: hall.sets.map((set) => states.get(set.id)!) } };
}

/**
 * **The set, at every call boundary of one time through** (M13).
 *
 * What the text layer needs and nothing else does: where every dancer stands,
 * what they are holding, which slot they call home and who they are bound to,
 * at the seam between one call and the next — plus the instances on either side
 * of that seam, so the hint can ask "who did this call put me with, and who does
 * the next one".
 *
 * `model` is a **copy**: the loop below moves one model through the whole time
 * through, and a snapshot that aliased it would read the end of the dance at
 * every boundary.
 */
export interface BoundarySnapshot {
  /** The beat of the time through this boundary sits at. */
  beat: Beat;
  /** Which written call starts here; the schedule's length at the wrap. */
  index: number;
  /** The phrase that call belongs to, or the last phrase at the wrap. */
  phrase: PhraseName;
  /** Which pass of the record, from zero. */
  pass: number;
  /** The set as it stands here. */
  model: SetModel;
  /** The instances the call that starts here resolves to; empty at the wrap. */
  starting: readonly FigureInstance[];
  /** The instances of the call that has just ended; empty at the top. */
  ending: readonly FigureInstance[];
}

/** One time through of a probe line, read at every call boundary. */
export interface DanceBoundaries {
  /**
   * **The four dancers a caller's sentence is about**: one interior minor set of
   * the probe line at beat 0.
   *
   * A hint is said to the whole hall, so it has to be true of a minor set that
   * is *dancing* — not of the couple standing out at an end, whose answers are
   * the end effects and are a different table (M6's). The middle of the line is
   * the interior one, and the four are named by **dancer**, which is what
   * survives a progression in the middle of a time through.
   */
  reference: readonly DancerId[];
  boundaries: readonly BoundarySnapshot[];
}

/**
 * Dance `dance` headlessly on a probe line and report the set at every call
 * boundary.
 *
 * **Not a second planner.** It is `planContraCycle`'s own loop with the emissions
 * left out: the same `resolveConcurrent`, the same `advance`, the same
 * `rebind`, the same progression rules, so a boundary here is the boundary the
 * hall actually dances. What it does not do is emit figures, carry hold
 * *reporting* across a seam (`carryInto` writes a `Carried` for the renderer and
 * changes nothing the model records) or fill anybody's wait-out — a waiting
 * couple is simply never cast, which is exactly what the seam hint wants.
 *
 * One set, because a hint is a sentence said to the whole hall: which minor set
 * of that line it is read off is the caller's choice, not this function's.
 */
export function danceBoundaries(
  dance: Dance,
  formation: Formation,
  couples = PROBE_COUPLES,
): DanceBoundaries {
  const { registry, library } = contraDataEngine();
  const hall = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
  let state: SetState = hall.sets[0]!;
  const reference = interiorFour(formation, state);

  const local = new Map<DancerId, LocalSpot>();
  const first = firstPlaces(formation, dance, state);
  for (const [dancer, memo] of first.local) local.set(dancer, memo);
  let model = modelFromSet(formation, state, first.world);

  const spans = dancePassSpans(dance);
  const perPass = dance.phrases.length / spans.length;
  const schedule = passSchedule(dance, perPass);
  const phraseOf = phraseNames(dance);
  const shift = progressionOf(dance);
  const progressEvery = dance.progressEvery ?? 1;

  const out: BoundarySnapshot[] = [];
  let ending: readonly FigureInstance[] = [];
  let seq = 0;
  const mint = (plan: GroupPlan): Group =>
    createGroup({ ...plan, id: `${plan.id}#b${String(seq++)}` }, formation.roleSet);

  for (const [passIndex] of spans.entries()) {
    let progressedInPass = false;
    for (const [index, { call, start: offset, pass }] of schedule.entries()) {
      if (pass !== passIndex) continue;
      const groups = formation.groupsFor(call.group ?? HANDS_FOUR_GROUP, state);
      const instances = resolveConcurrent(
        call,
        { model, formation, library, groups, localOf: (dancer, f) => localIn(local, dancer, f) },
        offset,
      );
      out.push({
        beat: offset,
        index,
        phrase: phraseOf[index]!,
        pass,
        model: structuredClone(model),
        starting: instances,
        ending,
      });
      ending = instances;

      for (const instance of instances) {
        if (instance.holdPlace) {
          // A dancer standing still moves nowhere and holds nothing.
          for (const dancer of Object.values(instance.cast)) {
            const held = model.dancers[dancer];
            if (held) held.holds = {};
          }
          continue;
        }
        const definition = library.get(instance.figure);
        const fig = figureFor(definition, registry);
        const def = registry.get(instance.figure);
        const group = mint(instance.group);
        const from = fromSpots(group, model, local);
        const chainParams = withDefaults<ContraParams>(
          def,
          { ...callParams(instance), from, carried: NO_CARRIED },
          instance.beats,
        );
        advance(fig, chainParams, group, model, local, instance);
        rebind(instance, model);
      }

      if (progressesHere(call)) {
        progressedInPass = true;
        state = progressSet(formation, model, state, shift);
        model = progressModel(model, shift);
      }
    }
    if (!progressedInPass && (passIndex + 1) % progressEvery === 0) {
      state = progressSet(formation, model, state, shift);
      if (passIndex + 1 < spans.length) model = progressModel(model, shift);
    }
  }

  out.push({
    beat: danceBeats(dance),
    index: schedule.length,
    phrase: phraseOf[phraseOf.length - 1] ?? "",
    pass: spans.length - 1,
    model: structuredClone(model),
    starting: [],
    ending,
  });
  return { reference, boundaries: out };
}

/** A line long enough to have an interior minor set, whichever formation it is. */
const PROBE_COUPLES = 8;

/** The four dancers of the middle **dancing** minor set of a line. */
function interiorFour(formation: Formation, set: SetState): DancerId[] {
  const dancing = formation.groupsFor(HANDS_FOUR_GROUP, set).filter((plan) => plan.kind === "set");
  const middle = dancing[Math.floor(dancing.length / 2)] ?? dancing[0];
  if (middle === undefined) return [];
  return middle.stations
    .map((station) => middle.members[station.id])
    .filter((dancer): dancer is DancerId => dancer !== undefined);
}

/** Which phrase each written call of the record belongs to, in schedule order. */
function phraseNames(dance: Dance): PhraseName[] {
  const out: PhraseName[] = [];
  for (const phrase of dance.phrases) {
    for (let i = 0; i < phrase.figures.length; i++) out.push(phrase.name);
  }
  return out;
}

/** One schedule entry: the call, the beat it starts on, and the pass it is in. */
interface PassScheduled {
  call: FigureCall;
  start: Beat;
  pass: number;
}

/**
 * The dance's calls with the **pass** each one belongs to.
 *
 * Which pass a phrase is in is the record's `passes` divided over its phrase
 * list in order, and the beat arithmetic is `danceSchedule`'s own (a call's
 * length is the longest of it and its concurrent branches). Computed from the
 * phrase's *index* rather than from its start beat, so a zero-beat call at the
 * very end of a pass belongs to the pass it is written in.
 */
function passSchedule(dance: Dance, perPass: number): PassScheduled[] {
  const out: PassScheduled[] = [];
  let beat: Beat = 0;
  dance.phrases.forEach((phrase, index) => {
    const pass = Math.floor(index / perPass);
    for (const call of phrase.figures) {
      out.push({ call, start: beat, pass });
      beat += callBeats(call);
    }
  });
  return out;
}

/** Nothing carried either way; `contraFigure`'s own default, spelled out. */
const NO_CARRIED: Carried = { in: {}, out: {} };

/** A call's own parameters, with the three resolution derives stripped back out. */
function callParams(instance: FigureInstance): Record<string, unknown> {
  const rest = { ...instance.params };
  delete rest["from"];
  delete rest["carried"];
  // `rebind` is a fact about the *set*, not about the figure: it says who you
  // are bound to when the figure lets go. No figure reads it and none should.
  // `trade` is the same kind of thing (Q10): which of a same-role pair takes
  // which figure-role is a fact about the **casting**, and resolution has
  // already applied it by the time a figure is planned.
  delete rest[REBIND_PARAM];
  delete rest[TRADE_PARAM];
  // `progresses` (M9b) is a fact about the **set**: where the seating moves on.
  // No figure reads it either.
  delete rest[PROGRESSES_PARAM];
  return rest;
}

/**
 * Whether this call carries the progression itself (M9b).
 *
 * Read off the written call rather than off an instance, because it is true of
 * the call as a whole: a concurrent call's branches are one call and the shift
 * happens once at its end, whichever branch wrote the clause.
 */
function progressesHere(call: FigureCall): boolean {
  return concurrentCalls(call).some(
    (each) => (each.params as Record<string, unknown> | undefined)?.[PROGRESSES_PARAM] === true,
  );
}

/** The shape a definition says it forms, or `undefined` (M7). */
const targetOf = (def: { ends: unknown }): TargetShape | undefined =>
  typeof def.ends === "object" && def.ends !== null && "target" in def.ends
    ? (def.ends as { target: TargetShape }).target
    : undefined;

/**
 * The call-level parameter that says a figure's ends **rebind** somebody (Q14).
 *
 * Written in a dance record as `"params": { "rebind": { "partner": "shadow" } }`,
 * which reads "when this figure lets go, whoever was your shadow is your
 * partner". Contrablend's second roll-away is the one call in the acceptance
 * set that needs it — the transcript's own "(new partner)" — and the binding it
 * writes is what every "partner" call after it means.
 *
 * It rides in `params` rather than on `FigureCall` because `FigureCall` is
 * `@caller/choreo`'s and "partner" is a contra word (AC7), and it is stripped
 * back out before the figure is planned so no figure can read it.
 */
export const REBIND_PARAM = "rebind";

/**
 * **The call-level parameter that says the progression happens here** (M9b),
 * at the end of this call rather than at the end of the time through.
 *
 * Written in a dance record as `"params": { "progresses": true }`.
 *
 * The engine has always shifted the slots at the cycle boundary, because that
 * is where a contra dance usually progresses: the last figure leaves you one
 * place along and the boundary is where the set admits it. A dance whose
 * progression is carried by a figure **in the middle** of the time through has
 * no way to say so, and the corpus writes several: Fatal Attraction's A1
 * promenade goes round the major set and its A2 casts back, so by A2 the
 * dancers really are one place along and the calls that follow name their
 * neighbours from *there*. Left at the boundary, every one of those calls
 * resolves against the seating the dance has already left behind — measured, the
 * dancer `N2` named was, at every checked length, a couple standing out.
 *
 * So the shift is a thing a call may claim. The rules are the smallest set that
 * keeps everything else true:
 *
 * - the shift is the dance's own (`progressionOf`), applied exactly as the
 *   boundary applies it — same `progressSet`, same `progressModel`, so a
 *   role-asymmetric progression and a line swap mean the same thing here;
 * - **the boundary's own shift is then zero for that pass**, because a set
 *   progresses once per pass however it is written. A record that claims it
 *   twice in one pass progresses twice, which is what "`progressEvery`" already
 *   means for a two-pass record;
 * - relations after the call resolve against the shifted slots, which is the
 *   whole point, and the dancers do not move: what moves is the seating, exactly
 *   as at a boundary. M5's On the Prowl (the hey that ends short *is* the
 *   progression) and M8's diagonal hey are the two precedents for the *bodies*
 *   being carried by a figure; this is the seating catching up with them.
 *
 * It rides in `params` for the same reason `rebind` and `trade` do: `FigureCall`
 * is `@caller/choreo`'s, and where a contra set progresses is a contra fact
 * (AC7). It is stripped before the figure is planned, so no figure reads it.
 */
export const PROGRESSES_PARAM = "progresses";

/** What a `rebind` parameter says: a binding, and the relation it is rebound to. */
interface RebindSpec {
  partner?: string;
}

/**
 * Apply a call's rebinding to the dancers it cast.
 *
 * Every new binding is worked out **before** any of them is written, so a
 * roll-away that rebinds a whole set does not read a binding it has just
 * changed. A relation that names nobody leaves the binding alone, which is the
 * end-of-set rule again: a dancer at the end of the line has no shadow to be
 * rebound to and keeps the partner they had.
 */
function rebind(instance: FigureInstance, model: SetModel): void {
  const spec = instance.params[REBIND_PARAM] as RebindSpec | undefined;
  if (spec?.partner === undefined) return;
  const rel = parseRelation(spec.partner);
  const table = setRulesOf(model.formation).relations;
  const bound = new Map<DancerId, DancerId>();
  for (const dancer of Object.values(instance.cast)) {
    const other = relate(model, table, dancer, rel);
    if (other !== undefined) bound.set(dancer, other);
  }
  for (const [dancer, other] of bound) model.dancers[dancer]!.partner = other;
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
 * Where a waiting couple is really standing when its `wait-out` begins, in the
 * wait group's own frame — `WaitOutParams.startPlaces` (M8b, DD30).
 *
 * The default that field carries is "the waiting places", and for almost every
 * dance that is also the truth: the last figure of the time through is a
 * gatherer, it settles the whole set on the formation's places, and the couple
 * that ends up out is standing on the waiting place already. `wait-out` then
 * steps together from exactly where it is and nothing moves that would not have
 * moved anyway — measured, and the reason every plate, strip and hall golden in
 * the repository is byte-identical across this change.
 *
 * Contrablend is the dance that is not like that. Its progression moves the
 * larks one place and the robins three, so the couple that ends up waiting is a
 * **new** couple — two dancers the whole time through never treated as a pair —
 * and at five and six couples the four of them are left out of B2's last
 * thirteen beats by a relation that names nobody. With the default they were
 * teleported on to the waiting places at the cycle boundary: 32 px for the two
 * robins and 37.7359 px (`sqrt(32² + 20²)`, across the set *and* one place
 * along) for the two larks, while every other dancer was continuous to 0.000.
 *
 * This is the cross-set plan's ruling 2 — *the outs do what the ins need* —
 * in its smallest honest form: the couple that is out walks in from where the
 * dance left it, rather than the dance being asked to leave it somewhere
 * `wait-out` would like. A dance that says its own `startPlaces` still gets
 * exactly those: a becket dance whose first figure *is* the progression needs
 * the couple to slide off the end with everybody else, which is a claim about
 * where they start rather than a reading of where they are.
 */
function waitingFrom(
  group: Group,
  standing: ReadonlyMap<DancerId, EndPose>,
  local: Map<DancerId, LocalSpot>,
): Spots {
  const out: Spots = {};
  for (const station of group.stations) {
    const dancer = group.members[station.id];
    if (dancer === undefined) continue;
    const memo = localIn(local, dancer, group.frame);
    if (memo) {
      out[station.id] = {
        p: memo.p,
        facing: station.facing + angleDiff(station.facing, memo.facing),
      };
      continue;
    }
    const spot = standing.get(dancer);
    if (spot === undefined) continue;
    const facing = localAngle(group.frame, spot.facing);
    out[station.id] = {
      p: localPoint(group.frame, spot.p),
      // **The same facing, written the station's way round.** A dancer's facing
      // accumulates whole turns — a swing leaves them at 630°, not 270° — and
      // `wait-out` walks from this pose to the hold by interpolating it, so a
      // couple already standing on its waiting place would be handed 630° where
      // the station says 270° and turn twice on the spot. Read as the nearest
      // equivalent of the station's own facing it is the same angle, and a
      // couple that is where the default would have put it gets exactly the
      // default (`planCycle.golden.test.ts` is what says so, to 1e-9).
      facing: station.facing + angleDiff(station.facing, facing),
    };
  }
  return out;
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

/**
 * Move the set on by one instance: its ends become spots, its last-beat joins
 * become holds.
 *
 * `planned` and `lastInstance` are the **emission**'s bookkeeping — which
 * instance a dancer is coming out of, so that the next one can report a hold as
 * carried. {@link danceBoundaries} leaves them out: it reads the model and emits
 * nothing, and a `Carried` changes no spot and no hold.
 */
function advance(
  fig: ContraFigure,
  chainParams: ContraParams,
  group: Group,
  model: SetModel,
  local: Map<DancerId, LocalSpot>,
  instance: FigureInstance,
  planned?: Planned,
  lastInstance?: Map<DancerId, Planned>,
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
    if (planned !== undefined) lastInstance?.set(dancer, planned);
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
function gapsIn(
  pass: { start: Beat; end: Beat },
  dancers: readonly DancerId[],
  claimed: Map<DancerId, Span[]>,
): Span[] {
  // **Clipped to this run of beats** (M9b). Until a call could carry the
  // progression there was one fill per pass and every claim was inside it, so
  // the clip was free. Now a pass is one run per seating, and a couple that is
  // out for the first run and dancing for the second has claims *after* this
  // run's end: unclipped they opened a second gap beyond it and the timeline
  // refused the dance ("would dance wait-out at 18 while still in
  // walk-to-station until 24").
  const spans: Span[] = [];
  for (const dancer of dancers) {
    for (const [from, to] of claimed.get(dancer) ?? []) {
      const start = Math.max(from, pass.start);
      const end = Math.min(to, pass.end);
      if (end > start) spans.push([start, end]);
    }
  }
  if (spans.length === 0) return [[pass.start, pass.end]];

  const gaps: Span[] = [];
  let at: Beat = pass.start;
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (from > at) gaps.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < pass.end) gaps.push([at, pass.end]);
  return gaps;
}
