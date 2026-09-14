import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. High confidence — an extremely
 * standard, gentle session jig in G major; the rising-and-falling AABB
 * shape is canonical.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const keshJig: Tune = {
  slug: "kesh-jig",
  title: "The Kesh Jig",
  type: "jig",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 116,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:The Kesh Jig
R:jig
M:6/8
L:1/8
K:G
D2D GAB|c2A BGE|D2D GAB|c2A G3|B2G FGA|BAG FED|B2G FGA|BAG G3|
D2D GAB|c2A BGE|D2D GAB|c2A G3|B2G FGA|BAG FED|B2G FGA|BAG G3|
d2B c2A|BGA G3|d2B c2A|BGA G3|g2e dBG|ABc BGE|g2e dBG|ABc G3|
d2B c2A|BGA G3|d2B c2A|BGA G3|g2e dBG|ABc BGE|g2e dBG|ABc G3|
`,
};
