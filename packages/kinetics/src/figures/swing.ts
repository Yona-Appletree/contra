import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureIR } from "../ir/Figure.js";

/**
 * **Swing** — the elastic body. A ballroom hold (a placeholder until the
 * gallery; the user's ruling is the ballroom hold with the robin's torso
 * turned a little in), a buzz step, and as many turns as the beats allow
 * (`turns: "free"`), chosen so the couple comes out **beside each other
 * facing home, the lark on the left** — that is the swing's `post`, and the
 * scheduler picks the number of turns from it and from the rate bounds.
 * Clockwise seen from above, facing the partner throughout. This is the
 * canonical negotiated exit: *"swing, adjusting speed so we'll have to get out
 * of the swing"*.
 */
export const swing: FigureIR = {
  id: "swing",
  params: [
    { name: "with", kind: "dancer" },
    { name: "beats", kind: "number", default: 8 },
  ],
  beats: { nominal: 8, min: 4 },
  pre: {
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
    holds: [{ hold: "ballroom", hand: "right", with: "partner" }],
  },
  post: {
    arrangement: [
      { kind: "facing", who: "self", toward: "home" },
      // Out to the line's own spacing, a dancer place apart.
      {
        kind: "beside",
        who: "self",
        of: "partner",
        side: "as-couple",
        spacingPx: 20,
        facing: "same",
        centre: "left-seat",
      },
    ],
    holds: [],
  },
  windows: [
    {
      kind: "orbit",
      axis: "midpoint",
      turns: "free",
      sense: "partner-on-right",
      facing: "partner",
      radiusPx: HOLD_SPACING_PX / 2,
      // A buzz swing goes round about once every two beats — but the
      // assembly has one step a beat tonight (a half turn a beat is a 55 cm
      // step and a 180° pivot), so this is a **walking swing**, a quarter turn
      // a beat, until the buzz's half-beat steps land. A G1 note.
      rateMaxTurnsPerBeat: 0.25,
      rateMinTurnsPerBeat: 0.15,
      buzz: true,
    },
  ],
  look: [{ role: "self", at: "partner" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
