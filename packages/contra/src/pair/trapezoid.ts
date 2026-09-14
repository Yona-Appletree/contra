/**
 * The speed profile every travelling figure walks on: still until `a0`, up to
 * full speed by `a1`, full speed until `b0`, back to still at `b1`.
 *
 * `trapezoid` is the normalised distance travelled at `t` — 0 at `a0` and 1 at
 * `b1` — so a figure that ends where it started uses it directly as a turn
 * fraction. Ported from the two-dancers spike's `trapInt`.
 */
export function trapezoid(t: number, a0: number, a1: number, b0: number, b1: number): number {
  const seg = (u: number): number => {
    let s = 0;
    if (u > a0) {
      const e = Math.min(u, a1);
      const k = (e - a0) / (a1 - a0);
      s += ((a1 - a0) * k * k) / 2;
    }
    if (u > a1) s += Math.max(0, Math.min(u, b0) - a1);
    if (u > b0) {
      const e = Math.min(u, b1);
      const k = (e - b0) / (b1 - b0);
      s += (b1 - b0) * (k - (k * k) / 2);
    }
    return s;
  };
  return seg(Math.min(t, b1)) / seg(b1);
}

/** The same profile's speed, 0 to 1. The spike's `trapSpeed`. */
export function trapezoidSpeed(t: number, a0: number, a1: number, b0: number, b1: number): number {
  if (t <= a0 || t >= b1) return 0;
  if (t < a1) return (t - a0) / (a1 - a0);
  if (t <= b0) return 1;
  return 1 - (t - b0) / (b1 - b0);
}
