import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence — the shape
 * (the A part circling D–A, the B part opening on the high F sharp) is the
 * standard Québécois/New England setting; some passing notes may differ from
 * any one printed version. The chart (2026-09-15) follows the typed melody:
 * D with A7 on the half-bars whose notes outline it; moderate confidence.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const stAnnesReel = defineTune({
  slug: "st-annes-reel",
  title: "St. Anne's Reel",
  type: "reel",
  key: "D",
  defaultBpm: 112,
  lines: [
    "A2AA FAdA|A2AA FAdA|d2dd cdec|d2dd cdec|A2AA FAdA|A2AA FAdA|d2cd efge|fdec d2z2|",
    "A2AA FAdA|A2AA FAdA|d2dd cdec|d2dd cdec|A2AA FAdA|A2AA FAdA|d2cd efge|fdec d2z2|",
    "f2fa gfed|cdec dcAF|f2fa gfed|cdec d4|f2fa gfed|cdec dcAF|fdec dcAF|D4 D4|",
    "f2fa gfed|cdec dcAF|f2fa gfed|cdec d4|f2fa gfed|cdec dcAF|fdec dcAF|D4 D4|",
  ],
  chords: [
    ["D", "D", ["D", "A7"], ["D", "A7"], "D", "D", ["D", "A7"], "D"],
    ["D", "D", ["D", "A7"], ["D", "A7"], "D", "D", ["D", "A7"], "D"],
    ["D", ["A7", "D"], "D", ["A7", "D"], "D", ["A7", "D"], "D", "D"],
    ["D", ["A7", "D"], "D", ["A7", "D"], "D", ["A7", "D"], "D", "D"],
  ],
});
