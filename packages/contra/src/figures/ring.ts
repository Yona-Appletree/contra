import type { Ring, StationId } from "@caller/choreo";
import { RING_NEIGHBOR_SPACING_PX, ringHands as choreoRingHands, ringOf } from "@caller/choreo";
import type { Hand } from "@caller/core";
import { ARM_REACH_PX, dist, shouldersAt } from "@caller/core";
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
  ringEnd,
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
 * **How much of an arm a ring's hanging hold may use**, of the contract's 15 px
 * reach.
 *
 * Not all of it: an arm drawn dead straight has nothing left to bend with, and
 * the last fraction is what keeps the elbow soft and the solver off its clamp.
 */
export const RING_ARM_HANG = 0.95;

/**
 * **A ring's joined hands hang** (FR-A2), and this is how far below the
 * shoulders they end up.
 *
 * The user, on the circle: *"this still looks so weird with everyones arms
 * sticking out oddly. elbows are down between people in this move and they
 * should make a smooth circle, not some jagged pollen looking thing."*
 *
 * The floor point was never the problem: a ring's hands meet half way between
 * two neighbours' shoulders, which on a ring of four is **4.4 px** from each of
 * them, while the arm reaching it is fifteen. Held six px below the shoulder,
 * that arm has to fold nearly in half, and two 7.5 px bones folded in half put
 * the elbow **6.2 px** off the line from shoulder to hand. Four dancers, eight
 * elbows, every one of them bowed outward: the pollen.
 *
 * So the hand is not held at a height, it **hangs** — as far down as the arm
 * has left after reaching however far out it must — and the elbow goes down
 * with it instead of out. The caller's `drop` is the floor rather than the
 * answer: the lowest the hands may hang for a ring small enough to allow it, so
 * a wide ring (Contrablend's circle reaches 10.74 px of planar at six couples)
 * lifts its hands rather than asking for an arm it has not got. Measured on A
 * Rare Bird's circle, the elbow went from 6.20 px off that line to 3.81.
 *
 * Nothing in the rendering contract moves: the bones are 7.5 px, a joined hand
 * is still one shared floor point computed once for both dancers, and the
 * robin's hand is still on top. What moves is how far under the shoulders that
 * point sits.
 */
export function ringHangDrop(ring: Ring, at: (station: StationId) => Spot, cap: number): number {
  const order = ring.order;
  if (order.length < 2) return cap;
  let worst = 0;
  for (let k = 0; k < order.length; k++) {
    const a = at(order[k]!);
    const b = at(order[(k + 1) % order.length]!);
    // The hands meet at the midpoint of the two shoulders, so each arm reaches
    // half the distance between them.
    worst = Math.max(worst, dist(shouldersAt(a.p, a.facing).L, shouldersAt(b.p, b.facing).R) / 2);
  }
  const reach = ARM_REACH_PX * RING_ARM_HANG;
  const room = reach * reach - worst * worst;
  return Math.min(cap, room <= 0 ? 0 : Math.sqrt(room));
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
