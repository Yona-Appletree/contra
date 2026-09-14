import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence on the exact
 * notes — the tune's bright, arpeggiated character is recalled clearly,
 * but the detail is my own hand transcription. Written in even eighth
 * notes (2/2, straight time) rather than the dotted "hornpipe swing"
 * sometimes printed, matching how this package's other reels are
 * notated and how a hornpipe is commonly played straight at a contra
 * dance.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const fishersHornpipe: Tune = {
  slug: "fishers-hornpipe",
  title: "Fisher's Hornpipe",
  type: "reel",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 118,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Fisher's Hornpipe
R:reel
M:2/2
L:1/8
K:D
d2fa gfed|cAFA GABc|d2fa gfed|cAFA GABc|d2fg agfe|dcBA GFED|d2fg agfe|dcBA G2D2|
d2fa gfed|cAFA GABc|d2fa gfed|cAFA GABc|d2fg agfe|dcBA GFED|d2fg agfe|dcBA G2D2|
a2fa gfed|cAFA d2d2|a2fa gfed|cAFA d4|a2ag fedc|dcAG FGAB|a2ag fedc|dcAG FAd2|
a2fa gfed|cAFA d2d2|a2fa gfed|cAFA d4|a2ag fedc|dcAG FGAB|a2ag fedc|dcAG FAd2|
`,
};
