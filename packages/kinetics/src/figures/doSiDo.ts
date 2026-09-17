import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureIR } from "../ir/Figure.js";

/**
 * A do-si-do: pass right shoulders, round behind each other, back to place.
 *
 * Written as one orbit of the **midpoint** with the facing held fixed — the
 * dancers keep facing where they started and travel sideways and backwards
 * round the circle, which is what makes a do-si-do a do-si-do rather than a
 * shoulder round (the user on the shoulder round, by contrast: *"two people
 * orbiting by the right shoulder looking at each other"*, which is the same
 * orbit with `facing: "tangent"` and a smaller radius).
 *
 * `sense: "partner-on-right"` is the right-shoulder pass: each dancer moves to
 * their own left first, so the counterpart goes by on the right.
 *
 * The look is the partner for as long as the neck can hold it and ahead when
 * it cannot — the user's rule for the do-si-do, *"partner, held as long as the
 * neck's range allows, then ahead, then partner again as they come back into
 * range"*. The rule is written here; the range is enforced by the solver.
 *
 * The radius is half the 20 px the pair stands at, so the two keep the spacing
 * their `pre` gave them all the way round.
 */
export const doSiDo: FigureIR = {
  id: "do-si-do",
  params: [{ name: "with", kind: "dancer" }],
  beats: { nominal: 8, min: 6 },
  pre: {
    arrangement: [
      { kind: "facing", who: "self", toward: "partner" },
      { kind: "apart", who: "self", from: "partner", minPx: HOLD_SPACING_PX, maxPx: 24 },
    ],
    holds: [],
  },
  post: {
    arrangement: [
      { kind: "facing", who: "self", toward: "partner" },
      { kind: "apart", who: "self", from: "partner", minPx: HOLD_SPACING_PX, maxPx: 24 },
    ],
    holds: [],
  },
  windows: [
    {
      kind: "orbit",
      axis: "midpoint",
      turns: 1,
      sense: "partner-on-right",
      facing: "fixed",
      radiusPx: 10,
      // With the facing fixed this caps how fast the bodies travel round, not
      // how fast they turn: a quarter turn per beat is a 56 cm step here.
      rateMaxTurnsPerBeat: 0.25,
    },
  ],
  look: [{ role: "self", at: "partner", elseAt: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
