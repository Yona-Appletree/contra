/**
 * A point or direction in world pixels. World pixels are the simulator's only
 * spatial unit: 4 cm per px, y increasing toward the bottom of the screen
 * (overhead view). Positions are plain numbers here; quantising to 1/256 px is
 * the renderer's job, not this package's.
 */
export type Vec2 = readonly [number, number];

/** Build a {@link Vec2}. */
export const vec2 = (x: number, y: number): Vec2 => [x, y];

/** The origin. */
export const ZERO: Vec2 = [0, 0];

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];

export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];

/** `a + b * k`, the spike's three-argument `add`. */
export const addScaled = (a: Vec2, b: Vec2, k: number): Vec2 => [a[0] + b[0] * k, a[1] + b[1] * k];

export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];

export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Unit vector, or the origin when `a` has no length. */
export const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a[0], a[1]);
  return l === 0 ? ZERO : [a[0] / l, a[1] / l];
};

/** Component-wise linear interpolation. `k` is not clamped. */
export const lerp = (a: Vec2, b: Vec2, k: number): Vec2 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
];

/** Rotate `a` by `degrees` about the origin (positive turns +x toward +y). */
export const rot = (a: Vec2, degrees: number): Vec2 => {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};
