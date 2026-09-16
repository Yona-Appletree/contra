import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate-to-high confidence —
 * played as a reel in D (the common contra setting, not the F hornpipe);
 * the arpeggiated A part and the high-A B part are standard. The chart
 * (2026-09-15) follows the typed melody: D and A7, with the G where the
 * melody walks down through it; moderate confidence.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const fishersHornpipe = defineTune({
  slug: "fishers-hornpipe",
  title: "Fisher's Hornpipe",
  type: "reel",
  key: "D",
  defaultBpm: 112,
  about:
    "An eighteenth-century hornpipe of British origin, in print since the 1780s, played at reel speed as a contra-dance standard.",
  references: [
    {
      label: "Fisher's Hornpipe on Wikipedia",
      url: "https://en.wikipedia.org/wiki/Fisher%27s_Hornpipe",
    },
    {
      label: "Fisher's Hornpipe on thesession.org",
      url: "https://thesession.org/tunes/search?q=Fisher%27s+Hornpipe",
    },
  ],
  lines: [
    "d2fa gfed|cAFA GABc|d2fa gfed|cAFA GABc|d2fg agfe|dcBA GFED|d2fg agfe|dcBA G2D2|",
    "d2fa gfed|cAFA GABc|d2fa gfed|cAFA GABc|d2fg agfe|dcBA GFED|d2fg agfe|dcBA G2D2|",
    "a2fa gfed|cAFA d2d2|a2fa gfed|cAFA d4|a2ag fedc|dcAG FGAB|a2ag fedc|dcAG FAd2|",
    "a2fa gfed|cAFA d2d2|a2fa gfed|cAFA d4|a2ag fedc|dcAG FGAB|a2ag fedc|dcAG FAd2|",
  ],
  chords: [
    ["D", "A7", "D", "A7", "D", ["D", "G"], "D", ["D", "G"]],
    ["D", "A7", "D", "A7", "D", ["D", "G"], "D", ["D", "G"]],
    ["D", ["A7", "D"], "D", ["A7", "D"], "D", "D", "D", ["A7", "D"]],
    ["D", ["A7", "D"], "D", ["A7", "D"], "D", "D", "D", ["A7", "D"]],
  ],
});
