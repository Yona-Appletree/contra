import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence — the A part
 * on the A–F sharp–D figure and the B part's high D are the standard
 * old-time setting; some passing notes may differ from any one version. The
 * chart (2026-09-15) follows the typed melody: D with the G where it walks
 * down through G, and A7 at the B part's cadences; moderate confidence.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const mississippiSawyer = defineTune({
  slug: "mississippi-sawyer",
  title: "Mississippi Sawyer",
  type: "reel",
  key: "D",
  defaultBpm: 112,
  about:
    "An American old-time reel played across the South and Midwest since the nineteenth century; the name is usually said to be a river snag, a fallen tree sawing up and down in the current.",
  references: [
    {
      label: "Mississippi Sawyer on thesession.org",
      url: "https://thesession.org/tunes/search?q=Mississippi+Sawyer",
    },
  ],
  lines: [
    "A2AG FGAB|AFAG FDD2|A2AG FGAB|AFAG FDD2|d2AF GFED|FGAB AFD2|d2AF GFED|FGAB AFD2|",
    "A2AG FGAB|AFAG FDD2|A2AG FGAB|AFAG FDD2|d2AF GFED|FGAB AFD2|d2AF GFED|FGAB AFD2|",
    "d2df edcA|BAFA GFD2|d2df edcA|BAFA GFD2|f2fe dcAF|GABc dAFD|f2fe dcAF|GABc dAD2|",
    "d2df edcA|BAFA GFD2|d2df edcA|BAFA GFD2|f2fe dcAF|GABc dAFD|f2fe dcAF|GABc dAD2|",
  ],
  chords: [
    ["D", "D", "D", "D", ["D", "G"], "D", ["D", "G"], "D"],
    ["D", "D", "D", "D", ["D", "G"], "D", ["D", "G"], "D"],
    [["D", "A7"], "D", ["D", "A7"], "D", "D", ["A7", "D"], "D", ["A7", "D"]],
    [["D", "A7"], "D", ["D", "A7"], "D", "D", ["A7", "D"], "D", ["A7", "D"]],
  ],
});
