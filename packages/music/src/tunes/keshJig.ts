import { PIANO_BAND, defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate-to-high confidence — the
 * G setting with the D–G–A–B opening is the standard session one. The chart
 * started as the music-sound spike's (2026-09-15) — G, C and D, the second
 * bar's Am/C ambiguity resolved the way a band resolves it, to C — with
 * three cells moved off a D the melody never touches (the spike had D under
 * the held G that ends bar 4, and under the "c2A" that opens the B part;
 * a G and a C are what those notes are) — moderate confidence.
 *
 * Band: PIANO_BAND. The piano-led jig of the bundle: the piano takes the
 * tune over a guitar while the fiddle sits out, and the count-in goes back
 * to being struck.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const keshJig = defineTune({
  slug: "kesh-jig",
  title: "The Kesh Jig",
  type: "jig",
  key: "G",
  defaultBpm: 116,
  arrangement: PIANO_BAND,
  lines: [
    "D2D GAB|c2A BGE|D2D GAB|c2A G3|B2G FGA|BAG FED|B2G FGA|BAG G3|",
    "D2D GAB|c2A BGE|D2D GAB|c2A G3|B2G FGA|BAG FED|B2G FGA|BAG G3|",
    "d2B c2A|BGA G3|d2B c2A|BGA G3|g2e dBG|ABc BGE|g2e dBG|ABc G3|",
    "d2B c2A|BGA G3|d2B c2A|BGA G3|g2e dBG|ABc BGE|g2e dBG|ABc G3|",
  ],
  chords: [
    ["G", "C", "G", ["C", "G"], ["G", "D"], ["G", "D"], ["G", "D"], ["D", "G"]],
    ["G", "C", "G", ["C", "G"], ["G", "D"], ["G", "D"], ["G", "D"], ["D", "G"]],
    [["G", "C"], "G", ["G", "C"], "G", "G", "C", "G", ["D", "G"]],
    [["G", "C"], "G", ["G", "C"], "G", "G", "C", "G", ["D", "G"]],
  ],
});
