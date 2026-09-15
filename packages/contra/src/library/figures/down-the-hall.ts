import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureDefinition, LineWalkShape } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Down the hall four in line**, and **up the hall** again (M7).
 *
 * The Nice Combination's A2, and the figure `SetModel.shape` exists for: four
 * dancers take hands in a line **in a stated order** and walk down the hall. The
 * order is a parameter because the transcript gives one (`M1-W2-M2-W1`) and then
 * gives a different one for the way back (`W2-M1-W1-M2`), the couples having
 * turned in between.
 *
 * ## The order is read from one side of the hall
 *
 * A caller reading a line out loud reads it from where they are standing, and
 * both of The Nice Combination's orders are read the same way round — which is
 * the only way the second can be the first with each couple swapped. So the
 * order runs across the set from the `line: 1` side to the `line: 0` one
 * ({@link LineWalkShape.axis} of 180° in the group's own frame), **whichever way
 * the line is facing**. Folding the order into the facing is the mistake that
 * makes "up the hall" come out backwards; see `set/shape.ts`.
 *
 * ## How far down the hall is down the hall
 *
 * {@link DOWN_THE_HALL_PX}. Nothing in the corpus says, and the hall these
 * dancers are in is a compressed one — a couple place is 20 px — so the honest
 * number is a **pace** rather than a distance: long lines walks 9 px out in four
 * beats, so six beats down the hall is 13.5 px at the same speed. It also has to
 * be a distance a waiting couple can live with, and it is: the gap from the twos
 * of the bottom minor set to a couple waiting below them is 20 px.
 */

/**
 * How far six beats of walking down the hall carries a line, px.
 *
 * Long lines' own pace: `forwardPx: 9` over four beats is 2.25 px a beat, and
 * six beats of it is 13.5. Read off another figure rather than chosen, so that
 * a line of four and a long line move at the same speed down the same hall.
 */
export const DOWN_THE_HALL_PX = 13.5;

/** Down the hall in the group frame; the ones face this way. */
const DOWN = 90;
/** Up the hall in the group frame. */
const UP = 270;
/** The order runs from the `line: 1` side of the set to the `line: 0` side. */
const ORDER_AXIS = 180;

const lineWalk = (facing: number): LineWalkShape => ({
  kind: "lineWalk",
  order: "order",
  facing,
  axis: ORDER_AXIS,
  travel: { param: "travelPx" },
  spacing: { param: "spacing" },
  settleBeats: { param: "settleBeats" },
  handDrop: { param: "holdDrop" },
  // A line going down the hall keeps hold all the way.
  handRelease: 0,
  idleHands: { kind: "down" },
});

const defaults = {
  /** The order across the line; `null` keeps the cast's own order. */
  order: null,
  travelPx: DOWN_THE_HALL_PX,
  spacing: HOLD_SPACING_PX,
  settleBeats: 1.5,
  holdDrop: 8,
};

/** Down the hall four in line, as a figure definition. */
export const downTheHallDefinition: FigureDefinition = {
  id: "down-the-hall",
  call: "DOWN THE HALL FOUR IN LINE",
  describe:
    "Take hands in a line of four across the hall, in the order the caller gives, and walk down the hall together. The line forms as you go: nobody stands still waiting for it. You end facing down the hall, still holding on.",
  lead: 4,
  nominalBeats: 6,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults },
  shape: lineWalk(DOWN),
  holds: [],
  symmetry: {
    mirror: {
      kind: "handed",
      why: "a line of four is read across the hall from one fixed side, so its mirror is the same four dancers in the reverse order — a different call, which is why a transcript writes the order out both ways",
    },
  },
  // The line of four is a shape of the set, and the set is told so. It settles
  // on to nothing: down the hall is not a place the formation has.
  ends: { target: { shape: "line-of-four" } },
  timing: { stretch: "distance", profile: "smooth" },
};

/** Up the hall four in line, as a figure definition. */
export const upTheHallDefinition: FigureDefinition = {
  id: "up-the-hall",
  call: "UP THE HALL FOUR IN LINE",
  describe:
    "Still in your line of four, walk back up the hall the way you came. The caller gives the order again because turning as couples changed it: whoever was on one end of the line is now beside you.",
  lead: 4,
  nominalBeats: 6,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults },
  shape: lineWalk(UP),
  holds: [],
  symmetry: {
    mirror: {
      kind: "handed",
      why: "a line of four is read across the hall from one fixed side, so its mirror is the same four dancers in the reverse order — a different call, which is why a transcript writes the order out both ways",
    },
  },
  ends: { target: { shape: "line-of-four" } },
  timing: { stretch: "distance", profile: "smooth" },
};
