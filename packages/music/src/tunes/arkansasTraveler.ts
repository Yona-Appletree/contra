import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate-to-high confidence — one
 * of the most famous American fiddle tunes, played at nearly every old-time
 * jam and contra dance; the call-and-response shape (a repeated low phrase
 * answered by a running eighth-note figure) is canonical, though the
 * note-for-note detail below is my own hand transcription.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const arkansasTraveler: Tune = {
  slug: "arkansas-traveler",
  title: "Arkansas Traveler",
  type: "reel",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 116,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Arkansas Traveler
R:reel
M:2/2
L:1/8
K:D
A2AB cded|cAA2 ABA2|A2AB cded|cAA2 A2A2|d2fa gfed|cded cAA2|d2fa gfed|cded cAA2|
A2AB cded|cAA2 ABA2|A2AB cded|cAA2 A2A2|d2fa gfed|cded cAA2|d2fa gfed|cded cAA2|
f2fa gfed|cded cAA2|f2fa gfed|cded cAA2|agfe dcAG|FGAB cded|agfe dcAG|FGAB cAd2|
f2fa gfed|cded cAA2|f2fa gfed|cded cAA2|agfe dcAG|FGAB cded|agfe dcAG|FGAB cAd2|
`,
};
