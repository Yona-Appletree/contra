import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune
 * (James Bland, 1879, public domain), not copied from any transcription
 * site. Moderate confidence — the reel setting fiddlers play at contras,
 * not the song's vocal line; the A part's D–A7 alternation is standard. The
 * chart (2026-09-15) is that alternation, with the G a band adds on the A
 * part's second bar; moderate confidence.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const goldenSlippers = defineTune({
  slug: "golden-slippers",
  title: "Golden Slippers",
  type: "reel",
  key: "D",
  defaultBpm: 112,
  lines: [
    "d2fa d2fa|gfed cAA2|d2fa d2fa|gfed cAd2|a2fa gfed|cded cAA2|a2fa gfed|cded cAd2|",
    "d2fa d2fa|gfed cAA2|d2fa d2fa|gfed cAd2|a2fa gfed|cded cAA2|a2fa gfed|cded cAd2|",
    "f2af e2ce|dfed cAA2|f2af e2ce|dfed cAd2|a2ba gfed|cAFA d2d2|a2ba gfed|gfed d4|",
    "f2af e2ce|dfed cAA2|f2af e2ce|dfed cAd2|a2ba gfed|cAFA d2d2|a2ba gfed|gfed d4|",
  ],
  chords: [
    ["D", ["G", "A7"], "D", ["G", "D"], "D", "A7", "D", ["A7", "D"]],
    ["D", ["G", "A7"], "D", ["G", "D"], "D", "A7", "D", ["A7", "D"]],
    [["D", "A7"], ["D", "A7"], ["D", "A7"], "D", "D", ["A7", "D"], "D", "D"],
    [["D", "A7"], ["D", "A7"], ["D", "A7"], "D", "D", ["A7", "D"], "D", "D"],
  ],
});
