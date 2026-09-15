import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureDefinition } from "../FigureDefinition.js";

/**
 * **Turn as couples** (M7): the pair turns *with* each other, not *about* each
 * other.
 *
 * The Nice Combination's two beats between going down the hall and coming back
 * up it, and the acceptance case for a **unit actor** — two dancers as one body
 * with its own orientation (`vision.md` §"Resolution"). The difference from an
 * allemande is the one a dancer feels: an allemande swaps your two places, a
 * turn as couples keeps you side by side a hold apart and simply leaves the pair
 * of you pointing the other way.
 *
 * It is written on **pairs** rather than on couples because in a line of four
 * the pairs are whoever is beside you — in The Nice Combination they are
 * neighbours, not partners — and a unit has no opinion about which of its two
 * dancers is which.
 */
export const turnAsCouplesDefinition: FigureDefinition = {
  id: "turn-as-couples",
  call: "TURN AS COUPLES",
  describe:
    "Keep hold of the dancer beside you and turn the two of you round together, as one body, so that you end side by side facing back the way you came. Nobody walks round anybody: you turn together about the point between you.",
  lead: 2,
  nominalBeats: 2,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  params: {
    kind: "canonical",
    defaults: {
      pairs: "neighbors",
      /** Degrees the unit turns; half a turn is what "turn as couples" means. */
      turn: 180,
      spacing: HOLD_SPACING_PX,
      holdDrop: 8,
    },
  },
  shape: {
    kind: "unit",
    turn: { param: "turn" },
    travel: 0,
    along: 0,
    spacing: { param: "spacing" },
    handDrop: { param: "holdDrop" },
    idleHands: { kind: "down" },
  },
  holds: [],
  ends: "relative",
  // A fixed-angle turn: more beats buy a gentler turn, not a bigger one.
  timing: { stretch: "pace", profile: "smooth" },
};
