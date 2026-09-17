import type { Hand, PoseSample, Side } from "@caller/core";
import { angleDiff, angleOf, shouldersAt } from "@caller/core";

/**
 * Below this the hand is effectively at its own shoulder — a folded arm, whose
 * floor projection has no meaningful direction.
 */
export const FOLDED_ARM_PX = 0.5;

/**
 * How far **forward of the shoulder line** one hand is, in degrees: 90° is
 * straight ahead of that shoulder, 0° is level with it, and a negative number
 * means the hand is behind the dancer.
 *
 * Gate G1's allemande ruling is a statement about this number: "The torso
 * should be rotated towards the other person so the arm is angled _forward_ not
 * back. As drawn it would be _very_ uncomfy." An arm can pull toward something
 * in front of the shoulder and can push away from it; it can do neither to
 * something behind the shoulder line, which is what makes a turn with the arm
 * trailing hurt.
 *
 * `null` for a hand the figure leaves down, and for a folded arm.
 */
export function handForwardAngle(pose: PoseSample, side: Side): number | null {
  const hand = pose.hands[side];
  if (hand === "down") return null;
  const shoulder = shouldersAt(pose.p, pose.facing)[side];
  const dx = (hand as Hand).p[0] - shoulder[0];
  const dy = (hand as Hand).p[1] - shoulder[1];
  if (Math.hypot(dx, dy) < FOLDED_ARM_PX) return null;
  return 90 - Math.abs(angleDiff(pose.facing, angleOf(dx, dy)));
}

/**
 * Below this drop a hand is at working height — shoulder to waist — rather than
 * hanging at the hip.
 *
 * The distinction is what makes "behind the shoulder line" mean anything. A
 * hand down by the hip is behind it half the time and nothing is wrong: an arm
 * hangs, and it trails when you walk. A hand held up in front of you, in
 * somebody else's or on their back, is a hand the figure is *using*, and an arm
 * cannot pull or push through one that is held behind its own shoulder.
 */
export const WORKING_DROP_PX = 6;

/**
 * Whether one hand is a **working** hand held **behind** its own shoulder line:
 * placed by the figure, above {@link WORKING_DROP_PX}, and with a negative
 * {@link handForwardAngle}.
 *
 * A hand may pass behind — a pull-by's does, a courtesy turn's does — so this
 * is a moment, not a verdict. What it is there to measure is how *long* a
 * figure keeps one there; see `figures/testing.ts` and `FIGURE_LIMITS`.
 */
export function handBehindShoulder(pose: PoseSample, side: Side): boolean {
  const hand = pose.hands[side];
  if (hand === "down" || hand.drop >= WORKING_DROP_PX) return false;
  const forward = handForwardAngle(pose, side);
  return forward !== null && forward < 0;
}
