import type { Trace } from "@caller/choreo";
import { sampleTrace } from "@caller/choreo";
import type { GalleryTile } from "../galleryTiles.js";

/**
 * One Moves tile's trace: the same timeline the tile's canvas is drawing, over
 * the same looping window, read as ink instead of as frames.
 *
 * "Wire the same data the tiles already sample so nothing is computed twice per
 * frame" — the tile owns a real `Timeline` (see `galleryTiles.ts`), so this
 * adds one pass over it rather than a second way of deciding the figure. Cached
 * by tile key, because a Moves row re-renders on every beat.
 */
export function figureTrace(tile: GalleryTile): Trace {
  const cached = CACHE.get(tile.key);
  if (cached !== undefined) return cached;
  const trace = sampleTrace(tile.timeline, {
    from: tile.window.start,
    to: tile.window.start + tile.window.beats,
    dancers: Object.values(tile.group.members),
    frame: tile.group.frame,
  });
  CACHE.set(tile.key, trace);
  return trace;
}

/** The widest reach of a set of traces, so a row of plots shares one scale. */
export function traceReach(traces: readonly Trace[]): number {
  let reach = 1;
  for (const trace of traces) reach = Math.max(reach, trace.extent.x, trace.extent.y);
  return reach;
}

/** The traces already built, by tile key. */
const CACHE = new Map<string, Trace>();
