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

/** {@link smooth} over the window `[t0, t1]`: 0 before `t0`, 1 after `t1`. */
export const ramp = (t: number, t0: number, t1: number): number => smooth((t - t0) / (t1 - t0));
