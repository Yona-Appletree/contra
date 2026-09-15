import { BUZZ_STEPS_PER_BEAT, SHOULDER_WIDTH_PX } from "@caller/core";
import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import {
  BACK_HAND_DROP_PX,
  BACK_HAND_FORWARD_PX,
  BACK_HAND_RIGHT_PX,
  SHOULDER_HAND_INSET_PX,
  SWING_BODY_TURN_DEG,
  SWING_FLARE_PX,
  SWING_HAND_DROP_PX,
  SWING_LATERAL_PX,
  SWING_LEAN_PX,
  SWING_RADIUS_PX,
} from "../../pair/swing.js";
import type { FigureDefinition, OrbitPairShape } from "../FigureDefinition.js";

/**
 * **Swing**, as data: take a ballroom hold, buzz round, and open out with the
 * robin on the right of the lark, facing `endFacing`.
 *
 * The turn, the buzz step, the hold, the lean and the flare are M5's, whose
 * numbers came from the two-dancers spike and gate 3 — this file names them
 * rather than restating them, and DD21 protects the geometry as a golden
 * (`compareFigures`, 0.01 px and 0.1° from the stations).
 *
 * What is new is the **end**. The coded swing opened out `endHalf` px either
 * side of wherever the pair happened to meet, with `endHalf` guessed from the
 * nearest pair of stations square across the way it was facing — which is why
 * Butter needed `endHalf: 10` written into the dance record to stop a diagonal
 * hey throwing the guess off. Here the swing is a **gatherer**: it settles on to
 * the formation's own places for the two dancers dancing it, and `endFacing`
 * stays the caller's word for which way "out" is. That is what makes "balance
 * and swing your neighbour" *be* the progression rather than merely end near
 * it, and it is what removes the override (AC2).
 */

/** The orbit `swing` and the swing half of `balance-and-swing` both dance. */
export const SWING_ORBIT: OrbitPairShape = {
  kind: "orbitPair",
  // A ballroom hold locks the two together: one axis through the pair, a dancer
  // on each end of it, both offset to their own right — which is what puts
  // right hips together.
  radial: "pair",
  axisRole: "robin",
  radius: SWING_RADIUS_PX,
  lateral: SWING_LATERAL_PX,
  // Two pairs of a minor set swing at once and their centres are one place
  // pitch apart, which is 20 px; two dancers orbiting at full radius from
  // centres that far apart pass 7.86 px from each other, just inside AC6's
  // 8 px. So a pair with another pair close by takes a slightly tighter hold.
  clearance: CLEARANCE_PX,
  squeeze: "orbit",
  // Rounded so the pair opens straight out on to its places: `turns` is "how
  // many times round to the nearest half turn", which is what a swing is.
  // Without the rounding a pair can open out *through* each other, and a probe
  // catches them 3.3 px apart.
  turn: { amount: { param: "turns" }, sign: 1, round: "open" },
  profile: { a0: 0, a1: 1.2, b0: { fromEnd: 1.6 }, b1: { fromEnd: 0.3 } },
  inBeats: 1,
  outBeats: 1.4,
  body: [
    // Into the hold: face along the line of the turn, then turn 30° out of it
    // as the hold is taken, which is what makes a swing spin instead of shuffle.
    { to: { orbit: 0 }, from: 0, until: 1, turnOut: -SWING_BODY_TURN_DEG },
    { to: { end: true }, from: { fromEnd: 1.4 }, until: { fromEnd: 0 } },
  ],
  look: "other",
  ends: { kind: "square", facing: { param: "endFacing" } },
  // The other two hands are on the partner's back and shoulder: two points,
  // never one, because they are not joined.
  contact: [
    {
      role: "lark",
      side: "R",
      on: "robin",
      forward: BACK_HAND_FORWARD_PX,
      right: BACK_HAND_RIGHT_PX,
      drop: BACK_HAND_DROP_PX,
    },
    {
      role: "robin",
      side: "L",
      on: "lark",
      forward: 0,
      right: SHOULDER_WIDTH_PX / 2 - SHOULDER_HAND_INSET_PX,
      drop: 0,
    },
  ],
  motion: {
    stepRate: BUZZ_STEPS_PER_BEAT,
    lean: SWING_LEAN_PX,
    flare: SWING_FLARE_PX,
    feet: true,
  },
};

/** The lark's left in the robin's right, out to the side: the swing's one join. */
export const SWING_HOLD = {
  kind: "pair",
  a: "lark",
  aSide: "L",
  b: "robin",
  bSide: "R",
  point: { kind: "shoulders", inset: { param: "handOffset" } },
  drop: SWING_HAND_DROP_PX,
  stackPx: 0,
  window: { kind: "orbit" },
} as const;

/** Swing, as a figure definition. */
export const swingDefinition: FigureDefinition = {
  id: "swing",
  call: "SWING",
  describe:
    "Ballroom hold: right hips together, the lark's right hand on the robin's back, her left on his shoulder, his left and her right joined out to the side. Buzz step round each other — one foot pushing, the other pivoting — for as many turns as the music gives, then open out side by side, lark on the left and robin on the right, facing whichever way the next figure needs. Both of them keep their weight on the inside foot and lean a little away from each other, which is what makes a swing spin instead of shuffle.",
  lead: 4,
  nominalBeats: 8,
  roles: ["lark", "robin"],
  actors: "pairs",
  anchor: "meet",
  params: {
    kind: "canonical",
    defaults: { pairs: "neighbors", turns: 2, handOffset: 5, endFacing: "across" },
  },
  shape: SWING_ORBIT,
  holds: [SWING_HOLD],
  symmetry: {
    mirror: {
      kind: "handed",
      why:
        "a swing's ballroom hold puts the robin on the lark's right and the pair turns one way " +
        "round; its mirror image is a figure nobody dances.",
    },
  },
  ends: "home",
  timing: { stretch: "pace", profile: "trapezoid" },
};
