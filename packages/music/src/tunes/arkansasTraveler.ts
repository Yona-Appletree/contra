import { STRING_BAND, defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence — the B part
 * (the high F sharp run and the descending A–G–F sharp–E) is the standard
 * setting; the A part as typed leans on the fifth more than some versions.
 * The chart (2026-09-15) follows the typed melody, which sits on A7 through
 * the A part's first bars and cadences D–A7; moderate confidence.
 *
 * Band: STRING_BAND. An old-time reel, and old-time backup is a guitar
 * chopping rather than a piano booming; the fiddle stays on the tune.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const arkansasTraveler = defineTune({
  slug: "arkansas-traveler",
  title: "Arkansas Traveler",
  type: "reel",
  key: "D",
  defaultBpm: 112,
  about:
    "An American fiddle tune from the 1840s, tied to a comic stage dialogue between a traveller and a squatter, and Arkansas's official state historic song.",
  references: [
    {
      label: "The Arkansas Traveler on Wikipedia",
      url: "https://en.wikipedia.org/wiki/The_Arkansas_Traveler_(song)",
    },
    {
      label: "Arkansas Traveler on thesession.org",
      url: "https://thesession.org/tunes/search?q=Arkansas+Traveler",
    },
  ],
  arrangement: STRING_BAND,
  lines: [
    "A2AB cded|cAA2 ABA2|A2AB cded|cAA2 A2A2|d2fa gfed|cded cAA2|d2fa gfed|cded cAA2|",
    "A2AB cded|cAA2 ABA2|A2AB cded|cAA2 A2A2|d2fa gfed|cded cAA2|d2fa gfed|cded cAA2|",
    "f2fa gfed|cded cAA2|f2fa gfed|cded cAA2|agfe dcAG|FGAB cded|agfe dcAG|FGAB cAd2|",
    "f2fa gfed|cded cAA2|f2fa gfed|cded cAA2|agfe dcAG|FGAB cded|agfe dcAG|FGAB cAd2|",
  ],
  chords: [
    ["A7", ["A7", "D"], "A7", ["A7", "D"], "D", "A7", "D", "A7"],
    ["A7", ["A7", "D"], "A7", ["A7", "D"], "D", "A7", "D", "A7"],
    ["D", "A7", "D", "A7", "D", "D", "D", "D"],
    ["D", "A7", "D", "A7", "D", "D", "D", "D"],
  ],
});
