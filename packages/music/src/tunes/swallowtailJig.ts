import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. High confidence — an extremely
 * standard, simple session jig (Irish, though played constantly at contra
 * dances); the descending-then-rising AABB shape is canonical. Notated
 * here in plain E minor (aeolian) rather than the E dorian some session
 * settings use, which is the simpler and at least as common choice.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const swallowtailJig: Tune = {
  slug: "swallowtail-jig",
  title: "Swallowtail Jig",
  type: "jig",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 118,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Swallowtail Jig
R:jig
M:6/8
L:1/8
K:Em
EFG FED|EFG B3|EFG FED|EFG B3|Bcd efg|fed cBA|Bcd efg|fed E3|
EFG FED|EFG B3|EFG FED|EFG B3|Bcd efg|fed cBA|Bcd efg|fed E3|
g2f gfe|dBG B3|g2f gfe|dBG B3|efg agf|gfe dBA|efg agf|dcB E3|
g2f gfe|dBG B3|g2f gfe|dBG B3|efg agf|gfe dBA|efg agf|dcB E3|
`,
};
