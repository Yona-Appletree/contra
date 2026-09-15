import type { NumberExpr, FigureDefinition, SoloHold } from "../FigureDefinition.js";
import { WRIST_ALONG } from "../../figures/star.js";
import { MINOR_SET_ROLES } from "./carriers.js";
import { CIRCLE_IN_BEATS, CIRCLE_OUT_BEATS, CIRCLE_TAKE_BEATS } from "./circle.js";

/**
 * **Star**, as data: walk it round, hand on the wrist of the dancer ahead.
 *
 * The same ring walk the circle rides, turned a quarter: a star's bodies point
 * *along* the ring rather than at its middle, which is the whole of
 * `faceOffset`, and its hands are not a ring of joined points at all.
 *
 * The user, who dances this hold every week:
 *
 * > "in our area the star is done by putting the hand on the wrist of the
 * > person in front of you. this also lets the arm stay slightly bent. doing
 * > all in a pile in the center (that's awkward)."
 *
 * So the giving hand is a {@link SoloHold} — one dancer's hand on a point, with
 * nobody holding the other end of it, because the dancer ahead has their own
 * hand on the next wrist round. `hands-across` is the same hold with its point
 * at the middle and a real join to the dancer diagonally across, which is why
 * both are one list guarded on the same parameter rather than two figures.
 */

/** Which way the ring turns, by which hand is in the middle. */
const HAND_SIGN: NumberExpr = { number: "select", on: "hand", cases: { R: 1, L: -1 } };

/** A star's bodies point along the ring: a quarter turn off the outward radius. */
const STAR_FACE_OFFSET: NumberExpr = { number: "mul", of: [HAND_SIGN, 90] };

/** Both holds take and let go with the stepping in and the stepping out. */
const STAR_WINDOW: SoloHold["window"] = {
  kind: "holdWindow",
  take: CIRCLE_TAKE_BEATS,
  release: CIRCLE_OUT_BEATS,
};

/** Star, as a figure definition. */
export const starDefinition: FigureDefinition = {
  id: "star",
  call: "STAR RIGHT",
  describe:
    "All four put the named hand on the wrist of the dancer ahead of them round the star, not in a pile in the middle — that keeps your arm slightly bent — and walk forward round the centre; right hand star goes one way and left hand star the other. Four places is once round, two is half way. Rarely, a caller asks for a hands-across star instead: you take hold only of the dancer diagonally across from you, one hand each, the robins' held a little higher than the larks'.",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      hand: "R",
      /** How many of the ring's four places the star walks: four is once round. */
      places: 4,
      /**
       * **How far round, as a fraction of the whole star** — the caller's own
       * word (M8).
       *
       * "Star left 7/8" is Are You 'Most Done?'s A2 and is not a whole number of
       * places; 92 corpus dances write a star as a fraction rather than as
       * places. It multiplies `places`, so the two ways of saying it compose and
       * the eleven records that write `places` alone are untouched: `places: 4`
       * with no `amount` is once round exactly as it was, `places: 3` is three
       * quarters, and `amount: 0.875` is seven eighths of whichever the record
       * asked for.
       */
      amount: 1,
      holdDrop: 3,
      stackPx: 1.2,
      hold: "wrist",
    },
  },
  shape: {
    kind: "ringWalk",
    places: { number: "mul", of: [{ param: "places" }, { param: "amount" }] },
    // A right-hand star keeps the middle on the dancer's right, which turns the
    // ring the way a circle left goes; a left-hand star turns back.
    sign: HAND_SIGN,
    faceOffset: STAR_FACE_OFFSET,
    inBeats: CIRCLE_IN_BEATS,
    outBeats: CIRCLE_OUT_BEATS,
    endFacing: { kind: "tangent", offset: STAR_FACE_OFFSET },
    travel: { kind: "ring" },
    // The hand that is not in the star simply hangs.
    idleHands: { kind: "down" },
  },
  holds: [
    {
      kind: "solo",
      role: "each",
      side: { param: "hand" },
      // The dancer immediately ahead of you round the ring, in the direction
      // the star actually turns — a role shift, and in a ring walk a role shift
      // runs round the ring.
      point: { kind: "wristOf", of: { role: "shift", places: HAND_SIGN }, along: WRIST_ALONG },
      drop: { param: "holdDrop" },
      stackPx: { param: "stackPx" },
      window: STAR_WINDOW,
      when: { param: "hold", is: ["wrist"] },
    },
    {
      kind: "solo",
      role: "each",
      side: { param: "hand" },
      // Hands across: the two diagonals each put one hand at the middle, which
      // in a ring walk is the ring's own centre.
      point: { kind: "anchor" },
      drop: { param: "holdDrop" },
      stackPx: { param: "stackPx" },
      joins: { with: { role: "shift", places: 2 }, side: { param: "hand" } },
      window: STAR_WINDOW,
      when: { param: "hold", is: ["hands-across"] },
    },
  ],
  ends: "relative",
  timing: { stretch: "distance", profile: "cruise" },
  // A left-hand star is a right-hand star in a mirror: the hand decides which
  // way the ring turns, which way the bodies point and whose wrist you take.
  symmetry: { mirror: { kind: "parameters", hands: ["hand"] } },
};
