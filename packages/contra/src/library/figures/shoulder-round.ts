import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import { TURN_RADIUS_PX } from "../../pair/allemande.js";
import type { FigureDefinition, NumberExpr } from "../FigureDefinition.js";

/**
 * **Shoulder round** (a gyre), as data: walk round each other keeping the named
 * shoulder between you, and keep looking at each other the whole way.
 *
 * The allemande's shape with the hands taken away, which is exactly what a
 * caller teaches it as: two dancers each on their own radius about the point
 * between them, walking forward, bodies turned to face each other. What the
 * hand was doing — giving the pair something to pull against, so they lean into
 * the turn — it is not doing here, so the inward lean is gone and the body is
 * simply on the other dancer from the first beat to the last.
 *
 * `hand` is which **shoulder** rather than which hand: a *right* shoulder round
 * keeps each dancer's right shoulder toward the other and so goes the way an
 * allemande right goes. There is nothing to hold, so nothing is declared.
 *
 * (unsure: The Caller's Box writes both "do-si-do" and "right shoulder round",
 * and some callers use the second as another name for the first. This library
 * reads them as two figures and dances the difference — a do-si-do keeps its
 * bodies square and only the head follows (`figures/do-si-do.ts`), and a
 * shoulder round turns the whole body — because the corpus writes both words in
 * the same dances. G2 should settle it.)
 */

/** Which way round: the right shoulder turns the way an allemande right does. */
const SPIN: NumberExpr = { number: "select", on: "hand", cases: { L: -1, R: 1 } };

/** Shoulder round, as a figure definition. */
export const shoulderRoundDefinition: FigureDefinition = {
  id: "shoulder-round",
  call: "RIGHT SHOULDER ROUND",
  describe:
    "Walk forward round each other keeping the named shoulder toward the other one, and keep looking at each other all the way round — nobody takes hands. Once round brings you back where you started; a half leaves you on each other's places; once and a half takes you round and past. (unsure: some callers use this name for a plain do-si-do, where the bodies stay square and only the head follows.)",
  lead: 4,
  nominalBeats: 8,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  params: {
    kind: "canonical",
    defaults: { pairs: "neighbors", hand: "R", amount: 1 },
  },
  shape: {
    kind: "orbitPair",
    radial: "each",
    radius: TURN_RADIUS_PX,
    lateral: 0,
    // Two pairs go round at once in a minor set, and their circles have to clear
    // each other exactly as two allemandes do.
    clearance: CLEARANCE_PX,
    squeeze: "radius",
    // Once round means once round: a shoulder round is not rounded on to its
    // ends any more than an allemande is.
    turn: { amount: { param: "amount" }, sign: SPIN, round: "none" },
    profile: { a0: 0.8, a1: 1.8, b0: { fromEnd: 1.6 }, b1: { fromEnd: 0.6 } },
    inBeats: 1.3,
    outBeats: 1.1,
    // One stage, not the allemande's three: with no hand joined there is nothing
    // to lean against, so the body goes on to the other dancer and stays there.
    body: [{ to: { orbit: 180 }, from: 0.1, until: 0.9 }],
    look: "other",
    ends: { kind: "turned" },
    contact: [],
    motion: null,
  },
  holds: [],
  ends: "home",
  // A turn: extra beats buy **pace**, not distance. On the Prowl asks for a half
  // in three beats and A Rare Bird for a whole one in six, and both are the same
  // amount of turning at different speeds (D3).
  timing: { stretch: "pace", profile: "trapezoid" },
  // A left shoulder round is a right shoulder round in a mirror: the shoulder
  // decides which way round the pair goes and nothing else does.
  symmetry: { mirror: { kind: "parameters", hands: ["hand"] } },
};
