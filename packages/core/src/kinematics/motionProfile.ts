import { clamp01, smooth } from "../geometry/smooth.js";
import type { Beat } from "../time/Clock.js";
import { trapezoid, trapezoidSpeed } from "./trapezoid.js";

/**
 * **How a leg of travel spends its beats** (M10, the move-motion gate's ruling 1c).
 *
 * `smooth` is the smoothstep every walking figure eased on before M10: away from
 * nothing, up to a peak in the middle, back to nothing. It is a fine curve for a
 * turn and a poor one for a walk — a dancer crossing the set on a smoothstep is
 * moving half again as fast half way over as the count says, and dead slow on
 * the beats the count is actually named for.
 *
 * `cruise` is the constant-speed trapezoid the swing, the allemande and the
 * do-si-do have always ridden, generalised: up to speed in about a beat, hold
 * the speed, down in about a beat. What it buys is a body that reads as
 * *walking on the beat* rather than easing through it, and a peak-over-average
 * speed of 4/3 on a four-beat leg where the smoothstep's is 3/2.
 *
 * The **ramp rule** is {@link cruiseRamp}: `min(1 beat, leg / 4)`. A fixed one-beat
 * ramp on a two-beat leg would be a triangle with no plateau at all — a 2.0×
 * peak, worse than the smoothstep it replaced — so short legs get proportionally
 * shorter ramps and the peak never exceeds 4/3 whatever the leg.
 *
 * Note what this type is **not**: `TimingProfile.profile` in `@caller/contra`
 * also admits `"trapezoid"`, which names a figure's own **explicit** speed
 * window (`SpeedWindow`: four corners the definition writes out). That is a
 * different thing from a profile applied to a leg whose length is only known at
 * plan time, and it stays where it is.
 */
export type MotionProfile = "smooth" | "cruise";

/** The longest ramp a cruise uses, in beats: up to speed in one beat. */
export const CRUISE_RAMP_BEATS: Beat = 1;

/**
 * How long a cruise spends getting up to speed on a leg of `beats`:
 * `min(CRUISE_RAMP_BEATS, beats / 4)`.
 *
 * A quarter of the leg at each end leaves half of it at speed, which is the
 * 4/3 peak-over-average; capping it at a beat means a long leg (long lines'
 * eight, down the hall's six) spends proportionally less of itself ramping and
 * reads flatter still — 8/7 on eight beats.
 */
export const cruiseRamp = (beats: Beat): Beat => Math.min(CRUISE_RAMP_BEATS, beats / 4);

/**
 * Normalised progress along a leg: 0 at `t <= 0`, 1 at `t >= beats`, exact at
 * both ends.
 *
 * The ends are guarded explicitly rather than left to the curve, the same way
 * `walkStep` guards its own: closure is checked at 0.01 px and a figure's end
 * has to be the next figure's start *to the bit*, so no floating-point residue
 * from an eased path is allowed to reach a seam.
 *
 * A leg of no length is a step, left-continuous, like `ramp`'s own convention:
 * 0 at and before `t = 0`, 1 after it.
 */
export function profileProgress(profile: MotionProfile, t: Beat, beats: Beat): number {
  if (beats <= 0) return t > 0 ? 1 : 0;
  if (t <= 0) return 0;
  if (t >= beats) return 1;
  if (profile === "smooth") return smooth(t / beats);
  const r = cruiseRamp(beats);
  return trapezoid(t, 0, r, beats - r, beats);
}

/**
 * The rate of {@link profileProgress}, in units of progress per beat.
 *
 * Analytic rather than differenced, so a figure that needs its own velocity —
 * the courtesy turn's orbit hands the robin on to it at exactly the right speed
 * — gets the number and not an approximation of it. Zero outside `[0, beats]`.
 */
export function profileSpeed(profile: MotionProfile, t: Beat, beats: Beat): number {
  if (beats <= 0) return 0;
  if (t <= 0 || t >= beats) return 0;
  if (profile === "smooth") {
    const k = clamp01(t / beats);
    return (6 * k * (1 - k)) / beats;
  }
  const r = cruiseRamp(beats);
  // `trapezoidSpeed` is 0..1 with 1 on the plateau; the plateau's own progress
  // rate is `1 / (beats - r)`, because the ramps between them cover exactly one
  // ramp's worth of the leg.
  return trapezoidSpeed(t, 0, r, beats - r, beats) / (beats - r);
}

/**
 * The ratio of a profile's peak speed to its average over a leg of `beats` —
 * how much faster than the count a dancer is at their fastest.
 *
 * `3/2` for the smoothstep at any length; `beats / (beats − cruiseRamp(beats))`
 * for the cruise, which is `4/3` on any leg of four beats or fewer and falls
 * toward 1 on longer ones. Written down because it is the number the gate
 * judged and the number `pnpm figure` prints.
 */
export function peakOverAverage(profile: MotionProfile, beats: Beat): number {
  if (beats <= 0) return 0;
  if (profile === "smooth") return 1.5;
  return beats / (beats - cruiseRamp(beats));
}
