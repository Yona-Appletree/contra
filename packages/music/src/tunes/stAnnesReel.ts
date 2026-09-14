import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence on the exact
 * notes — this is my own hand transcription of the tune's driving,
 * repeated-note character (a Quebecois/Canadian standard); note-for-note
 * detail is mine and may differ from other printed settings of the same
 * tune, which is normal for an orally-transmitted fiddle reel. High
 * confidence that this is genuinely a traditional, public-domain reel.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const stAnnesReel: Tune = {
  slug: "st-annes-reel",
  title: "St. Anne's Reel",
  type: "reel",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 116,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:St. Anne's Reel
R:reel
M:2/2
L:1/8
K:D
A2AA FAdA|A2AA FAdA|d2dd cdec|d2dd cdec|A2AA FAdA|A2AA FAdA|d2cd efge|fdec d2z2|
A2AA FAdA|A2AA FAdA|d2dd cdec|d2dd cdec|A2AA FAdA|A2AA FAdA|d2cd efge|fdec d2z2|
f2fa gfed|cdec dcAF|f2fa gfed|cdec d4|f2fa gfed|cdec dcAF|fdec dcAF|D4D4|
f2fa gfed|cdec dcAF|f2fa gfed|cdec d4|f2fa gfed|cdec dcAF|fdec dcAF|D4D4|
`,
};
