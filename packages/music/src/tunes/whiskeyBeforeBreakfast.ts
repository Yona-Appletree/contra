import { STRING_BAND, defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence — the rising
 * D–F sharp–A–D opening and the B part on the high A are the standard
 * setting; a few passing notes may differ from any one printed version. The
 * chart (2026-09-15) follows the typed melody: D, with A7 at the cadences and
 * the G where the melody passes through it; moderate confidence.
 *
 * Band: STRING_BAND. The same guitar backup as the other American reels it
 * sits beside in the Mississippi set.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const whiskeyBeforeBreakfast = defineTune({
  slug: "whiskey-before-breakfast",
  title: "Whiskey Before Breakfast",
  type: "reel",
  key: "D",
  defaultBpm: 112,
  about:
    "A Canadian reel that came into the American repertoire through Manitoba fiddler Andy DeJarlis, and has been among the most-played tunes at contra and old-time sessions since the 1970s.",
  references: [
    {
      label: "Whiskey Before Breakfast on Wikipedia",
      url: "https://en.wikipedia.org/wiki/Whiskey_Before_Breakfast",
    },
    {
      label: "Whiskey Before Breakfast on thesession.org",
      url: "https://thesession.org/tunes/search?q=Whiskey+Before+Breakfast",
    },
  ],
  arrangement: STRING_BAND,
  lines: [
    "DFAd fed2|efed cAA2|DFAd fed2|efed cAd2|f2fe d2de|fgaf gfed|f2fe d2de|faag fed2|",
    "DFAd fed2|efed cAA2|DFAd fed2|efed cAd2|f2fe d2de|fgaf gfed|f2fe d2de|faag fed2|",
    "a2ag fedc|defd cAA2|a2ag fedc|defd cAd2|d2fa a2ag|fedc dcAF|d2fa a2ag|fedc d4|",
    "a2ag fedc|defd cAA2|a2ag fedc|defd cAd2|d2fa a2ag|fedc dcAF|d2fa a2ag|fedc d4|",
  ],
  chords: [
    ["D", "A7", "D", ["A7", "D"], "D", ["D", "G"], "D", "D"],
    ["D", "A7", "D", ["A7", "D"], "D", ["D", "G"], "D", "D"],
    ["D", ["D", "A7"], "D", "D", "D", "D", "D", "D"],
    ["D", ["D", "A7"], "D", "D", "D", "D", "D", "D"],
  ],
});
