import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureIR } from "../ir/Figure.js";

/**
 * A bow to your partner: the four beats a dance opens and closes with.
 *
 * An **intrinsic** (D14): a bow *is* its assembly, the way a balance is —
 * there is nothing to plan, only lines to author. Lean over the first beat,
 * hold the second, come back up over the third, stand on the fourth. Nobody
 * steps and nobody's hands are used.
 *
 * The head follows the torso down and comes back to the partner as they rise
 * (the user, 2026-09-17: *"the head matters a lot, too. where you're looking
 * in contra is really important"*).
 *
 * Beats in the lines are counted from the body's start, so beat 0 is the
 * dancer's "one".
 */
export const bow: FigureIR = {
  id: "bow",
  params: [{ name: "with", kind: "dancer" }],
  beats: { nominal: 4, min: 4 },
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
      kind: "intrinsic",
      lines: [
        { beat: 0, half: 0, who: "self", op: { kind: "stand" } },
        { beat: 0, half: 0, who: "self", op: { kind: "look", at: "partner" } },
        { beat: 0, half: 0, who: "self", op: { kind: "lean", deg: 25 } },
        { beat: 0, half: 1, who: "self", op: { kind: "look", at: "down" } },
        // Beat 1 repeats the lean rather than saying nothing: the hold at the
        // bottom of the bow is a decision, and the executor ramps to a target.
        { beat: 1, half: 0, who: "self", op: { kind: "stand" } },
        { beat: 1, half: 0, who: "self", op: { kind: "lean", deg: 25 } },
        { beat: 2, half: 0, who: "self", op: { kind: "stand" } },
        { beat: 2, half: 0, who: "self", op: { kind: "lean", deg: 0 } },
        { beat: 2, half: 0, who: "self", op: { kind: "look", at: "partner" } },
        { beat: 3, half: 0, who: "self", op: { kind: "stand" } },
      ],
    },
  ],
  look: [
    { role: "self", at: "partner", from: 0, to: 0.5 },
    { role: "self", at: "down", from: 0.5, to: 2 },
    { role: "self", at: "partner", from: 2, to: 4 },
  ],
  elide: "stretch",
  casts: { partner: "stand" },
};
