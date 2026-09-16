import type { Dance, Formation } from "@caller/choreo";
import { BECKET } from "../formation/becket.js";
import { BECKET_RIGHT } from "../formation/becketRight.js";
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
  // A right-progressing becket (FR-C2): Are You 'Most Done? is one — its hey is
  // "on right diagonal" and its author's note says the dance begins with the
  // same neighbours, which only holds if you progress toward your right.
  [BECKET_RIGHT.id]: BECKET_RIGHT,
  [PROPER.id]: PROPER,
};

/** The formation a dance's `formation` id names. */
export function formationById(id: string): Formation {
  const formation = CONTRA_FORMATIONS[id];
  if (!formation) throw new Error(`no contra formation with id "${id}"`);
  return formation;
}

/**
 * Whether this dance is danced in becket, of either handedness.
 *
 * `becket` and `becket-right` differ only in which way their lines slide
 * (FR-C2), so everything that asks "is this a becket dance?" — the line lengths
 * the oracles check, the hall the traces draw, the motion report's second row —
 * means both.
 */
export const isBecket = (dance: Dance): boolean =>
  dance.formation === BECKET.id || dance.formation === BECKET_RIGHT.id;
