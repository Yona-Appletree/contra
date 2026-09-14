/**
 * Smoothstep: `k²(3 − 2k)` with `k` clamped to `[0, 1]`. The one easing curve
 * the model uses, for seams, takes and releases, and figure ramps.
 */
export const smooth = (k: number): number => {
  const c = clamp01(k);
  return c * c * (3 - 2 * c);
};

/** Clamp to `[0, 1]`. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Scalar linear interpolation. `k` is not clamped. */
export const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * {@link smooth} over the window `[t0, t1]`: 0 before `t0`, 1 after `t1`.
 *
 * A window of **no length** is the limit of that as `t1 → t0`: a step, 0 up to
 * and including `t0` and 1 after it. Without this, `(t − t0) / 0` is `NaN` at
 * `t = t0` and `smooth(NaN)` is `NaN`, which is how every arm in the library
 * came to vanish for 0.4 beats after every balance (F3a's finding: `balance`
 * asks for a zero-length release, so `ramp(beats, beats, beats)` was `NaN` and
 * both hands with it). The convention is left-continuous on purpose: a
 * zero-length *release* at the end of a figure then reads "still held at the
 * last beat", which is what a figure that hands its hold to the next one means.
 */
export const ramp = (t: number, t0: number, t1: number): number =>
  t1 <= t0 ? (t > t0 ? 1 : 0) : smooth((t - t0) / (t1 - t0));
