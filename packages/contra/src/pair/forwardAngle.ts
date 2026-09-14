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
