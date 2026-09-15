import { SHOULDER_WIDTH_PX } from "@caller/core";
import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import type { FigureDefinition, NumberExpr } from "../FigureDefinition.js";

/**
 * **Shoulder round** (a gyre), as data: stand **beside** each other, shoulder to
 * shoulder, and orbit the point between you with your eyes on each other.
 *
 * The user, on the Moves page (relayed 2026-09-15, DD45):
 *
 * > "in this move, the couples stand beside each other, eyes locked, and orbit
 * > around the center point. its not face-to-face, as shown in our figure
 * > library."
 *
 * Three things in that sentence, and M5's shoulder round had none of them. It
 * was the allemande with the hands taken away — two dancers **facing each
 * other** across a nine-pixel radius, eighteen pixels apart, walking round —
 * which is a gyre drawn as a turn for two. What a shoulder round really is:
 *
 * - **Beside each other.** The two stand a shoulder's width apart, so the named
 *   shoulders are touching; the radius each rides is half of that
 *   ({@link SHOULDER_WIDTH_PX}), not the turn radius of a figure you hold on
 *   for.
 * - **Not face to face.** The body is on the **tangent** — the way the orbit is
 *   going — so the named shoulder points at the middle and the two of them walk
 *   forward past each other, exactly as a caller teaches it.
 * - **Eyes locked.** The head does the looking, not the body: `look: "other"`
 *   carries each dancer's gaze on to the other for the whole of the orbit, which
 *   is what the body used to be doing.
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

/**
 * Where the body points: a quarter turn off the radius, which is the way the
 * orbit is going.
 *
 * `{ orbit: 180 }` faces the middle and is what the figure used to do; a quarter
 * back from that is the tangent, and the sign is the hand's, so the shoulder the
 * call names is the one on the inside. It is the same quarter the allemande
 * leans **past** on its way in (`pair/allemande.ts`'s `sign * 135`), which is
 * the difference between a figure you pull against and one you do not.
 */
const TANGENT: NumberExpr = { number: "mul", of: [SPIN, 90] };

/** Shoulder round, as a figure definition. */
export const shoulderRoundDefinition: FigureDefinition = {
  id: "shoulder-round",
  call: "RIGHT SHOULDER ROUND",
  describe:
    "Come in beside each other, shoulder to shoulder, with the named shoulder touching, and walk forward round the point between the two of you with your eyes on each other the whole way — nobody takes hands and nobody is face to face. Once round brings you back where you started; a half leaves you on each other's places; once and a half takes you round and past. (unsure: some callers use this name for a plain do-si-do, where the two of you stay a dancing place apart and only the head follows.)",
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
    // **Half a shoulder's width**: the two of them stand beside each other with
    // the named shoulders touching, which is what the user's "the couples stand
    // beside each other" is on the floor.
    radius: SHOULDER_WIDTH_PX / 2,
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
    // to lean against, so the body settles on to the tangent and stays there —
    // side by side, walking forward, the named shoulder on the inside.
    body: [{ to: { orbit: TANGENT }, from: 0.1, until: 0.9 }],
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
