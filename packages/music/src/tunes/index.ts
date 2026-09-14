export type { Medley, Tune } from "./Tune.js";
export { hasteToTheWedding } from "./hasteToTheWedding.js";
export { jigMedley, medleys, reelMedley } from "./medleys.js";
export { soldiersJoy } from "./soldiersJoy.js";
export { stAnnesReel } from "./stAnnesReel.js";

import { hasteToTheWedding } from "./hasteToTheWedding.js";
import { soldiersJoy } from "./soldiersJoy.js";
import { stAnnesReel } from "./stAnnesReel.js";
import type { Tune } from "./Tune.js";

/** Every tune this package bundles. */
export const tunes: Tune[] = [soldiersJoy, stAnnesReel, hasteToTheWedding];
