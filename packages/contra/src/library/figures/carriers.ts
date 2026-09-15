import type { Formation } from "@caller/choreo";
import { BECKET } from "../../formation/becket.js";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import type { ContraFigure } from "../../figures/ContraFigure.js";
import type { CompareCase, CompareResult } from "../compareFigures.js";
import { compareFigures } from "../compareFigures.js";
import type { FigureDefinition, FigureRole } from "../FigureDefinition.js";

/**
 * **The carriers**, and the gate each of them passes.
 *
 * A *carrier* is a figure that leaves people wherever its own shape put them
 * (`ends: "relative"`) — a pass through, a circle, a chain — as against the
 * five *gatherers* M2 migrated, which settle on to the formation's own places.
 * The distinction decides the gate: a gatherer is **allowed** to differ from
 * the figure it replaces once the dancers are off their places, because its end
 * is honest now, while a carrier has no such licence. Its ends are a function
 * of where the dancers stand, so **it has to agree everywhere, from the
 * stations and displaced alike, with no allowed difference at all** — and a
 * difference is a bug in one of the two rather than a look decision.
 *
 * That is why `carrierGolden` runs both ways round with the same empty
 * allowance where `gatherers.ts`'s `gathererGolden` widens the displaced half.
 */

/** Both formations every demo dance is written in. */
export const CARRIER_FORMATIONS: readonly Formation[] = [DUPLE_IMPROPER, BECKET];

/**
 * The four places of a hands-four, which is what a whole-minor-set carrier's
 * parts still are.
 *
 * A deliberate, temporary exception to "figure-roles are parts in this figure",
 * and it is worth being plain about why. These eleven figures have no parts: in
 * a pass through, a circle, a long lines or a slide everybody does the same
 * thing, and who you do it *with* is read off where people are standing rather
 * than named. The five that do pair people up — the roll away, the twirl, the
 * do-si-do, right and left through and the chain — name their pairs with these
 * same four ids in the dance records (`pairs: [["1R", "2R"]]`, "robins right
 * shoulder round"), and until a `pairs` written as a **relation** reaches them
 * (M6) renaming their parts would change *which dancers dance*, not merely how.
 *
 * So the carriers keep `actors: "all"`: one instance over everybody the call
 * selected, in the formation's own group, exactly as the coded figures are
 * written — which is also what lets this milestone hold every one of them to
 * agreeing with its predecessor to the last pixel. M6 and M7 are where a
 * carrier gets parts of its own, with `actors: "each"` and `"line"` and the
 * relations to name a pair by.
 */
export const MINOR_SET_ROLES: readonly FigureRole[] = ["1L", "1R", "2L", "2R"];

/** What one carrier's comparison produced, both ways round. */
export interface CarrierGolden {
  /** From the formation's own places. */
  stations: CompareResult[];
  /** From a deterministic wobble off them: a carrier still has to agree. */
  displaced: CompareResult[];
}

/**
 * One carrier's cases, run from the stations and then displaced, with the
 * milestone's tolerance and **no allowed difference in either half**.
 *
 * A case that really does need one states it itself, in its own file, with the
 * reason — which in this milestone happens exactly nowhere.
 */
export function carrierGolden(
  coded: ContraFigure,
  definition: FigureDefinition,
  cases: readonly CompareCase[],
  formations: readonly Formation[] = CARRIER_FORMATIONS,
): CarrierGolden {
  return {
    stations: compareFigures(coded, definition, { cases, formations }),
    displaced: compareFigures(coded, definition, {
      cases: cases.map((test) => ({ ...test, from: "displaced" as const })),
      formations,
    }),
  };
}

/** Both halves at once, for a test that asserts one set of numbers. */
export const bothWays = (golden: CarrierGolden): CompareResult[] => [
  ...golden.stations,
  ...golden.displaced,
];

/** The worst of a set of results, for a test to assert one number on. */
export const worstOf = (
  results: readonly CompareResult[],
): { position: number; facing: number; hand: number; cases: number; samples: number } => ({
  position: Math.max(...results.map((r) => r.maxPosition)),
  facing: Math.max(...results.map((r) => r.maxFacing)),
  hand: Math.max(...results.map((r) => r.maxHand)),
  cases: results.length,
  samples: results.reduce((total, r) => total + r.samples, 0),
});
