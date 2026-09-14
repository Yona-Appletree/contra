import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune
 * ("Oh, dem golden slippers"), not copied from any transcription site.
 * Moderate confidence on the exact notes — the bright rising-arpeggio
 * opening is recalled clearly and is a well-known fingerprint of this
 * tune, but the detail below is my own hand transcription and may differ
 * from other printed settings.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const goldenSlippers: Tune = {
  slug: "golden-slippers",
  title: "Golden Slippers",
  type: "reel",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 112,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Golden Slippers
R:reel
M:2/2
L:1/8
K:D
d2fa d2fa|gfed cAA2|d2fa d2fa|gfed cAd2|a2fa gfed|cded cAA2|a2fa gfed|cded cAd2|
d2fa d2fa|gfed cAA2|d2fa d2fa|gfed cAd2|a2fa gfed|cded cAA2|a2fa gfed|cded cAd2|
f2af e2ce|dfed cAA2|f2af e2ce|dfed cAd2|a2ba gfed|cAFA d2d2|a2ba gfed|gfed d4|
f2af e2ce|dfed cAA2|f2af e2ce|dfed cAd2|a2ba gfed|cAFA d2d2|a2ba gfed|gfed d4|
`,
};
