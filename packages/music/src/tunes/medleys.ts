import { hasteToTheWedding } from "./hasteToTheWedding.js";
import { soldiersJoy } from "./soldiersJoy.js";
import { stAnnesReel } from "./stAnnesReel.js";
import type { Medley } from "./Tune.js";

/** Two reels, twice through each — a plain reel set. */
export const reelMedley: Medley = {
  slug: "reel-set",
  tunes: [soldiersJoy, stAnnesReel],
  timesThroughEach: 2,
};

/** One jig, twice through, for a dance that wants a jig throughout. */
export const jigMedley: Medley = {
  slug: "jig-set",
  tunes: [hasteToTheWedding],
  timesThroughEach: 2,
};

export const medleys: Medley[] = [reelMedley, jigMedley];
