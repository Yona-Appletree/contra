import type { Angle } from "../geometry/Angle.js";
import { bodyPoint } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";
import type { PoseSample } from "./PoseSample.js";
import { SHOULDER_FORWARD_PX, SHOULDER_WIDTH_PX } from "./RenderingContract.js";

/**
 * The two shoulder points: {@link SHOULDER_WIDTH_PX} apart, rotated by the
 * dancer's facing, and {@link SHOULDER_FORWARD_PX} ahead of the body centre.
 * `L` is the dancer's own left.
 *
 * Pass `swayDeg` (from {@link import('./quietMotion.js').quietMotion}) when the
 * renderer is drawing the swaying torso, so the arms stay attached to it. The
 * default of 0 gives the shoulders of the unswayed body.
 */
export function shoulders(sample: PoseSample, swayDeg = 0): { L: Vec2; R: Vec2 } {
  return shouldersAt(sample.p, sample.facing + swayDeg);
}

/** {@link shoulders} for a bare position and facing. */
export function shouldersAt(p: Vec2, facing: Angle): { L: Vec2; R: Vec2 } {
  const half = SHOULDER_WIDTH_PX / 2;
  return {
    L: bodyPoint(p, facing, SHOULDER_FORWARD_PX, -half),
    R: bodyPoint(p, facing, SHOULDER_FORWARD_PX, half),
  };
}
