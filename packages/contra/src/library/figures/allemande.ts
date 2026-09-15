import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import { TURN_RADIUS_PX } from "../../pair/allemande.js";
import type { FigureDefinition, NumberExpr } from "../FigureDefinition.js";

/**
 * **Allemande**, as data: give one hand in the middle and walk round it.
 *
 * The same `orbitPair` shape a swing dances, dressed differently — two dancers
 * each on their own radius rather than locked together on one axis, one hand
 * joined at the centre rather than a ballroom hold, no buzz step, and a body
 * that turns in three stages (on to the partner, into the turn with its inward
 * lean so the arm has something to pull against, then back on to the partner to
 * finish). All three numbers are gate 3's.
 *
 * Its roles are `a` and `b` rather than `lark` and `robin` because "larks
 * allemande left" pairs two dancers of the **same** role: an allemande has no
 * opinion about which of the two is which beyond the order the call named them
 * in. The two dancers the pairing left out dance hold-place.
 */

/** Which way round: a left hand turns anticlockwise, a right hand clockwise. */
const SPIN: NumberExpr = { number: "select", on: "hand", cases: { L: -1, R: 1 } };

/** Allemande, as a figure definition. */
export const allemandeDefinition: FigureDefinition = {
  id: "allemande",
  call: "ALLEMANDE",
  describe:
    "Join the named hands — forearms up, palms together, elbows bent — and walk forward round each other, keeping the joined hands over the one spot between you. Once round for a plain allemande; once and a half where the dance wants you to change sides. Look at each other the whole way, and the free hand stays down at your side.",
  lead: 4,
  nominalBeats: 8,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  params: {
    kind: "canonical",
    defaults: { pairs: "neighbors", hand: "L", amount: 1, inward: 45, holdDrop: 2 },
  },
  shape: {
    kind: "orbitPair",
    radial: "each",
    radius: TURN_RADIUS_PX,
    lateral: 0,
    // The turning radius is M5's unless the pair beside them is close enough
    // that it would not fit, in which case they turn tighter.
    clearance: CLEARANCE_PX,
    squeeze: "radius",
    turn: { amount: { param: "amount" }, sign: SPIN, round: "none" },
    profile: { a0: 0.8, a1: 1.8, b0: { fromEnd: 1.6 }, b1: { fromEnd: 0.6 } },
    inBeats: 1.3,
    outBeats: 1.1,
    body: [
      { to: { orbit: 180 }, from: 0.1, until: 0.9 },
      {
        to: {
          orbit: { number: "mul", of: [SPIN, { number: "sum", of: [90, { param: "inward" }] }] },
        },
        from: 0.9,
        until: 1.9,
      },
      { to: { orbit: 180 }, from: { fromEnd: 1.2 }, until: { fromEnd: 0.2 } },
    ],
    look: "anchor",
    ends: { kind: "turned" },
    contact: [],
    motion: null,
  },
  holds: [
    {
      kind: "pair",
      a: "a",
      aSide: { param: "hand" },
      b: "b",
      bSide: { param: "hand" },
      point: { kind: "anchor" },
      drop: { param: "holdDrop" },
      stackPx: 0,
      window: {
        kind: "ramps",
        takeFrom: 0.4,
        takeTo: 1.3,
        releaseFrom: { fromEnd: 0.9 },
        releaseTo: { fromEnd: 0.1 },
      },
    },
  ],
  ends: "home",
  timing: { stretch: "pace", profile: "trapezoid" },
};
