import type { Tune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate confidence on the
 * exact notes — the tune's characteristic low-register "sawing" repeated
 * figure in the A part is recalled clearly, but the detail below is my
 * own hand transcription and may differ from other printed settings.
 *
 * Written out in full (AABB, 32 bars), four source lines of 8 bars each —
 * see the note in `soldiersJoy.ts` and `packages/music/README.md`.
 */
export const mississippiSawyer: Tune = {
  slug: "mississippi-sawyer",
  title: "Mississippi Sawyer",
  type: "reel",
  meter: { beatsPerBar: 2, barsPerPhrase: 8 },
  beatsPerCycle: 64,
  defaultBpm: 120,
  source: "traditional, transcribed by hand",
  abc: `X:1
T:Mississippi Sawyer
R:reel
M:2/2
L:1/8
K:D
A2AG FGAB|AFAG FDD2|A2AG FGAB|AFAG FDD2|d2AF GFED|FGAB AFD2|d2AF GFED|FGAB AFD2|
A2AG FGAB|AFAG FDD2|A2AG FGAB|AFAG FDD2|d2AF GFED|FGAB AFD2|d2AF GFED|FGAB AFD2|
d2df edcA|BAFA GFD2|d2df edcA|BAFA GFD2|f2fe dcAF|GABc dAFD|f2fe dcAF|GABc dAD2|
d2df edcA|BAFA GFD2|d2df edcA|BAFA GFD2|f2fe dcAF|GABc dAFD|f2fe dcAF|GABc dAD2|
`,
};
