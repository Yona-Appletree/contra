import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Petronella**, as data: let go, spin to your right, and land on the next
 * place round the ring, facing the middle.
 *
 * The third ring walk, and the one that shows why the ring is a *place*
 * arithmetic rather than a circle to ride: a petronella walks the **chord**
 * between the two places, not the arc through them. Riding the arc bulges
 * `R(1 − cos(arc / 2))` beyond the set — 8.9 px for a quarter turn of a duple
 * improper minor set, which is most of the 20 px to the next minor set, and
 * would put two adjacent sets' dancers 2.3 px apart. The chord with a small bow
 * is both what a dancer walks and what keeps the set to itself.
 *
 * It takes whoever's place is one to the dancer's own right, which is one place
 * *back* round the ring, because the ring's order runs the way a circle left
 * travels. And it takes them off the ring the dancers are standing on **right
 * now**, so a balance of the ring lands them on the ring and a petronella from
 * the stations lands them on the stations.
 */

/** How much extra skirt radius the spin throws, px. */
export const PETRONELLA_FLARE_PX = 2.6;

/** Petronella, as a figure definition. */
export const petronellaDefinition: FigureDefinition = {
  id: "petronella",
  call: "PETRONELLA TURN",
  describe:
    "Everybody turns once round to their own right while travelling one place clockwise round the set, so the four of you rotate as a ring without holding anybody. Four beats, and it almost always follows a balance of the ring. The hands come up and out as you spin — nobody is holding on.",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: { places: 1, spins: 1, bowPx: 3 } },
  shape: {
    kind: "ringWalk",
    places: { param: "places" },
    // One place to the dancer's own right is one place back round the ring.
    sign: -1,
    // Unread: a chord travel carries the body itself.
    faceOffset: 180,
    inBeats: 0,
    outBeats: 0,
    endFacing: { kind: "inward" },
    travel: {
      kind: "chord",
      bow: { param: "bowPx" },
      // The body spins the way it travels, so the sign of the turn is the sign
      // of how many places round it goes.
      spins: {
        number: "mul",
        of: [{ param: "spins" }, { number: "sign", of: { param: "places" } }],
      },
      flare: PETRONELLA_FLARE_PX,
    },
    // Nobody is holding on: the hands hang at the dancer's own sides.
    idleHands: { kind: "hanging", swing: 0 },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "cruise" },
  symmetry: {
    // Everybody turns to their own **right**, so the mirror image travels the
    // other way round the ring — which is `places` with its sign changed, and
    // the spin follows it because the spin's own sign is `sign(places)`.
    mirror: { kind: "parameters", signs: ["places"] },
    // All four dancers do the same thing a quarter turn apart, so turning the
    // whole arrangement one place round and dancing it gives the same dance
    // turned one place round. Nothing else in the library claims this.
    rotates: 1,
  },
};
