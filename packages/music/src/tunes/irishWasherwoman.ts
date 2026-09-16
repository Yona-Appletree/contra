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
  about:
    "One of the best-known Irish jigs, in print since the eighteenth century, and the tune most people hum when asked for a jig.",
  references: [
    {
      label: "The Irish Washerwoman on Wikipedia",
      url: "https://en.wikipedia.org/wiki/The_Irish_Washerwoman",
    },
    {
      label: "Irish Washerwoman on thesession.org",
      url: "https://thesession.org/tunes/search?q=Irish+Washerwoman",
    },
  ],
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
