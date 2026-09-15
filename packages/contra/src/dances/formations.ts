import type { Formation } from "@caller/choreo";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { PROPER } from "../formation/proper.js";

/**
 * Every contra formation a dance file may name, by id.
 *
 * A dance file on disk names its formation by string (JSON has no way to hold
 * the object `contraDance` actually wants); this is the one place that string
 * is turned back into the real thing, so a typo in a dance file is a load-time
 * error naming the id rather than a formation silently defaulting.
 */
export const CONTRA_FORMATIONS: Record<string, Formation> = {
  [DUPLE_IMPROPER.id]: DUPLE_IMPROPER,
  [BECKET.id]: BECKET,
  [PROPER.id]: PROPER,
};

/** The formation a dance's `formation` id names. */
export function formationById(id: string): Formation {
  const formation = CONTRA_FORMATIONS[id];
  if (!formation) throw new Error(`no contra formation with id "${id}"`);
  return formation;
}
