/**
 * The low-resolution world the hall is drawn in, and the integer factor it is
 * shown at. World coordinates are px with the origin at the centre of the
 * world canvas, y increasing downward, 4 cm per px (`CM_PER_PX`).
 *
 * `zoom` must be a positive integer: the composite is blitted with smoothing
 * off, so a fractional zoom would smear the pixel grid the whole look rests on.
 */
export interface World {
  /** Low-resolution width in world px. */
  w: number;
  /** Low-resolution height in world px. */
  h: number;
  /** Integer display zoom. */
  zoom: number;
}

/**
 * The world the two-dancers spike used: 128 × 88 px at 6×. The pair page (M5)
 * and the golden frames both start here; the hall (M9) sizes its own world by
 * the number of couples.
 */
export const DEFAULT_WORLD: World = { w: 128, h: 88, zoom: 6 };

/**
 * What an empty world looks like. The floor layer starts transparent — walls,
 * boards and the stage are M4's — so the renderer paints this behind it so a
 * frame is never see-through. It is the spikes' canvas background.
 */
export const BACKDROP_COLOUR = "#0c0a09";

/** Throws unless `world` can actually be drawn. */
export function assertWorld(world: World): World {
  if (!Number.isInteger(world.zoom) || world.zoom < 1) {
    throw new Error(`hall: zoom must be a positive integer, got ${world.zoom}`);
  }
  if (!Number.isInteger(world.w) || !Number.isInteger(world.h) || world.w < 1 || world.h < 1) {
    throw new Error(`hall: world size must be positive integers, got ${world.w}×${world.h}`);
  }
  return world;
}
