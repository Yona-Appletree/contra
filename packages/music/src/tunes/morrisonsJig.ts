import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence on the
 * exact notes — the tune's minor-key, drone-like opening (holding on the
 * low tonic before stepping up) is recalled clearly, but the detail
 * below is my own hand transcription and may differ from other printed
 * settings, which is normal for an orally-transmitted session tune.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const morrisonsJig: Tune = {
  slug: "morrisons-jig",
  title: "Morrison's Jig",
  type: "jig",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 120,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Morrison's Jig
R:jig
M:6/8
L:1/8
K:Em
E2B BAB|dBA E3|E2B BAB|dBA E3|e2f gfe|dBA E3|e2f gfe|dBA E3|
E2B BAB|dBA E3|E2B BAB|dBA E3|e2f gfe|dBA E3|e2f gfe|dBA E3|
g2f gfe|dBG E3|g2f gfe|dBG E3|B2d edB|AFD E3|B2d edB|AFD E3|
g2f gfe|dBG E3|g2f gfe|dBG E3|B2d edB|AFD E3|B2d edB|AFD E3|
`,
};
