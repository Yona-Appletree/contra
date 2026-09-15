import type { DancerId, Trace } from "@caller/choreo";
import { sampleTrace, stationRank } from "@caller/choreo";
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
  const sampled = sampleTrace(tile.timeline, {
    from: tile.window.start,
    to: tile.window.start + tile.window.beats,
    dancers: Object.values(tile.group.members),
    frame: tile.group.frame,
  });
  // A pen's **rank** — the ones darker than the twos — is a fact about where a
  // dancer stands in the minor set, and `sampleTrace` reads it off the station
  // the opening event binds. Since M3 that station is a figure-role for a data
  // figure (`lark`, `a`), which ranks as 0 and would flatten the whole plate to
  // two colours. The tile's own group still knows who stands on `1L`, so the
  // rank is read from there instead; nothing else about the trace moves.
  const ranks = new Map<DancerId, number>();
  for (const station of tile.group.stations) {
    const dancer = tile.group.members[station.id];
    if (dancer !== undefined) ranks.set(dancer, stationRank(station.id));
  }
  const trace: Trace = {
    ...sampled,
    pens: sampled.pens.map((pen) => ({ ...pen, rank: ranks.get(pen.dancer) ?? pen.rank })),
  };
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
