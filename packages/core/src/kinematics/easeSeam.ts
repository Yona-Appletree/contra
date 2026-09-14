import { angleLerp } from "../geometry/Angle.js";
import { mix, smooth } from "../geometry/smooth.js";
import type { Beat } from "../time/Clock.js";
import { hangingHand } from "./drawnArms.js";
import type { Hand, PoseSample, Side } from "./PoseSample.js";
import { lerpHand } from "./PoseSample.js";
import { SEAM_BEATS } from "./RenderingContract.js";

/**
 * Cross-fade the end of one figure into the start of the next, so a figure
 * boundary is never a snap. Hands, facing and lean ease; everything else is
 * taken from `next`, which is already the figure that is running.
 *
 * `k` is the progress through the seam, 0 at the boundary and 1 at the end of
 * it; the seam lasts {@link SEAM_BEATS} beats, so a figure `t` beats in uses
 * `k = t / SEAM_BEATS` (see {@link seamProgress}). `k` is clamped and smoothed,
 * so `k = 0` returns `prev`'s hands, facing and lean and `k = 1` returns
 * `next`'s. Facing takes the shortest arc.
 *
 * `beat` is the beat being sampled, and is only needed for a hand one side
 * leaves `'down'`: a hanging hand swings with the step, so the take or release
 * across the seam has to start from, or arrive at, the hand where the hang
 * actually puts it at this instant. Left out it is the hand at rest.
 */
export function easeSeam(prev: PoseSample, next: PoseSample, k: number, beat: Beat = 0): PoseSample {
  const w = smooth(k);
  return {
    ...next,
    facing: angleLerp(prev.facing, next.facing, w),
    lean: mix(prev.lean, next.lean, w),
    hands: {
      L: easeHand(prev, next, "L", w, beat),
      R: easeHand(prev, next, "R", w, beat),
    },
  };
}

/** Progress through the seam for a figure `t` beats in; 1 once the seam is over. */
export const seamProgress = (t: number): number => (t >= SEAM_BEATS ? 1 : t / SEAM_BEATS);

/**
 * Two placed hands interpolate. So does a placed hand and a `'down'` one: the
 * hanging hand **has** a floor point — it is where `hangingHand` puts it — so
 * the take or the release animates over the seam's own beats rather than
 * switching at its midpoint.
 *
 * The switch is what this replaces. F3a measured 644 of them over the ten demo
 * dances, every one an instantaneous swap between a hand a figure had placed
 * and a hand hanging at the hip, mid-seam: the pop the user sees when an arm
 * "jumps". At `w = 1` the interpolation arrives at exactly the hand the
 * renderer would hang there anyway, so the moment the seam ends nothing moves.
 */
function easeHand(
  prev: PoseSample,
  next: PoseSample,
  side: Side,
  w: number,
  beat: Beat,
): Hand | "down" {
  const a = prev.hands[side];
  const b = next.hands[side];
  if (a === "down" && b === "down") return "down";
  return lerpHand(handOf(prev, side, beat), handOf(next, side, beat), w);
}

/** A pose's hand on this side, with a `'down'` one resolved to where it hangs. */
const handOf = (pose: PoseSample, side: Side, beat: Beat): Hand => {
  const hand = pose.hands[side];
  return hand === "down" ? hangingHand(pose.p, pose.facing, side, beat, pose.amp) : hand;
};
