import type { Vec2 } from "./Vec2.js";

/**
 * An angle in degrees, measured from +x toward +y. Because the overhead view
 * has y increasing downward, a facing of 0° points right and 90° points toward
 * the bottom of the screen.
 */
export type Angle = number;

/** Angle of the vector `(x, y)`, in degrees. */
export const angleOf = (x: number, y: number): Angle => (Math.atan2(y, x) * 180) / Math.PI;

/** Angle of a {@link Vec2}, in degrees. */
export const angleOfVec = (v: Vec2): Angle => angleOf(v[0], v[1]);

/** Unit vector pointing along `a`. */
export const dirOf = (a: Angle): Vec2 => {
  const t = (a * Math.PI) / 180;
  return [Math.cos(t), Math.sin(t)];
};

/** Unit vector pointing to the dancer's left when facing `a`. */
export const leftOf = (a: Angle): Vec2 => {
  const d = dirOf(a);
  return [d[1], -d[0]];
};

/** Unit vector pointing to the dancer's right when facing `a`. */
export const rightOf = (a: Angle): Vec2 => {
  const d = dirOf(a);
  return [-d[1], d[0]];
};

/** Signed shortest arc from `a` to `b`, in `(-180, 180]` degrees. */
export const angleDiff = (a: Angle, b: Angle): number => {
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
};

/** Interpolate from `a` to `b` along the shortest arc. `k` is not clamped. */
export const angleLerp = (a: Angle, b: Angle, k: number): Angle => a + angleDiff(a, b) * k;

/**
 * Point `u` px forward and `w` px to the dancer's right of `p`, for a dancer
 * facing `a`. The spike's `bodyPt`.
 */
export const bodyPoint = (p: Vec2, a: Angle, u: number, w: number): Vec2 => {
  const d = dirOf(a);
  const r = rightOf(a);
  return [p[0] + d[0] * u + r[0] * w, p[1] + d[1] * u + r[1] * w];
};
