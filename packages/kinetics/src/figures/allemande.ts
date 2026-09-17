import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureIR } from "../ir/Figure.js";

/**
 * An allemande: take one hand and turn each other round the joined hands.
 *
 * The hold is the user's: right hands, palm to palm, thumbs up, and *"elbow
 * down, a tiny bit out"* — the posture itself lives with the `allemande-R`
 * and `allemande-L` holds, not here; this figure only names them.
 *
 * The body is an orbit of the **hands** rather than of the midpoint, with the
 * facing tangent to the arc: you turn as you travel, so your partner stays in
 * front of you the whole way round. The counterpart is on the side of the hand
 * you took, which is why `sense` and the hold both read the `hand` parameter.
 *
 * `post` frees both hands (D13: the exit releases). A figure that wants the
 * hold carried says so in its own `pre`, and the scheduler's seam then costs
 * nothing.
 */
export const allemande: FigureIR = {
  id: "allemande",
  params: [
    { name: "with", kind: "dancer" },
    { name: "hand", kind: "enum", choices: ["right", "left"] },
    { name: "amount", kind: "number", default: 1 },
    { name: "beats", kind: "number", default: 8 },
  ],
  beats: { nominal: 8, min: 4 },
  pre: {
    arrangement: [{ kind: "facing", who: "self", toward: "partner" }],
    holds: [
      {
        hold: { param: "hand", cases: { right: "allemande-R", left: "allemande-L" } },
        hand: { param: "hand" },
        with: "partner",
      },
    ],
  },
  post: {
    arrangement: [
      { kind: "facing", who: "self", toward: "partner" },
      {
        kind: "apart",
        who: "self",
        from: "partner",
        minPx: HOLD_SPACING_PX,
        maxPx: HOLD_SPACING_PX,
      },
    ],
    holds: [],
  },
  windows: [
    {
      kind: "orbit",
      axis: "hands",
      turns: { param: "amount" },
      sense: { param: "hand", cases: { right: "partner-on-right", left: "partner-on-left" } },
      facing: "tangent",
      // Half the hold's spacing: the joined hands are midway between the two.
      radiusPx: HOLD_SPACING_PX / 2,
      // A full turn of the body per orbit, so a quarter turn per beat is as
      // fast as an allemande may be walked.
      rateMaxTurnsPerBeat: 0.25,
    },
  ],
  look: [{ role: "self", at: "partner" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
