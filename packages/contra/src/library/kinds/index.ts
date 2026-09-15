import type { FigurePlan } from "../../figures/ContraFigure.js";
import type { FigureShape, HoldSpec } from "../FigureDefinition.js";
import type { ShapeInput } from "../interpret.js";
import { planOrbitPair } from "./orbitPair.js";
import { planRock } from "./rock.js";
import { planSequence } from "./sequence.js";

/**
 * **The shape kinds**, and the one `switch` that dispatches them.
 *
 * A kind is written once for every figure that uses it: `rock` is the balance
 * and the balance of the ring, `orbitPair` is the swing and the allemande, and
 * `sequence` is any figure callers name as one and dance as several. No figure
 * has code of its own — a definition is data and names a kind.
 *
 * `ringWalk` and `path` are **admitted from M2 and implemented in M4**. They are
 * in the union in `FigureDefinition.ts` and they have their own arm of this
 * switch, so M4 writes an evaluator and widens nothing: a kind arriving without
 * one is a named error rather than a silently missing case, and TypeScript's
 * exhaustiveness check keeps the two lists in step.
 */
export function planShape(
  shape: FigureShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  switch (shape.kind) {
    case "rock":
      return planRock(shape, holds, input);
    case "orbitPair":
      return planOrbitPair(shape, holds, input);
    case "sequence":
      return planSequence(shape, input, planShape);
    case "ringWalk":
      throw new Error(`unsupported: shape kind "ringWalk" (M4)`);
    case "path":
      throw new Error(`unsupported: shape kind "path" (M4)`);
    case "legacy":
      throw new Error(
        `a legacy shape is the coded figure "${shape.figure}"; the interpreter does not draw it`,
      );
  }
}

export { planOrbitPair } from "./orbitPair.js";
export { planRock } from "./rock.js";
export { planSequence } from "./sequence.js";
export type { ActiveHold, ActivePairHold, ActiveRingHold } from "./holds.js";
export { activeHolds, endsOfHold, joinsHeldAt } from "./holds.js";
