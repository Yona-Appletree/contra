import type { Trace } from "@caller/choreo";
import { sampleTrace } from "@caller/choreo";
import type { GalleryTile } from "../galleryTiles.js";

/**
 * One Moves tile's trace: the same timeline the tile's canvas is drawing, over
 * the same looping window, read as ink instead of as frames.
 *
 * "Wire the same data the tiles already sample so nothing is computed twice per
 * frame" — the tile owns a real `Timeline` (see `galleryTiles.ts`), so this
 * adds one pass over it rather than a second way of deciding the figure.
 * Cached by the tile object itself, because a Moves row re-renders on every
 * beat: a `WeakMap` rather than `tile.key` because `?chain=` (F9) rebuilds the
 * tiles array — a fresh object per figure — whenever the override changes, and
 * a string keyed on `tile.key` alone would keep serving the first candidate's
 * trace forever after, `tile.timeline` having changed underneath the same key.
 */
export function figureTrace(tile: GalleryTile): Trace {
  const cached = CACHE.get(tile);
  if (cached !== undefined) return cached;
  const trace = sampleTrace(tile.timeline, {
    from: tile.window.start,
    to: tile.window.start + tile.window.beats,
    dancers: Object.values(tile.group.members),
    frame: tile.group.frame,
  });
  CACHE.set(tile, trace);
  return trace;
}

/** The widest reach of a set of traces, so a row of plots shares one scale. */
export function traceReach(traces: readonly Trace[]): number {
  let reach = 1;
  for (const trace of traces) reach = Math.max(reach, trace.extent.x, trace.extent.y);
  return reach;
}

/** The traces already built, by tile object. */
const CACHE = new WeakMap<GalleryTile, Trace>();
