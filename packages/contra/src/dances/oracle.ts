import type {
  AnyFigureDef,
  CyclePlanner,
  Dance,
  Decider,
  Formation,
  Program,
} from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  closureReport,
  collisionReport,
  coverageProblems,
  createHall,
  createLibrary,
  createScriptDecider,
  concurrentCalls,
  danceSchedule,
  dancePasses,
  dist,
  poseAt,
  reachReport,
  stationPose,
} from "@caller/choreo";
import { BECKET } from "../formation/becket.js";
import type { FigureDefaultsOverride } from "../figures/registry.js";
import { contraFigureOf, createContraRegistry } from "../figures/registry.js";
import { templateFigureOf } from "../library/figures/index.js";
import { HOLD_PLACE_FIGURE } from "../set/resolve.js";
import { formationById } from "./formations.js";

/**
 * Running one encoded dance through the engine and reading the plan's oracles
 * off it — AC1 (every hand an arm reaches), AC5 (closure) and AC6 (nobody
 * walks through anybody).
 *
 * This lives beside the dances rather than in a test file because the
 * registry test, the program test and any scratch check all want the same
 * thing, and a dance that is only checked one way is a dance that closes in
 * one line length.
 */

/** AC5's number: closure is 0.01 px. */
export const CLOSURE_PX = 0.01;
/** AC6's number: no two torso centres within 8 px. */
export const COLLISION_PX = 8;

/** The line lengths a duple improper dance is checked at (the plan's 2 to 6). */
export const DUPLE_LINES = [2, 3, 4, 5, 6] as const;
/**
 * A becket set holds `2 × places + 2` couples when the hall is even and
 * `2 × places + 1` when it is odd, so its lengths are 4 to 12.
 *
 * The odd lengths are in the list because an odd becket line is a different
 * shape — one waiting place rather than two, and a couple crossing straight
 * over at the other end (S2) — so it is worth measuring rather than assuming.
 * **Seven is the demo hall's own shorter line** (P1's `DEMO_LINES = [8, 7]`),
 * which is the odd shape the user actually watches.
 */
export const BECKET_LINES = [4, 5, 6, 7, 8, 9, 10, 12] as const;

/** The formation a dance's `formation` id names. */
export function formationFor(dance: Dance): Formation {
  return formationById(dance.formation);
}

/**
 * Whether the **old path** can dance this dance at all.
 *
 * `chainCalls` and `@caller/choreo`'s own `defaultCyclePlanner` both hand a
 * figure the four stations of a hands-four and ask it where it leaves people. A
 * figure that takes a **pair** cannot answer: `anchor: "meet"` is minted one
 * instance per pair by resolution and refuses four roles by name. While every
 * such figure had a coded twin the question never arose — the twin answered it
 * — and M5 is where a demo dance calls one that does not, because On the Prowl's
 * shoulder round has only ever been data.
 *
 * So this is the honest test of "can both engines dance this", and the two
 * places that compare the engines ask it rather than filtering by slug. The
 * demo itself runs on the new engine (`DEFAULT_ENGINE` since M3) and is
 * unaffected.
 *
 * **Three more answers since M8**, and each of them is a shape of record rather
 * than a figure. The old path threads a dance by running one running set of
 * places through a flat list of calls, so it cannot dance:
 *
 * - a **concurrent call** — two figures over one set of places at one beat is
 *   exactly what a single running `from` cannot say (Q13);
 * - a **zero-beat call** — the chain would hand the next figure the same places
 *   the last one left, which is right, but `defaultCyclePlanner` emits an event
 *   of no length for it and the old path has no rule for one;
 * - a **multi-pass record** — the progression fires inside the cycle, and the
 *   old path progresses only at its boundary.
 */
export function threadsOnTheOldPath(dance: Dance): boolean {
  if (dancePasses(dance) > 1) return false;
  return danceSchedule(dance).every(({ call }) => {
    if ((call.while ?? []).length > 0) return false;
    return concurrentCalls(call).every(
      (each) =>
        each.beats > 0 &&
        (each.figure === HOLD_PLACE_FIGURE ||
          contraFigureOf(each.figure) !== undefined ||
          templateFigureOf(each.figure) !== undefined),
    );
  });
}

/** The line lengths this dance's formation is checked at. */
export const linesFor = (dance: Dance): readonly number[] =>
  dance.formation === BECKET.id ? BECKET_LINES : DUPLE_LINES;

/**
 * How one dance is run, beyond the figure tuning: which cycle planner plans it.
 *
 * `cycle` left out is the decider's own `defaultCyclePlanner` — today's path,
 * and what every golden, strip and plate is measured against. M1's
 * `planCycle.golden.test.ts` is what passes `contraCyclePlanner` here; M3 is
 * where the app gains the choice.
 */
export interface DanceRunOptions {
  cycle?: CyclePlanner;
  /**
   * Figures added to the registry the decider runs on, replacing any coded
   * figure of the same id.
   *
   * `poseAt` looks a figure up **by id in the registry**, not in the planner's
   * emission, so a run on the new planner has to be given the interpreted
   * figures too — `contraDataFigures()` — or the planner would resolve against
   * the data swing while the timeline sampled the coded one. M2's `pnpm dance`
   * and the per-figure goldens pass both; every other caller passes neither and
   * runs exactly as it did.
   */
  figures?: readonly AnyFigureDef[];
}

/** One dance, danced by the script decider for as long as the caller asks. */
export function danceAlone(
  dance: Dance,
  couples: number,
  until: number,
  overrides: FigureDefaultsOverride = {},
  options: DanceRunOptions = {},
): Decider {
  const formation = formationFor(dance);
  const program: Program = {
    slug: `${dance.slug}-alone`,
    items: [{ dance: dance.slug, medley: "none", timesThrough: 8 }],
  };
  const registry = createContraRegistry(options.figures ?? [], overrides);
  const hall = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    program,
    registry,
    hall,
    createLibrary([dance], [formation]),
    options.cycle === undefined ? {} : { cycle: options.cycle },
  );
  decider.advance(until);
  return decider;
}

/** What one dance measures at one line length. */
export interface DanceOracles {
  /** AC5: the worst position error at any figure seam, px. */
  closurePx: number;
  /** AC5 again, read the other way: distance from the progressed set's own stations, px. */
  progressedPx: number;
  /** AC1: the worst `short` the arm solver reported. */
  maxShort: number;
  /** AC6: the closest two torso centres ever came, px. */
  minDistancePx: number;
  /** Gaps and overlaps in the timeline, which must be none. */
  coverage: string[];
  /** How many seams, hands and pairs went into the numbers above. */
  seams: number;
  hands: number;
  pairs: number;
  /** The worst offender for each, for a failure message worth reading. */
  worst: { closure?: unknown; reach?: unknown; collision?: unknown };
}

/** Run every oracle over one dance at one line length. */
export function oraclesFor(
  dance: Dance,
  couples: number,
  until = 128,
  overrides: FigureDefaultsOverride = {},
  options: DanceRunOptions = {},
): DanceOracles {
  const decider = danceAlone(dance, couples, until, overrides, options);
  const timeline = decider.timeline();
  const closure = closureReport(timeline);
  const reach = reachReport(timeline, 0, until);
  const collision = collisionReport(timeline, 0, until);

  const formation = formationFor(dance);
  const hall = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
  const progressed = formation.progression.next(hall.sets[0]!);
  let progressedPx = 0;
  for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, progressed)) {
    for (const station of plan.stations) {
      const dancer = plan.members[station.id];
      if (dancer === undefined) continue;
      // AC5's "progressed start position" is the dance's *own* first place in
      // the progressed set, which is the station for every dance that
      // progresses at the end of its cycle and one couple place back along the
      // line for one that progresses in its first figure.
      const place = dance.startPlaces?.[station.id];
      const want = stationPose(
        plan.frame,
        place === undefined ? station : { ...station, p: place.p, facing: place.facing },
      ).p;
      progressedPx = Math.max(progressedPx, dist(poseAt(timeline, dancer, 64).p, want));
    }
  }

  return {
    closurePx: closure.maxPositionError,
    progressedPx,
    maxShort: reach.maxShort,
    minDistancePx: collision.minDistance,
    coverage: coverageProblems(timeline, 0, until),
    seams: closure.seams,
    hands: reach.hands,
    pairs: collision.pairs,
    worst: {
      ...(closure.worst === undefined ? {} : { closure: closure.worst }),
      ...(reach.worst === undefined ? {} : { reach: reach.worst }),
      ...(collision.worst === undefined ? {} : { collision: collision.worst }),
    },
  };
}
