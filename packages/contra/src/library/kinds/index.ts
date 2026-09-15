import type { FigurePlan } from "../../figures/ContraFigure.js";
import type { FigureShape, HoldSpec } from "../FigureDefinition.js";
import type { ShapeInput } from "../interpret.js";
import { planCourtesyTurn } from "./courtesyTurn.js";
import { planOrbitPair } from "./orbitPair.js";
import { planPath } from "./path.js";
import { planRingWalk } from "./ringWalk.js";
import { planRock } from "./rock.js";
import { planSequence } from "./sequence.js";
import { planWaypoints } from "./waypoints.js";

/**
 * **The shape kinds**, and the one `switch` that dispatches them.
 *
 * A kind is written once for every figure that uses it: `rock` is the balance
 * and the balance of the ring, `orbitPair` is the swing and the allemande, and
 * `sequence` is any figure callers name as one and dance as several. No figure
 * has code of its own — a definition is data and names a kind.
 *
 * `ringWalk`, `path` and `courtesyTurn` are **M4's**, and `waypoints` is M6's.
 * M2 admitted `ringWalk` and `path` to the union without bodies so that M4
 * would write an evaluator and widen nothing: a kind arriving without an arm is
 * a named error rather than a silently missing case, and TypeScript's
 * exhaustiveness check keeps the two lists in step.
 *
 * `path` and `waypoints` are two kinds and not one because the two milestones
 * that wrote them answer different questions — a curve and a pairing against a
 * written route whose passes find their own partners. See `waypoints.ts`.
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
      return planRingWalk(shape, holds, input);
    case "path":
      return planPath(shape, holds, input);
    case "waypoints":
      return planWaypoints(shape, holds, input);
    case "courtesyTurn":
      return planCourtesyTurn(shape, holds, input);
    case "legacy":
      throw new Error(
        `a legacy shape is the coded figure "${shape.figure}"; the interpreter does not draw it`,
      );
  }
}

export { planCourtesyTurn } from "./courtesyTurn.js";
export { planOrbitPair } from "./orbitPair.js";
export { planPath } from "./path.js";
export { planRingWalk } from "./ringWalk.js";
export { planRock } from "./rock.js";
export { planSequence } from "./sequence.js";
export { planWaypoints } from "./waypoints.js";
export type { PathStep } from "./waypoints.js";
export type { ActiveHold, ActivePairHold, ActiveRingHold, ActiveSoloHold } from "./holds.js";
export {
  activeHolds,
  endsOfHold,
  idleHandAt,
  joinsHeldAt,
  soloHandAt,
  soloIsFor,
  soloJoinsAt,
} from "./holds.js";
export { pairUp } from "./pairing.js";
