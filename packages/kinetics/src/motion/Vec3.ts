import type { Vec2 } from "@caller/core";

/** A point or direction in world px, three dimensions: x across, y down, z up. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Build a {@link Vec3}. */
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** The origin. */
export const ZERO3: Vec3 = { x: 0, y: 0, z: 0 };

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });

export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));

/** Component-wise linear interpolation. `k` is not clamped. */
export const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  z: a.z + (b.z - a.z) * k,
});

/** Lift a floor-plane {@link Vec2} to a {@link Vec3} at height `z`. */
export const fromVec2 = (v: Vec2, z: number): Vec3 => ({ x: v[0], y: v[1], z });
