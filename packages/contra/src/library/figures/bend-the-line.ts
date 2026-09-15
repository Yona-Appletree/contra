import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Bend the line** (M7): the line of four folds into a ring.
 *
 * The Nice Combination's last two beats of A2, and this milestone's own
 * gatherer test — the brief's words: *"bend the line into a circle and then
 * circle 3/4 (6 beats) into a swing (10 beats) is The Nice Combination's B1, and
 * the swing must gather from the ring's honest end."*
 *
 * ## It is the target-shape solver doing the work
 *
 * The figure itself walks nowhere: it is a line that travels zero, whose `ends`
 * say the set is now in a **ring**. The solver (Q6, `set/shape.ts`) turns the row
 * into the circle — including the half place a bend really is, the ends walking
 * forward and the middles backing up — and `settle` then puts that ring on the
 * formation's own four places, which is what stops a ring drifting a pixel every
 * time through and is what lets the swing two calls later gather honestly.
 *
 * So there is no geometry written down here at all. That is the point: "bend the
 * line" is a **shape change**, and a shape change is data now.
 */
export const bendTheLineDefinition: FigureDefinition = {
  id: "bend-the-line",
  call: "BEND THE LINE",
  describe:
    "The two ends of your line of four walk forward and the two in the middle back up, so the line bends round into a ring of four and everybody is looking at everybody else. Keep hold of the hands you have.",
  lead: 2,
  nominalBeats: 2,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      order: null,
      spacing: HOLD_SPACING_PX,
      settleBeats: 1,
      releaseBeats: 1,
      holdDrop: 8,
    },
  },
  shape: {
    kind: "lineWalk",
    order: "order",
    // Unread in any useful sense — the line goes nowhere and the ring's own
    // facings replace these — but a line has to face somewhere while it bends,
    // and where it is already facing is the honest answer.
    facing: { angle: "facingOf", role: { role: "self" }, at: "start" },
    axis: 180,
    travel: 0,
    spacing: { param: "spacing" },
    settleBeats: { param: "settleBeats" },
    handDrop: { param: "holdDrop" },
    // The hands come down as the ring opens out on to the formation's own
    // places: they are 32 px apart there and an arm is 15.
    handRelease: { param: "releaseBeats" },
    idleHands: { kind: "down" },
  },
  holds: [],
  symmetry: {
    mirror: {
      kind: "handed",
      why: "a line of four is read across the hall from one fixed side, so its mirror is the same four dancers in the reverse order — a different call, which is why a transcript writes the order out both ways",
    },
  },
  ends: { target: { shape: "ring", settle: true } },
  timing: { stretch: "distance", profile: "smooth" },
};
