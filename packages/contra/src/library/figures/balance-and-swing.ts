import type { FigureDefinition } from "../FigureDefinition.js";
import { PAIR_ROCK, twoHandRock } from "./balance.js";
import { SWING_HOLD, SWING_ORBIT } from "./swing.js";

/**
 * **Balance and swing**, as data: one call, and one figure.
 *
 * The user, who calls these: "that's really one move, most of the time. very
 * occasionally does a caller call 'balance your partner' and then 2 beats later
 * 'swing your partner.' its almost always 'balance and swing your partner'."
 *
 * Dancing it as two figures is what put the seam in the middle of it, and the
 * seam is what the arms disappeared into. Here it is a `sequence` of the two
 * shapes the other definitions in this directory already are — the same
 * `PAIR_ROCK` and the same `SWING_ORBIT`, named rather than restated — and the
 * sequence kind does the threading: the rock's ends are the turn's start, the
 * hold both parts declare (the lark's left in the robin's right) is never let
 * go, and the other two hands travel from the rock's second hold to the back
 * and the shoulder rather than dropping to the hip and coming back up.
 *
 * Its roles are `lark` and `robin`, not `a` and `b`, because the turn half is
 * a swing and a swing really is asymmetric. Only the last part gathers: the
 * rock ends where it rocked, and the swing is what settles the pair home.
 */
export const balanceAndSwingDefinition: FigureDefinition = {
  id: "balance-and-swing",
  call: "BALANCE AND SWING",
  describe:
    "Take both hands with the dancer you are facing, step in toward them and back — that is the balance, four beats — and then, without letting go of the hand you are already holding, close into a ballroom hold and buzz round for the rest of the phrase, opening out side by side with the lark on the left and the robin on the right. It is one call and one move: the balance is how you get into the swing, and nobody lets go in between.",
  lead: 4,
  nominalBeats: 16,
  roles: ["lark", "robin"],
  actors: "pairs",
  anchor: "meet",
  params: {
    kind: "canonical",
    defaults: {
      pairs: "neighbors",
      balanceBeats: 4,
      rock: 1.0,
      holdDrop: 5,
      stackPx: 1,
      turns: 2,
      handOffset: 5,
      endFacing: "across",
    },
  },
  shape: {
    kind: "sequence",
    parts: [
      { beats: { param: "balanceBeats" }, shape: PAIR_ROCK, holds: twoHandRock("lark", "robin") },
      { beats: "rest", shape: SWING_ORBIT, holds: [SWING_HOLD] },
    ],
  },
  // Declared for the reader and for anything that asks what the figure holds;
  // each part's own list is what the interpreter runs.
  holds: [...twoHandRock("lark", "robin"), SWING_HOLD],
  ends: "home",
  timing: { stretch: "pace", profile: "trapezoid" },
  symmetry: {
    mirror: {
      kind: "handed",
      why: "it ends in a swing, and a swing's ballroom hold is handed.",
    },
  },
};
