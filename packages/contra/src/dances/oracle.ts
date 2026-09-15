import type { CyclePlanner, Dance, Decider, Formation, Program } from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  closureReport,
  collisionReport,
  coverageProblems,
  createHall,
  createLibrary,
  createScriptDecider,
  dist,
  poseAt,
  reachReport,
  stationPose,
} from "@caller/choreo";
import { BECKET } from "../formation/becket.js";
import type { FigureDefaultsOverride } from "../figures/registry.js";
import { createContraRegistry } from "../figures/registry.js";
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
  const registry = createContraRegistry([], overrides);
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
