import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureIR } from "../ir/Figure.js";

/**
 * **Balance** — an intrinsic (D14): the figure *is* its assembly. Facing the
 * partner with both hands joined (`two-hand`, a placeholder: the user's
 * ruling is elbows down, a tiny bit out), *"a rock forward onto the right foot
 * with a lean and arms trailing back, not a slide"*: forward on 1, back on 3,
 * a close on 4. Four beats, never squeezed.
 */
export const balance: FigureIR = {
  id: "balance",
  params: [{ name: "with", kind: "dancer" }],
  // Four beats; three when the figure before it cannot give up the beat the
  // turn-to-face and the take need — the last line is a stand, and it goes.
  beats: { nominal: 4, min: 3 },
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
    holds: [
      { hold: "two-hand", hand: "right", with: "partner" },
      { hold: "two-hand", hand: "left", with: "partner" },
    ],
  },
  post: {
    arrangement: [{ kind: "facing", who: "self", toward: "partner" }],
    holds: [
      { hold: "two-hand", hand: "right", with: "partner" },
      { hold: "two-hand", hand: "left", with: "partner" },
    ],
  },
  windows: [
    {
      kind: "intrinsic",
      lines: [
        { beat: 0, half: 0, who: "self", op: { kind: "step", forwardPx: 3 } },
        { beat: 0, half: 0, who: "self", op: { kind: "lean", deg: 8 } },
        { beat: 0, half: 0, who: "self", op: { kind: "look", at: "partner" } },
        { beat: 1, half: 0, who: "self", op: { kind: "stand" } },
        { beat: 2, half: 0, who: "self", op: { kind: "step", forwardPx: -3 } },
        { beat: 2, half: 0, who: "self", op: { kind: "lean", deg: 0 } },
        { beat: 3, half: 0, who: "self", op: { kind: "stand" } },
      ],
    },
  ],
  look: [{ role: "self", at: "partner" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
