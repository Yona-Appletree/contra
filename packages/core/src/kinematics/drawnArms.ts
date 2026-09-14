import type { Vec2 } from "../geometry/Vec2.js";
import type { Angle } from "../geometry/Angle.js";
import { bodyPoint, dirOf, leftOf, rightOf } from "../geometry/Angle.js";
import { mix, smooth } from "../geometry/smooth.js";
import type { Beat } from "../time/Clock.js";
import type { Arm3dSolution } from "./Arm.js";
import { POLE_OUTWARD, solveArm3d } from "./Arm.js";
import type { Hand, PoseSample, Side } from "./PoseSample.js";
import { shouldersAt } from "./shoulders.js";

/**
 * The resting-arm model and the arm points that actually get drawn.
 *
 * A figure says where a hand is when it places one and `'down'` when it does
 * not, so "where is the arm" is only half answered by the pose: the other half
 * is this file — where a hanging hand hangs, and which way the elbow bows.
 * It lives in `core` rather than in the renderer because three different
 * callers need the same answer. The renderer draws it; `@caller/contra` starts
 * every take and every release from it, and cannot import the renderer; and
 * the motion oracle has to measure the elbow the renderer draws, because an
 * elbow that crosses the body is what reads as a jump even when the hand
 * barely moves.
 *
 * The numbers came from the two-dancers spike and were retuned at gate G1, so
 * a standing dancer is a torso, a head and almost no arm.
 */

/**
 * How far below the shoulder a hand hangs when the figure does not place it.
 *
 * A resting arm is very nearly straight — a real one is 60 cm from shoulder to
 * hand and hangs about that far down — so this sits just inside the contract's
 * 15 px reach. The 0.5 px of slack is what bends the elbow; the less of it
 * there is, the less arm there is to see from above, which is gate G1's
 * ruling ("you can't see much arm when someone is just standing there").
 */
export const HAND_HANG_DROP_PX = 14.5;

/**
 * How far out to the side a hanging hand sits, and how far forward it rests.
 *
 * The lateral number is the torso ellipse's own half-width, so the hand hangs
 * beside the hip rather than out past it — 0.1 px outside the shoulder point,
 * which is as close to straight down as the body allows.
 */
export const HAND_HANG_LATERAL_PX = 5.6;
export const HAND_HANG_FORWARD_PX = 0.4;

/**
 * How far a hanging hand swings forward and back with the step. Scaled down
 * with the rest of the hang (gate G1) so the swing stays inside the resting
 * silhouette instead of reaching past the hip.
 */
export const HAND_HANG_SWING_PX = 0.6;

/**
 * How far the hand has to be from the shoulder, on the floor, before the elbow
 * bows outward again. Inside this the hand is hanging under the shoulder and
 * the elbow tucks back instead of winging out.
 */
export const ELBOW_TUCK_PLANAR_PX = 4;

/** How far below the shoulder a hand has to be for the tuck to reach full strength. */
export const ELBOW_TUCK_DROP_PX = 6;

/** How far outward of straight back a fully tucked elbow splays, in degrees. */
export const ELBOW_TUCK_SPLAY_DEG = 15;

/** Left and right, in that order. */
export type ArmPair = readonly [left: Arm3dSolution, right: Arm3dSolution];

/**
 * One dancer's arms, resolved into the points a renderer draws: both
 * shoulders, both hands with a hanging one filled in, and both arms in three
 * dimensions (elbow, hand, `elbowZ`, `handZ`, and the `short` an out-of-reach
 * hand was pulled back by).
 */
export interface DrawnArms {
  /** Shoulder points, on the torso angle given. */
  shoulders: { L: Vec2; R: Vec2 };
  /** The hands actually used: the figure's, or the hanging one. */
  hands: { L: Hand; R: Hand };
  /** Whether each hand is hanging rather than placed by the figure. */
  hanging: { L: boolean; R: boolean };
  arms: ArmPair;
}

/**
 * Where a hand hangs when the figure says `'down'`: out to the side at
 * {@link HAND_HANG_LATERAL_PX}, swinging with the step. Ported from the
 * two-dancers spike's `hang`.
 */
export function hangingHand(p: Vec2, facing: Angle, side: Side, beat: Beat, amp: number): Hand {
  const sign = side === "L" ? -1 : 1;
  const forward =
    HAND_HANG_FORWARD_PX + sign * HAND_HANG_SWING_PX * amp * Math.sin(Math.PI * 2 * beat);
  return { p: bodyPoint(p, facing, forward, sign * HAND_HANG_LATERAL_PX), drop: HAND_HANG_DROP_PX };
}

/**
 * The floor-plane part of the elbow pole for one arm.
 *
 * {@link solveArm3d} points the pole down and outward, which is right for an
 * arm that is reaching: the elbow drops and bows away from the body. It is
 * wrong for an arm that hangs, because a near-vertical arm cancels the pole's
 * downward part entirely and the outward part is then the whole of it — the
 * elbow swings out to the side and the dancer stands there with their elbows
 * winged, about 3 px wider each side than their shoulders. That is gate G1's
 * "a bit outstretched at rest still".
 *
 * So: the nearer the hand is to hanging straight under the shoulder, the more
 * the pole swings from outward to backward, which is where a resting elbow
 * actually sits. It is a function of the hand's geometry, not of whether the
 * figure said `'down'`, so a hand a figure places at the dancer's side draws
 * the same as one the renderer hangs there.
 */
export function elbowPole(shoulder: Vec2, hand: Hand, side: Side, facing: Angle): Vec2 {
  const outward = side === "L" ? leftOf(facing) : rightOf(facing);
  const planar = Math.hypot(hand.p[0] - shoulder[0], hand.p[1] - shoulder[1]);
  const tuck = (1 - smooth(planar / ELBOW_TUCK_PLANAR_PX)) * smooth(hand.drop / ELBOW_TUCK_DROP_PX);
  if (tuck <= 0) return [outward[0] * POLE_OUTWARD, outward[1] * POLE_OUTWARD];
  // Straight back, splayed a little to this dancer's own side.
  const splay = side === "L" ? ELBOW_TUCK_SPLAY_DEG : -ELBOW_TUCK_SPLAY_DEG;
  const back = dirOf(facing + 180 + splay);
  return [
    mix(outward[0], back[0], tuck) * POLE_OUTWARD,
    mix(outward[1], back[1], tuck) * POLE_OUTWARD,
  ];
}

/**
 * One pose resolved into the arm points that get drawn.
 *
 * `p` and `torsoAngle` are separate arguments because the renderer quantises
 * the body position before it solves anything, and hangs the arms off the
 * *swaying* torso while a hanging hand is placed on the plain facing. Left to
 * default they are the pose's own, which is the figure's answer rather than
 * the renderer's — that is what the motion oracle measures, so a dancer's
 * quiet sway does not read as motion the figure asked for.
 */
export function drawnArms(
  pose: PoseSample,
  beat: Beat,
  p: Vec2 = pose.p,
  torsoAngle: Angle = pose.facing,
): DrawnArms {
  const hands = {
    L: resolveHand(pose, p, "L", beat),
    R: resolveHand(pose, p, "R", beat),
  };
  const shoulders = shouldersAt(p, torsoAngle);
  return {
    shoulders,
    hands,
    hanging: { L: pose.hands.L === "down", R: pose.hands.R === "down" },
    arms: [
      solveArm3d(
        shoulders.L,
        hands.L,
        "L",
        torsoAngle,
        elbowPole(shoulders.L, hands.L, "L", torsoAngle),
      ),
      solveArm3d(
        shoulders.R,
        hands.R,
        "R",
        torsoAngle,
        elbowPole(shoulders.R, hands.R, "R", torsoAngle),
      ),
    ],
  };
}

/** The figure's hand, or the hanging one when it left the hand `'down'`. */
export function resolveHand(pose: PoseSample, p: Vec2, side: Side, beat: Beat): Hand {
  const h = pose.hands[side];
  return h === "down" ? hangingHand(p, pose.facing, side, beat, pose.amp) : h;
}
