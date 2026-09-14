import type { Hand, JoinedHand, Vec2 } from "@caller/core";
import { stackJoined } from "@caller/core";
import type { RoleName, RoleSet } from "../formation/Formation.js";

/**
 * Two dancers taking one hand each: **one shared floor point**, and the role
 * set's `top` role's hand `stackPx` higher than the other's.
 *
 * The shared point is the whole of the "joined hands are one point both dancers
 * compute from the same figure frame" invariant (plan AC2): both dancers get
 * the identical `p`, so neither can drift. The order `@caller/core`'s
 * `stackJoined` returns is what the renderer draws top-first.
 *
 * `stackPx` defaults to 0, which leaves the two hands at exactly the same
 * height and the stacking purely a drawing order. A figure that wants the
 * stack to read at a distance can raise it.
 */
export function joinHands(
  p: Vec2,
  drop: number,
  roles: readonly [RoleName, RoleName],
  roleSet: RoleSet,
  stackPx = 0,
): Record<RoleName, Hand> {
  const [top, bottom] = stackJoined(
    { role: roles[0], hand: { p, drop } },
    { role: roles[1], hand: { p, drop } },
    roleSet,
  );
  return {
    [top.role]: { p, drop: drop - stackPx / 2 },
    [bottom.role]: { p, drop: drop + stackPx / 2 },
  };
}

/** Which of two joined hands is drawn on top, for a renderer. */
export const joinedOrder = (
  a: JoinedHand,
  b: JoinedHand,
  roleSet: RoleSet,
): [top: JoinedHand, bottom: JoinedHand] => stackJoined(a, b, roleSet);
