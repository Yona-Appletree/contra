import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence — the modal
 * (mixolydian, flatted seventh) character and the driving repeated-note
 * hook that opens the A part are recalled clearly and are a well-known
 * fingerprint of this tune, but the note-for-note detail is my own
 * reconstruction and may differ from other printed settings, which is
 * normal for an orally-transmitted old-time tune. High confidence this is
 * genuinely the traditional, public-domain "Old Joe Clark".
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const oldJoeClark: Tune = {
  slug: "old-joe-clark",
  title: "Old Joe Clark",
  type: "reel",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 120,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Old Joe Clark
R:reel
M:2/2
L:1/8
K:AMix
A2AA cAA2|BcdB A2A2|A2AA cAA2|BcdB cAA2|e2ed cAA2|dcAG A2A2|e2ed cAA2|dcAG A2A2|
A2AA cAA2|BcdB A2A2|A2AA cAA2|BcdB cAA2|e2ed cAA2|dcAG A2A2|e2ed cAA2|dcAG A2A2|
a2ag ecAc|BcdB A2A2|a2ag ecAc|BcdB cAA2|c2cB A2A2|BAGE A2A2|c2cB A2A2|A4A4|
a2ag ecAc|BcdB A2A2|a2ag ecAc|BcdB cAA2|c2cB A2A2|BAGE A2A2|c2cB A2A2|A4A4|
`,
};
