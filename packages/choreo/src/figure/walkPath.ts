import type { Angle, Beat, MotionProfile, Vec2 } from "@caller/core";
import { angleLerp, angleOfVec, len, profileProgress, rightOf, smooth, sub } from "@caller/core";
import type { EndPose } from "./FigureDef.js";

/** One instant of a walk from one floor pose to another. */
export interface WalkStep {
  p: Vec2;
  facing: Angle;
  /** True while the dancer is actually travelling, so the feet should step. */
  moving: boolean;
}

/**
 * How far to one side a walking dancer bows so two dancers swapping places pass
 * each other instead of walking through each other. Both bow to their own
 * right, so — in this coordinate system (y down, angles from +x toward +y) —
 * they pass **left** shoulder to left shoulder and end up `2 × bow` apart at
 * the crossing. A figure that wants the contra convention of right-shoulder
 * passing bows to the dancer's own **left** instead (see `@caller/contra`'s
 * `passRight`, which negates this bow for exactly that reason).
 */
export const DEFAULT_BOW_PX = 5;

/** Below this, two poses are the same point and the dancer turns in place. */
const STILL_PX = 1e-9;

/**
 * A dancer walking from `from` to `to` over `beats`, bowing `bowPx` to their own
 * right on the way, turning out of `from.facing` into the direction of travel
 * and then into `to.facing`.
 *
 * The ends are exact: `t <= 0` is `from` and `t >= beats` is `to`, with no
 * floating-point residue from the eased path, because closure is checked at
 * 0.01 px and a figure's end must be the next figure's start to the bit.
 *
 * `profile` is **how the walk spends its beats** (M10): `"smooth"` is the
 * smoothstep every caller used before, and is the default so that a caller who
 * says nothing is byte-identical; `"cruise"` is the constant-speed trapezoid,
 * which is what a body walking on the beat rather than easing through it does.
 * The **facing**'s turn-in and turn-out keep their own smoothstep whatever the
 * profile: a dancer turns *through* a step, not between steps, and the turn
 * being fastest exactly where the feet are slowest is what keeps the two from
 * adding their peaks together.
 */
export function walkStep(
  from: EndPose,
  to: EndPose,
  t: Beat,
  beats: Beat,
  bowPx = DEFAULT_BOW_PX,
  profile: MotionProfile = "smooth",
): WalkStep {
  if (t <= 0) return { p: from.p, facing: from.facing, moving: false };
  if (t >= beats) return { p: to.p, facing: to.facing, moving: false };

  const d = sub(to.p, from.p);
  const distance = len(d);
  const k = profileProgress(profile, t, beats);

  if (distance <= STILL_PX) {
    return { p: from.p, facing: angleLerp(from.facing, to.facing, k), moving: false };
  }

  const travel = angleOfVec(d);
  const bow = bowPx * Math.sin(Math.PI * k);
  const side = rightOf(travel);
  const p: Vec2 = [from.p[0] + d[0] * k + side[0] * bow, from.p[1] + d[1] * k + side[1] * bow];

  const turn = Math.min(1, beats / 4);
  const facing = angleLerp(
    angleLerp(from.facing, travel, smooth(t / turn)),
    to.facing,
    smooth((t - (beats - turn)) / turn),
  );
  return { p, facing, moving: true };
}
