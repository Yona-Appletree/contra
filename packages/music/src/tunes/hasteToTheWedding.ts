import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. High confidence — a very common
 * contra/session jig; the lilting AABB shape and the ascending-then-falling
 * B part are canonical.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const hasteToTheWedding: Tune = {
  slug: "haste-to-the-wedding",
  title: "Haste to the Wedding",
  type: "jig",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 124,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Haste to the Wedding
R:jig
M:6/8
L:1/8
K:D
dcd AFA|dcd fed|ecA FAd|ecA FAG|dcd AFA|dcd fed|efg fdc|dfd d2A|
dcd AFA|dcd fed|ecA FAd|ecA FAG|dcd AFA|dcd fed|efg fdc|dfd d2A|
faf agf|faf gfe|faf agf|edc dcA|faf agf|faf gfe|efg fdc|dfd d3|
faf agf|faf gfe|faf agf|edc dcA|faf agf|faf gfe|efg fdc|dfd d3|
`,
};
