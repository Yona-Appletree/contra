import type { Angle } from "../geometry/Angle.js";
import { dirOf, rightOf } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";
import { dot } from "../geometry/Vec2.js";
import type { Beat } from "../time/Clock.js";
import { FOOT_SWING_PX } from "./RenderingContract.js";
import {
  BUZZ_PIVOT_FOOT,
  BUZZ_STEPS_PER_BEAT,
  BUZZ_SWING_PX,
  BUZZ_TRAILING_FOOT,
  FOOT_REST_FORWARD_PX,
  FOOT_REST_LATERAL_PX,
  FULL_AMPLITUDE_SPEED,
  lerpFeet,
} from "./quietMotion.js";

const TAU = Math.PI * 2;

/**
 * The walking feet fading into the buzz step's pivot-and-push.
 *
 * `core`'s own `buzz` is a boolean that replaces the feet outright, which is
 * too abrupt for a swing: the walk has to turn into the buzz over the beat or
 * so the hold takes. It lives here rather than beside a swing because two
 * swings — the pair page's and the library's — have to put the feet in exactly
 * the same place, and a second copy of these numbers is the only way they could
 * ever disagree.
 */
export function swingFeet(
  t: Beat,
  facing: Angle,
  velocity: Vec2,
  buzz: number,
): { L: Vec2; R: Vec2 } {
  const speed = Math.hypot(velocity[0], velocity[1]);
  const moving = speed > 1e-3;
  const vu = moving ? dot(velocity, dirOf(facing)) / speed : 1;
  const vw = moving ? dot(velocity, rightOf(facing)) / speed : 0;
  const amplitude = Math.min(1, speed / FULL_AMPLITUDE_SPEED);
  const swing = FOOT_SWING_PX * Math.sin(TAU * t * BUZZ_STEPS_PER_BEAT) * amplitude;
  const walking = {
    L: [FOOT_REST_FORWARD_PX + swing * vu, -FOOT_REST_LATERAL_PX + swing * vw] as Vec2,
    R: [FOOT_REST_FORWARD_PX - swing * vu, FOOT_REST_LATERAL_PX - swing * vw] as Vec2,
  };
  const bz = Math.sin(TAU * BUZZ_STEPS_PER_BEAT * t);
  const buzzing = {
    L: [
      BUZZ_PIVOT_FOOT[0] + BUZZ_SWING_PX * bz * vu,
      BUZZ_PIVOT_FOOT[1] + BUZZ_SWING_PX * bz * vw,
    ] as Vec2,
    R: BUZZ_TRAILING_FOOT,
  };
  return lerpFeet(walking, buzzing, buzz);
}
