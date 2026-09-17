import type { FigurePlan } from "../../figures/ContraFigure.js";
import type { FigureShape, HoldSpec } from "../FigureDefinition.js";
import type { ShapeInput } from "../interpret.js";
import { planCourtesyTurn } from "./courtesyTurn.js";
import { planLineWalk } from "./lineWalk.js";
import { planOrbitPair } from "./orbitPair.js";
import { planPath } from "./path.js";
import { planRingWalk } from "./ringWalk.js";
import { planRock } from "./rock.js";
import { planSchedule } from "./schedule.js";
import { planSequence } from "./sequence.js";
import { planUnit } from "./unit.js";
import { planWave } from "./wave.js";
import { planWaypoints } from "./waypoints.js";

/**
 * **The shape kinds**, and the one `switch` that dispatches them.
 *
 * A kind is written once for every figure that uses it: `rock` is the balance
 * and the balance of the ring, `orbitPair` is the swing and the allemande, and
 * `sequence` is any figure callers name as one and dance as several. No figure
 * has code of its own — a definition is data and names a kind.
 *
 * `lineWalk`, `unit` and `wave` are **M7's** three, and they are three rather
 * than one because a line with an order, two dancers moving as one body, and a
 * line of joined hands rocking on the set's own lattice are three different
 * things a shape can be — the first two are the brief's own headline ("a line of
 * four with an order and a facing"; "a couple, or any two dancers, as one actor
 * with its own orientation") and the third is what M6 handed over.
 *
 * `ringWalk`, `path` and `courtesyTurn` are **M4's**, `waypoints` is M6's and
 * `schedule` — the hey, as the meetings it is made of — is M5's.
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
    case "schedule":
      return planSchedule(shape, holds, input);
    case "courtesyTurn":
      return planCourtesyTurn(shape, holds, input);
    case "lineWalk":
      return planLineWalk(shape, holds, input);
    case "unit":
      return planUnit(shape, holds, input);
    case "wave":
      return planWave(shape, holds, input);
  }
}

export { planCourtesyTurn } from "./courtesyTurn.js";
export { planOrbitPair } from "./orbitPair.js";
export { planPath } from "./path.js";
export { planRingWalk } from "./ringWalk.js";
export { planRock } from "./rock.js";
export { passListOf, passesOfSchedule, planSchedule, scheduleOf } from "./schedule.js";
export type { Lane, PlannedSchedule } from "./schedule.js";
export { planSequence } from "./sequence.js";
export { planLineWalk } from "./lineWalk.js";
export { planUnit } from "./unit.js";
export { planWave } from "./wave.js";
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
export { settleEnds, settleOnPlaces, nearestPlaces, placePairFor } from "./places.js";
export type { PlacePair } from "./places.js";
