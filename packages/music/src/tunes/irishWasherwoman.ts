import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. High confidence — probably the
 * best-known jig there is; the melody in D is canonical. The chart
 * (2026-09-15) is the standard D with A7 on the half-bars the melody
 * outlines it; high confidence.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const irishWasherwoman = defineTune({
  slug: "irish-washerwoman",
  title: "Irish Washerwoman",
  type: "jig",
  key: "D",
  defaultBpm: 116,
  lines: [
    "d2d cdA|BAF D3|d2d cdA|BAF D3|f2f edc|dcA D3|f2f edc|dcA D3|",
    "d2d cdA|BAF D3|d2d cdA|BAF D3|f2f edc|dcA D3|f2f edc|dcA D3|",
    "a2a gfe|fed d3|a2a gfe|fed d3|f2a gfe|dcA D3|f2a gfe|dcA D3|",
    "a2a gfe|fed d3|a2a gfe|fed d3|f2a gfe|dcA D3|f2a gfe|dcA D3|",
  ],
  chords: [
    ["D", "D", "D", "D", ["D", "A7"], "D", ["D", "A7"], "D"],
    ["D", "D", "D", "D", ["D", "A7"], "D", ["D", "A7"], "D"],
    [["D", "A7"], "D", ["D", "A7"], "D", ["D", "A7"], "D", ["D", "A7"], "D"],
    [["D", "A7"], "D", ["D", "A7"], "D", ["D", "A7"], "D", ["D", "A7"], "D"],
  ],
});
