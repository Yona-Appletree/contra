import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { FigureDefinition, NumberExpr, SequencePart } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Square through** (M9): two pull-bys with two different people, a quarter
 * turn apart.
 *
 * Both Banner dances call one — Jeremy Corners' *"(4) Square through 2
 * (NR;SRNL)"* and The Set Monster's *"(4) Square through 2 (N3R;PL)"* — and
 * both call it **inside** an interrupted square through, which is why
 * `square-through` sat on `UNSUPPORTED_FIGURES` from M8 with M9's name beside
 * it rather than M8's beside `promenade`.
 *
 * ## It is a pass list, and every token names its own two people
 *
 * `(N3R;PL)` reads the way a hey's pass list reads: one token per hand, who and
 * then which hand. *"Give your right to the neighbour three along and pull by;
 * give your left to your partner and pull by."* So the figure is a
 * {@link SequenceShape} of two parts, each part naming **its own casts** from a
 * parameter — which is the widening this milestone made to
 * {@link SequencePart.casts} and the reason it was worth making: the two hands
 * of a square through are with two different people and no definition can write
 * down who.
 *
 * Each part is planned over its own pair, so a square through of a minor set is
 * two pull-bys happening at once and then two more; a pair a parameter names
 * that this instance does not hold is dropped, and those dancers stand.
 *
 * ## Two hands, not four
 *
 * "Square through 2" is what the corpus asks for here, and two is what is
 * written. Three and four hands are two more parts in the same list the day a
 * dance calls one; the count each part takes is a **share** of whatever the card
 * gives the figure (D3), so four beats is two a hand and six is three.
 *
 * ## The turn between the hands is not written down
 *
 * A square through's dancers turn a quarter between the two pull-bys — you pull
 * by the one in front and then give the other hand to the one now beside you.
 * Nothing here turns anybody: the second part's walk starts from where the first
 * left them and ends where its own mate is standing, and the body turns to face
 * the way it is walking (`facing: { kind: "curve" }`), which is the same quarter
 * arrived at by measurement rather than by a written angle. **(unsure)**: a
 * caller teaching it says "turn a quarter", and a dance that wants the turn to
 * happen *before* the walk rather than as part of it has no way to say so.
 */

/** Which way to bow: right hands pass right shoulders, so you bow to your left. */
const bow = (hand: string): NumberExpr => ({
  number: "select",
  on: hand,
  cases: { L: -DEFAULT_BOW_PX, R: DEFAULT_BOW_PX },
});

/**
 * One hand of a square through: give it, walk past, let go.
 *
 * The same shape `pull-by` is, written as a `path` rather than as a waypoint
 * route because a part of a sequence is planned over the pair its own casts
 * name, and a `path`'s pairing is what turns that pair into a mate.
 */
export function squareThroughPass(
  pairsParam: string,
  handParam: string,
  share: number,
): SequencePart {
  return {
    beats: { share },
    casts: { param: pairsParam },
    shape: {
      kind: "path",
      pairing: { kind: "param", param: pairsParam },
      track: {
        // Their place, faced along the way you walked to get there — which is
        // what leaves you facing the dancer the next hand is with.
        ends: {
          p: { point: "start", role: { role: "mate" } },
          facing: {
            angle: "bearing",
            from: { point: "start", role: { role: "self" } },
            to: { point: "start", role: { role: "mate" } },
          },
        },
        curve: { kind: "walkStep", bow: bow(handParam) },
        facing: { kind: "curve" },
        idleHands: { kind: "down" },
        stepRate: { when: "moving" },
        amp: { when: "moving" },
      },
      idle: { idleHands: { kind: "down" }, amp: 0 },
    },
    holds: [
      {
        kind: "mate",
        side: { param: handParam },
        point: { kind: "joinPoint" },
        drop: { param: "holdDrop" },
        // Taken as the two close up and given back as they go by: the hand is
        // never up for the whole of a pull-by, which is two beats long.
        window: { kind: "holdWindow", take: 0.5, release: 0.5 },
      },
    ],
  };
}

/** The parameters a square through's two hands are written with. */
export const SQUARE_THROUGH_DEFAULTS = {
  /** Whom the first hand is with: `"partners"`, `"neighbors"`, or the pairs. */
  firstPass: "neighbors",
  /** Which hand that is. */
  firstHand: "R",
  /** Whom the second hand is with. */
  secondPass: "partners",
  /** Which hand that is; a square through alternates. */
  secondHand: "L",
  /** How long a joined hand takes to come down, beats. */
  holdDrop: 2,
};

/** Square through, as a figure definition. */
export const squareThroughDefinition: FigureDefinition = {
  id: "square-through",
  call: "SQUARE THROUGH",
  describe:
    "Give your right hand to the dancer you are facing and pull by, then give your left to the dancer you are facing now and pull by again. Two hands, two different people, and you end facing out of where you started.",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: SQUARE_THROUGH_DEFAULTS },
  shape: {
    kind: "sequence",
    parts: [
      squareThroughPass("firstPass", "firstHand", 0.5),
      squareThroughPass("secondPass", "secondHand", 0.5),
    ],
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  symmetry: {
    // Right and then left is the figure and not a parameter of it: the mirror
    // image of a square through is a square through nobody calls.
    mirror: {
      kind: "handed",
      why: "a square through alternates right and then left, and the hands are the figure rather than a parameter of it",
    },
  },
};
