import type { Vec2 } from "./Vec2.js";

/**
 * Quantise to 1/256 px, the sub-pixel grid the rendering contract puts
 * positions on. `core` never applies this to its own output — the renderer
 * does, at draw time — but the function lives here so there is exactly one
 * definition of the grid.
 */
export const q256 = (v: number): number => Math.round(v * 256) / 256;

/** {@link q256} applied to both components. */
export const q256Vec2 = (v: Vec2): Vec2 => [q256(v[0]), q256(v[1])];
