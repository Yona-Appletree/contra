import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureDefinition, LineWalkShape } from "../FigureDefinition.js";

/**
 * **Lead down the centre**, and **lead up** again (M7).
 *
 * Chorus Jig's A2: the ones take inside hands, close up into the middle of the
 * set and walk down it; four beats later they turn alone, and four after that
 * they lead back up. It is a line of **two** rather than of four, which is the
 * whole argument for `lineWalk` being a shape kind and not a figure: "a line
 * with an order, travelling" does not care how many are in it.
 *
 * Leading down puts the couple on the set's own midline because that is where
 * their centroid already is — a couple standing across the set from each other
 * straddles the middle — so the figure does not have to know where the middle
 * of a set is. Leading back up is a gatherer: it settles the two of them on the
 * formation's own places, which is where the cast off that follows starts from.
 *
 * Four beats at long lines' walking pace is nine pixels, which is
 * {@link LEAD_PX}.
 */

/** How far four beats of leading carries a couple, px: long lines' own pace. */
export const LEAD_PX = 9;

/** A lead's own count, which is what its hand windows are written against. */
const LEAD_BEATS = 4;

/** Down the hall in the group frame. */
const DOWN = 90;
/** Up the hall in the group frame. */
const UP = 270;

const lineWalk = (facing: number): LineWalkShape => ({
  kind: "lineWalk",
  order: "order",
  facing,
  // Across the set, from the `line: 1` side: the same reading as a line of four.
  axis: 180,
  travel: { param: "travelPx" },
  spacing: { param: "spacing" },
  settleBeats: { param: "settleBeats" },
  handDrop: { param: "holdDrop" },
  handRelease: { param: "releaseBeats" },
  idleHands: { kind: "down" },
});

const defaults = {
  pairs: "partners",
  order: null,
  travelPx: LEAD_PX,
  spacing: HOLD_SPACING_PX,
  settleBeats: 1,
  releaseBeats: 0,
  holdDrop: 8,
};

/** Lead down the centre, as a figure definition. */
export const leadDownDefinition: FigureDefinition = {
  id: "lead-down",
  call: "LEAD DOWN THE CENTRE",
  describe:
    "Take the inside hand of the dancer across from you, come together into the middle of the set, and walk down it side by side. You end facing down the hall, still holding on.",
  lead: 4,
  nominalBeats: 4,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  params: { kind: "canonical", defaults },
  shape: lineWalk(DOWN),
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};

/** Lead up the centre, as a figure definition. */
export const leadUpDefinition: FigureDefinition = {
  id: "lead-up",
  call: "LEAD UP THE CENTRE",
  describe:
    "Walk back up the middle of the set together and step apart into your own two places, ready for whatever comes next.",
  lead: 4,
  nominalBeats: 4,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  // **Leading up lets go at the end and leading down does not.** The two places
  // a couple settles on to are the set's own, 32 px apart across it, and an arm
  // is 15: a pair still holding hands as they step apart is a reach the oracle
  // refuses — measured at 7.94 px short before this said so — and it is also
  // what dancers do, because the cast off that follows needs both hands free.
  params: {
    kind: "canonical",
    defaults: { ...defaults, releaseBeats: LEAD_BEATS - defaults.settleBeats },
  },
  shape: lineWalk(UP),
  holds: [],
  ends: "home",
  timing: { stretch: "distance", profile: "smooth" },
};
