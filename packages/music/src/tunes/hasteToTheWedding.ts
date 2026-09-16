import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. High confidence — a very common
 * session and contra jig, melody essentially canonical in D. The chart is
 * the music-sound spike's (2026-09-15): D with A and G on the half-bars; high
 * confidence.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const hasteToTheWedding = defineTune({
  slug: "haste-to-the-wedding",
  title: "Haste to the Wedding",
  type: "jig",
  key: "D",
  defaultBpm: 116,
  about:
    "An eighteenth-century jig from the British Isles, in print by the 1760s and carried into both the Irish session and the New England contra repertoire.",
  references: [
    {
      label: "Haste to the Wedding on Wikipedia",
      url: "https://en.wikipedia.org/wiki/Haste_to_the_Wedding",
    },
    {
      label: "Haste to the Wedding on thesession.org",
      url: "https://thesession.org/tunes/search?q=Haste+to+the+Wedding",
    },
  ],
  lines: [
    "dcd AFA|dcd fed|ecA FAd|ecA FAG|dcd AFA|dcd fed|efg fdc|dfd d2A|",
    "dcd AFA|dcd fed|ecA FAd|ecA FAG|dcd AFA|dcd fed|efg fdc|dfd d2A|",
    "faf agf|faf gfe|faf agf|edc dcA|faf agf|faf gfe|efg fdc|dfd d3|",
    "faf agf|faf gfe|faf agf|edc dcA|faf agf|faf gfe|efg fdc|dfd d3|",
  ],
  chords: [
    ["D", "D", ["A", "D"], "A7", "D", "D", ["G", "A7"], "D"],
    ["D", "D", ["A", "D"], "A7", "D", "D", ["G", "A7"], "D"],
    ["D", "D", "D", "A7", "D", "D", ["G", "A7"], "D"],
    ["D", "D", "D", "A7", "D", "D", ["G", "A7"], "D"],
  ],
});
