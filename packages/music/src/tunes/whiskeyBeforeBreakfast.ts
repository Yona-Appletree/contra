import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate-to-high confidence —
 * a very common contra/session reel, its rising arpeggio-into-scale shape
 * is recalled clearly, though the note-for-note detail below is my own
 * hand transcription.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const whiskeyBeforeBreakfast: Tune = {
  slug: "whiskey-before-breakfast",
  title: "Whiskey Before Breakfast",
  type: "reel",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 114,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Whiskey Before Breakfast
R:reel
M:2/2
L:1/8
K:D
DFAd fed2|efed cAA2|DFAd fed2|efed cAd2|f2fe d2de|fgaf gfed|f2fe d2de|faag fed2|
DFAd fed2|efed cAA2|DFAd fed2|efed cAd2|f2fe d2de|fgaf gfed|f2fe d2de|faag fed2|
a2ag fedc|defd cAA2|a2ag fedc|defd cAd2|d2fa a2ag|fedc dcAF|d2fa a2ag|fedc d4|
a2ag fedc|defd cAA2|a2ag fedc|defd cAd2|d2fa a2ag|fedc dcAF|d2fa a2ag|fedc d4|
`,
};
