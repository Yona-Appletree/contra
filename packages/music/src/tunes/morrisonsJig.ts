import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence — the E
 * minor setting with the B part on the high G is the standard one; this
 * typing is a plain version of the A part's E–B figure. The chart
 * (2026-09-15) is Em with the D on the "dBA" half-bars and G opening the B
 * part, as a band plays it; moderate confidence.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const morrisonsJig = defineTune({
  slug: "morrisons-jig",
  title: "Morrison's Jig",
  type: "jig",
  key: "Em",
  defaultBpm: 116,
  lines: [
    "E2B BAB|dBA E3|E2B BAB|dBA E3|e2f gfe|dBA E3|e2f gfe|dBA E3|",
    "E2B BAB|dBA E3|E2B BAB|dBA E3|e2f gfe|dBA E3|e2f gfe|dBA E3|",
    "g2f gfe|dBG E3|g2f gfe|dBG E3|B2d edB|AFD E3|B2d edB|AFD E3|",
    "g2f gfe|dBG E3|g2f gfe|dBG E3|B2d edB|AFD E3|B2d edB|AFD E3|",
  ],
  chords: [
    ["Em", ["D", "Em"], "Em", ["D", "Em"], "Em", ["D", "Em"], "Em", ["D", "Em"]],
    ["Em", ["D", "Em"], "Em", ["D", "Em"], "Em", ["D", "Em"], "Em", ["D", "Em"]],
    ["G", ["G", "Em"], "G", ["G", "Em"], "Em", ["D", "Em"], "Em", ["D", "Em"]],
    ["G", ["G", "Em"], "G", ["G", "Em"], "Em", ["D", "Em"], "Em", ["D", "Em"]],
  ],
});
