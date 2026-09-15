import type { Ring, StationId } from "@caller/choreo";
import { RING_NEIGHBOR_SPACING_PX, ringHands as choreoRingHands, ringOf } from "@caller/choreo";
import type { Hand } from "@caller/core";
import type { HandJoin, PlanContext, Spot } from "./ContraFigure.js";

/**
 * The ring four dancers make when they take hands round.
 *
 * **The geometry lives in `@caller/choreo` now** (`figure/ring.ts`). B3's
 * literal hands four between two dances needs the same ring from the
 * form-neutral script decider, which may not import this package, and one ring
 * is better than two; so `Ring`, `ringOf`, `ringOrder`, `ringShift`, `ringWalk`
 * and the ring's own joined hands moved down a layer and are re-exported here
 * unchanged. Every figure that reads them — `circle`, `star`, `petronella`,
 * `balance`, the figure-spec language — is untouched.
 */
export type { Ring, RingWalk } from "@caller/choreo";
export {
  RING_ARM_EXTENSION,
  RING_FOOTPRINT_MARGIN_PX,
  RING_NEIGHBOR_SPACING_PX,
  ringOf,
  ringOrder,
  ringShift,
  ringWalk,
} from "@caller/choreo";

/**
 * The joined hands round a ring, in a contra figure's own terms: the plan
 * context supplies who is what role, and `@caller/choreo` does the rest.
 */
export function ringHands(
  ctx: PlanContext,
  ring: Ring,
  at: (station: StationId) => Spot,
  drop: number,
  stackPx = 0,
): { hands: Record<StationId, { L: Hand; R: Hand }>; joins: HandJoin[] } {
  return choreoRingHands(ring, at, (id) => ctx.role(id), ctx.roleSet, drop, stackPx);
}

/**
 * The ring a plan's dancers start on.
 *
 * `spacing` defaults to {@link RING_NEIGHBOR_SPACING_PX} — the ring's own
 * arm-based neighbour distance, not `ctx.spacing` (the couple spacing a
 * dancer stands from their partner) — so a ring of joined hands is always the
 * size an arm's reach wants, not the size two dancers happen to stand apart.
 */
export const ringFor = (ctx: PlanContext, spacing = RING_NEIGHBOR_SPACING_PX): Ring =>
  ringOf(ctx.start, ctx.ids, spacing);
