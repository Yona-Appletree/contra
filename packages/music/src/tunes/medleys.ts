import { arkansasTraveler } from "./arkansasTraveler.js";
import { fishersHornpipe } from "./fishersHornpipe.js";
import { goldenSlippers } from "./goldenSlippers.js";
import { hasteToTheWedding } from "./hasteToTheWedding.js";
import { irishWasherwoman } from "./irishWasherwoman.js";
import { keshJig } from "./keshJig.js";
import { mississippiSawyer } from "./mississippiSawyer.js";
import { morrisonsJig } from "./morrisonsJig.js";
import { oldJoeClark } from "./oldJoeClark.js";
import { soldiersJoy } from "./soldiersJoy.js";
import { stAnnesReel } from "./stAnnesReel.js";
import { swallowtailJig } from "./swallowtailJig.js";
import type { Medley } from "./Tune.js";
import { whiskeyBeforeBreakfast } from "./whiskeyBeforeBreakfast.js";

/**
 * Several medleys, two or three tunes each, `timesThroughEach: 2` — a whole
 * number of `MUSIC_BEATS_PER_ITEM` (128 beats: two 64-beat cycles) per
 * dance, which is what keeps a tune change lined up with a dance switch
 * (`apps/web/src/program.ts`'s `MUSIC_BEATS_PER_ITEM`). T1 added five sets
 * to the two M6 shipped, so a programme no longer has to repeat the same
 * two tunes all evening — the user's own complaint ("I am so sick of
 * soldier's joy") is what this package is for.
 */

/** Two reels, twice through each — a plain reel set. */
export const reelMedley: Medley = {
  slug: "reel-set",
  tunes: [soldiersJoy, stAnnesReel],
  timesThroughEach: 2,
};

/** Two jigs, twice through each. */
export const jigMedley: Medley = {
  slug: "jig-set",
  tunes: [hasteToTheWedding, irishWasherwoman],
  timesThroughEach: 2,
};

/** Three reels, twice through each. */
export const arkansasSet: Medley = {
  slug: "arkansas-set",
  tunes: [arkansasTraveler, goldenSlippers, fishersHornpipe],
  timesThroughEach: 2,
};

/** Three reels, twice through each. */
export const mississippiSet: Medley = {
  slug: "mississippi-set",
  tunes: [mississippiSawyer, oldJoeClark, whiskeyBeforeBreakfast],
  timesThroughEach: 2,
};

/** Two jigs, twice through each. */
export const keshSet: Medley = {
  slug: "kesh-set",
  tunes: [keshJig, morrisonsJig],
  timesThroughEach: 2,
};

/** Two jigs, twice through each. */
export const swallowtailSet: Medley = {
  slug: "swallowtail-set",
  tunes: [swallowtailJig, irishWasherwoman],
  timesThroughEach: 2,
};

export const medleys: Medley[] = [
  reelMedley,
  jigMedley,
  arkansasSet,
  mississippiSet,
  keshSet,
  swallowtailSet,
];
