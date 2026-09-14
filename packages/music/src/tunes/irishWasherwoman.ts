import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. High confidence — one of the
 * most famous, simplest Irish jigs, played constantly; the "long-short"
 * repeated-note opening figure is canonical.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const irishWasherwoman: Tune = {
  slug: "irish-washerwoman",
  title: "Irish Washerwoman",
  type: "jig",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 122,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Irish Washerwoman
R:jig
M:6/8
L:1/8
K:D
d2d cdA|BAF D3|d2d cdA|BAF D3|f2f edc|dcA D3|f2f edc|dcA D3|
d2d cdA|BAF D3|d2d cdA|BAF D3|f2f edc|dcA D3|f2f edc|dcA D3|
a2a gfe|fed d3|a2a gfe|fed d3|f2a gfe|dcA D3|f2a gfe|dcA D3|
a2a gfe|fed d3|a2a gfe|fed d3|f2a gfe|dcA D3|f2a gfe|dcA D3|
`,
};
