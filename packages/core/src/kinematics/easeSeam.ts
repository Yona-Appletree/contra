import { angleLerp } from "../geometry/Angle.js";
import { mix, smooth } from "../geometry/smooth.js";
import type { Hand, PoseSample } from "./PoseSample.js";
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
 */
export function easeSeam(prev: PoseSample, next: PoseSample, k: number): PoseSample {
  const w = smooth(k);
  return {
    ...next,
    facing: angleLerp(prev.facing, next.facing, w),
    lean: mix(prev.lean, next.lean, w),
    hands: {
      L: easeHand(prev.hands.L, next.hands.L, w),
      R: easeHand(prev.hands.R, next.hands.R, w),
    },
  };
}

/** Progress through the seam for a figure `t` beats in; 1 once the seam is over. */
export const seamProgress = (t: number): number => (t >= SEAM_BEATS ? 1 : t / SEAM_BEATS);

/**
 * Two placed hands interpolate. A `'down'` hand has no floor point to
 * interpolate toward, so the pair switches at the midpoint of the seam;
 * figures that want a smooth take or release animate it explicitly, as the
 * two-dancers spike does.
 */
function easeHand(a: Hand | "down", b: Hand | "down", w: number): Hand | "down" {
  if (a === "down" || b === "down") return w < 0.5 ? a : b;
  return lerpHand(a, b, w);
}
