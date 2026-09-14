import type { Angle, Arm3dSolution, Beat, Hand, PoseSample, Side, Vec2 } from "@caller/core";
import {
  NEUTRAL_STYLE,
  bodyPoint,
  q256Vec2,
  quietMotion,
  shouldersAt,
  solveArm3d,
} from "@caller/core";
import type { FrameDancer } from "../renderer/Frame.js";
import type { Person } from "./Person.js";
import { headLook } from "./headLook.js";

/** How far below the shoulder a hand hangs when the figure does not place it. */
export const HAND_HANG_DROP_PX = 14;

/** How far out to the side a hanging hand sits, and how far forward it rests. */
export const HAND_HANG_LATERAL_PX = 6.2;
export const HAND_HANG_FORWARD_PX = 0.4;

/** How far a hanging hand swings forward and back with the step. */
export const HAND_HANG_SWING_PX = 0.8;

/** Left and right, in that order. */
export type ArmPair = readonly [left: Arm3dSolution, right: Arm3dSolution];

/**
 * One dancer resolved into the points that get drawn: the quantised body
 * position, the swayed torso angle, where the feet are, which way the head
 * actually turns, and both arms solved in three dimensions.
 *
 * This is the whole of the renderer's per-dancer maths, split out so the pair
 * page's rig view (M5) and the tests can see the same numbers the pixels came
 * from.
 */
export interface DancerLayout {
  person: Person;
  pose: PoseSample;
  /** Body centre, quantised (and snapped to whole px when anti-aliasing is off). */
  p: Vec2;
  /** Facing plus the torso sway — the angle the body is drawn at. */
  torsoAngle: Angle;
  /** The sway alone, in degrees. */
  sway: number;
  /** Foot offsets in body-local px: `[forward, right]`. */
  feet: { L: Vec2; R: Vec2 };
  /** Absolute angle the head is drawn at, after the neck limit. */
  headAngle: Angle;
  /** The hands actually used, hanging hands filled in for `'down'`. */
  hands: { L: Hand; R: Hand };
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
 * Resolve one dancer for one beat.
 *
 * `snap` is the position quantiser: `q256Vec2` normally, whole-pixel rounding
 * when the renderer is in `aa: false` mode. It is applied to the body position
 * *before* the shoulders and arms are solved, so an arm never disagrees with
 * the body it hangs off.
 */
export function layoutDancer(
  dancer: FrameDancer,
  beat: Beat,
  snap: (v: Vec2) => Vec2 = q256Vec2,
): DancerLayout {
  const { person, pose } = dancer;
  const velocity = dancer.velocity ?? [0, 0];
  const motion = quietMotion(pose, beat, velocity, dancer.style ?? NEUTRAL_STYLE);
  const p = snap(q256Vec2(pose.p));
  const torsoAngle = pose.facing + motion.sway;

  const hands = {
    L: resolveHand(pose, p, "L", beat),
    R: resolveHand(pose, p, "R", beat),
  };
  // Shoulders follow the swaying torso, so the arms sway with the body.
  const sh = shouldersAt(p, torsoAngle);
  const arms: ArmPair = [
    solveArm3d(sh.L, hands.L, "L", torsoAngle),
    solveArm3d(sh.R, hands.R, "R", torsoAngle),
  ];

  return {
    person,
    pose,
    p,
    torsoAngle,
    sway: motion.sway,
    feet: motion.feet,
    headAngle: headLook(pose.facing, pose.look),
    hands,
    arms,
  };
}

function resolveHand(pose: PoseSample, p: Vec2, side: Side, beat: Beat): Hand {
  const h = pose.hands[side];
  return h === "down" ? hangingHand(p, pose.facing, side, beat, pose.amp) : h;
}
