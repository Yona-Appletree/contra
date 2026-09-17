import type { Formation } from "@caller/choreo";
import { BECKET } from "../../formation/becket.js";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import type { ContraFigure } from "../../figures/ContraFigure.js";
import type {
  CompareCase,
  CompareOptions,
  CompareResult,
  CompareTolerance,
} from "../compareFigures.js";
import { compareFigures } from "../compareFigures.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import { SAMPLED_AT, fixtureFor } from "./fixtureFile.js";

/**
 * **The gate DD21 asks each migrated gatherer to pass**, as one call.
 *
 * Each of the five has its own test file and its own parameter cases; what they
 * share is the shape of the claim, and it is worth saying once:
 *
 * 1. **From the stations** the definition and the coded figure it replaces are
 *    the same figure — every dancer, every 1/8 beat, within 0.01 px and 0.1°,
 *    with no allowed difference at all. That is the golden DD21 (Q4) asks for.
 * 2. **Displaced**, with every dancer nudged off their place, they are allowed
 *    to differ, because the migrated one now settles on to the formation's own
 *    places and the coded one opened out about wherever the pair happened to
 *    meet. The differences are still measured and reported; what is asserted
 *    instead is the positive form — a gatherer leaves people **on** the places.
 *
 * Run in both formations, because "across" means the opposite thing in the two
 * and a figure that only works in one has not been migrated.
 */

/** Both formations every demo dance is written in. */
export const GATHERER_FORMATIONS: readonly Formation[] = [DUPLE_IMPROPER, BECKET];

/** What one figure's comparison produced, both ways round. */
export interface GathererGolden {
  /** From the formation's own places: DD21's condition, and no allowance. */
  stations: CompareResult[];
  /** From a deterministic wobble off them: the honest end is allowed to differ. */
  displaced: CompareResult[];
}

/**
 * One figure's cases, run from the stations and then displaced.
 *
 * The displaced run repeats every case with `"ends"` and `"path"` allowed —
 * `"path"` because a gatherer aiming somewhere else does not only end
 * somewhere else: a swing rounds its turn so that it opens straight out on to
 * where it is going, so the honest end moves the whole figure.
 */
export function gathererGolden(
  coded: ContraFigure,
  definition: FigureDefinition,
  cases: readonly CompareCase[],
  tolerance?: CompareTolerance,
): GathererGolden {
  const stations: CompareOptions = {
    cases,
    formations: GATHERER_FORMATIONS,
    ...(tolerance === undefined ? {} : { tolerance }),
  };
  const displaced: CompareOptions = {
    cases: cases.map((test) => ({
      ...test,
      from: "displaced" as const,
      allowed: [...(test.allowed ?? []), "ends" as const, "path" as const],
    })),
    formations: GATHERER_FORMATIONS,
    ...(tolerance === undefined ? {} : { tolerance }),
  };
  const fixture = fixtureFor(coded, [stations, displaced], SAMPLED_AT);
  return {
    stations: compareFigures(fixture, definition, stations),
    displaced: compareFigures(fixture, definition, displaced),
  };
}

/** The worst of a set of results, for a test to assert one number on. */
export const worstOf = (
  results: readonly CompareResult[],
): {
  position: number;
  facing: number;
  hand: number;
  home: number;
  samples: number;
} => ({
  position: Math.max(...results.map((r) => r.maxPosition)),
  facing: Math.max(...results.map((r) => r.maxFacing)),
  hand: Math.max(...results.map((r) => r.maxHand)),
  home: Math.max(...results.map((r) => r.homePx)),
  samples: results.reduce((total, r) => total + r.samples, 0),
});
