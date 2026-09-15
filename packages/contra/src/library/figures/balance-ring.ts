import { CLOSE_BEATS, HAND_RISE_PX, OPEN_BEATS, TAKE_TO } from "./balance.js";
import type { FigureDefinition } from "../FigureDefinition.js";

/**
 * **Balance the ring**, as data: the same rock, with the hands joined all the
 * way round and the rock along the radius.
 *
 * Its own definition rather than a parameter of `balance`, because a ring is a
 * different shape: four dancers on one circle, everybody's hands joined to the
 * dancer on each side, and an anchor at the centroid rather than between a
 * pair. `balance`'s `hold` parameter picks which hands a *pair* joins; it does
 * not turn a pair into a ring.
 *
 * It **opens back out**, which `balance` does not: "balance the ring and
 * petronella" puts a dancer on the next *place of the set*, not on the next
 * place of the closed-up ring, and a dance that ends on a ring figure has to be
 * back on its places for the progression to land. So it is a gatherer, and its
 * honest end is the formation's own place rather than the spot it happened to
 * start the rock from.
 */

/** Balance the ring, as a figure definition. */
export const balanceRingDefinition: FigureDefinition = {
  id: "balance-ring",
  call: "BALANCE THE RING",
  describe:
    "All four join hands in a ring. Balance in toward the middle for two beats and back out for two, hands held all the way round. The ring opens back out to the places it started from, because what usually follows — a petronella, a pass through — is measured off the set's own places and not off the closed-up ring.",
  lead: 4,
  nominalBeats: 4,
  roles: ["a", "b", "c", "d"],
  actors: "ring",
  anchor: "centroid",
  params: {
    kind: "canonical",
    defaults: {
      rock: 1.0,
      hold: "ring",
      hand: "R",
      pairs: "neighbors",
      holdDrop: 6,
      stackPx: 1,
      openOut: true,
    },
  },
  shape: {
    kind: "rock",
    close: "ring",
    rock: { param: "rock" },
    closeBeats: CLOSE_BEATS,
    openBeats: OPEN_BEATS,
    openOut: { param: "openOut" },
  },
  holds: [
    {
      kind: "ring",
      drop: { param: "holdDrop" },
      stackPx: { param: "stackPx" },
      riseGain: HAND_RISE_PX,
      window: {
        kind: "holdWindow",
        take: TAKE_TO,
        release: { number: "select", on: "openOut", cases: { true: OPEN_BEATS, false: 0 } },
      },
    },
  ],
  // A ring that opens back out is a gatherer: it settles on to the set's own
  // places, which is where the petronella or the pass through that follows
  // measures itself from.
  ends: "home",
  timing: { stretch: "pace", profile: "smooth" },
};
