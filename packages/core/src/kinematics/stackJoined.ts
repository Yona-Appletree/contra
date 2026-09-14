import type { Hand } from "./PoseSample.js";

/** One dancer's claim on a joined hand. `role` is a role name from a role set. */
export interface JoinedHand {
  role: string;
  hand: Hand;
}

/**
 * The part of a role set this package needs. `top` names the role whose hand is
 * drawn on top of a joined pair — the contra role set says `robin` — so `core`
 * stays form-neutral and never mentions larks or robins.
 */
export interface HandStackRoleSet {
  top: string;
}

/**
 * Order two joined hands so the drawing order is always the same: the role
 * set's `top` role first, the other underneath. When neither hand belongs to
 * the `top` role the order given is kept, so the result is still deterministic.
 *
 * This is the whole of the "robin's hand on top, lark's underneath" invariant
 * (plan AC2) expressed without naming either role.
 */
export function stackJoined(
  a: JoinedHand,
  b: JoinedHand,
  roleSet: HandStackRoleSet,
): [top: JoinedHand, bottom: JoinedHand] {
  return b.role === roleSet.top && a.role !== roleSet.top ? [b, a] : [a, b];
}
