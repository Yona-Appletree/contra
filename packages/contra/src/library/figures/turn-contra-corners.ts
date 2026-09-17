import type { Side } from "@caller/choreo";
import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import { TURN_RADIUS_PX } from "./allemande.js";
import type {
  FigureDefinition,
  FigureRole,
  HoldSpec,
  NumberExpr,
  OrbitPairShape,
  SequencePart,
} from "../FigureDefinition.js";

/**
 * **Turn contra corners** (M7, rebuilt over six dancers in FR-B1, DD45):
 * sixteen beats, four turns, and it cannot be shown with four people.
 *
 * The user's own account, relayed 2026-09-15:
 *
 * > "can only be shown correctly with 6 dancers (its only ever done by the 1s or
 * > 2s at a time; actives and inactives). **Start:** The active couple allemande
 * > right in the center of the set. **First Corner:** Each active dancer drops
 * > their right hand and allemande left with their first corner (located on the
 * > right diagonal). **Return:** The active couple meets again in the center,
 * > typically allemande right once more. **Second Corner:** The active dancers
 * > then allemande left with their second corner (located on the left diagonal).
 * > **Finish:** The active couple usually concludes with a balance and swing in
 * > the center, facing down the set toward the new couple."
 *
 * ## Six dancers, because the corners are in the couples above and below
 *
 * M7 wrote the figure for a hands-four and picked the corners out of the *other
 * couple of the minor set* — your neighbour and the dancer diagonally across —
 * with an `axis` parameter to say which of the two came first. That is four
 * dancers and two corners each *shared between the two actives*, and it is not
 * the figure: an active has **two** corners of their own, the other active has
 * **two more**, and all four are different people. Four corners plus two actives
 * is six, and six is three couples — the actives with a couple above and a
 * couple below.
 *
 * So the figure declares the dancers it needs ({@link FigureDefinition.cast}) and
 * a card goes on saying what a card says: *"the ones turn contra corners"*. The
 * two diagonals are `C1` and `C0` in both contra formations' relation tables,
 * pinned by this ruling (`formation/dupleImproper.ts`, `formation/proper.ts`):
 * across the set and one dancing place along it, `C1` to your right and `C0` to
 * your left — and "your right" is your own, because the two actives look at each
 * other across the set and so have the couple above the set on one dancer's
 * right and on the other dancer's left.
 *
 * That is what lets both actives turn a corner over the same four beats without
 * meeting: a couple's two first corners are the two ends of one diagonal through
 * the middle of the set, and its two second corners the two ends of the other,
 * so the two turns of a part happen a whole dancing place apart. It is also why
 * the other active's first corner is `"C0.partner"` from this one and not
 * `"C1.partner"`: they reach the other way.
 *
 * A cast entry may be a **chain** for exactly that reason — the other active's
 * corners are the partners of dancers two steps from this one, and no table has
 * a row for that.
 *
 * ## The schedule is the user's, and the finish is the dance's
 *
 * `4 + 4 + 4 + 4`: allemande right with the other active in the centre, left
 * once round with your first corner, right with the other active again, left
 * once round with your second corner. The fifth turn M7 wrote is gone: the
 * user's *"Finish: … a balance and swing in the center"* is the **dance's own
 * next call** — Chorus Jig's B2, Jeremy Corners' B1 — and not sixteen beats'
 * business.
 *
 * `axis` is gone with it. It existed to say which of two readings of "corner"
 * came first, and the user has said which: the right diagonal, then the left.
 *
 * ## Who idles inside a figure
 *
 * All six are in the figure for all sixteen beats and four of them are standing
 * still for three of the four parts. That is `SequencePart.casts`: a role no
 * cast of a part names holds the pose the part before it left them in — an
 * honest end, not an empty one — and takes no hands (`kinds/sequence.ts`). The
 * two corner turns are the other half of the same mechanism: two pairs turning
 * at once inside one figure.
 */

/** A fraction of this turn's own count, as a number the calculus can read. */
const part = (share: number): NumberExpr => ({
  number: "mul",
  of: [{ number: "beats" }, share],
});

/** The orbit every turn of the figure is: an allemande's, with its amount written in. */
function orbit(turns: number, hand: Side): OrbitPairShape {
  const sign = hand === "R" ? 1 : -1;
  return {
    kind: "orbitPair",
    radial: "each",
    radius: TURN_RADIUS_PX,
    lateral: 0,
    clearance: CLEARANCE_PX,
    squeeze: "radius",
    turn: { amount: turns, sign, round: "none" },
    // **Every window is a fraction of this turn's own length.** An allemande's
    // numbers are absolute — it steps in over 1.3 beats and opens out over 1.1 —
    // which is right for the eight-beat figure they were measured on and wrong
    // for a shorter one: as fractions the same turn is the same shape at any
    // count, which is what D3 asks of every figure.
    profile: {
      a0: part(0.2),
      a1: part(0.45),
      b0: { fromEnd: part(0.4) },
      b1: { fromEnd: part(0.15) },
    },
    inBeats: part(0.3),
    outBeats: part(0.25),
    body: [
      { to: { orbit: 180 }, from: 0.1, until: 0.9 },
      { to: { orbit: sign * 135 }, from: 0.9, until: 1.9 },
      { to: { orbit: 180 }, from: { fromEnd: 1.2 }, until: { fromEnd: 0.2 } },
    ],
    look: "anchor",
    ends: { kind: "turned" },
    contact: [],
    motion: null,
  };
}

/** One joined hand of one turn: the pair, the hand, and when it is taken. */
function cornerHold(a: FigureRole, b: FigureRole, hand: Side): HoldSpec {
  return {
    kind: "pair",
    a,
    aSide: hand,
    b,
    bSide: hand,
    point: { kind: "anchor" },
    drop: { param: "holdDrop" },
    stackPx: 0,
    // **The windows are fractions of the part**, not the allemande's own
    // absolute beats: every turn takes and gives back its hand at the same point
    // in its own length, whatever count the card gives the figure.
    window: {
      kind: "ramps",
      takeFrom: { number: "mul", of: [{ number: "beats" }, 0.1] },
      takeTo: { number: "mul", of: [{ number: "beats" }, 0.45] },
      releaseFrom: { number: "mul", of: [{ number: "beats" }, 0.6] },
      releaseTo: { number: "mul", of: [{ number: "beats" }, 0.95] },
    },
  };
}

/** One turn of the figure: who, which hand, how far round, over how many beats. */
function turn(
  casts: readonly (readonly [FigureRole, FigureRole])[],
  hand: Side,
  turns: number,
  beats: number,
): SequencePart {
  return {
    beats,
    casts: casts.map(([a, b]) => [a, b]),
    shape: orbit(turns, hand),
    holds: casts.map(([a, b]) => cornerHold(a, b, hand)),
  };
}

/**
 * The six the figure needs, as relations from the active dancer the call named.
 *
 * In the order {@link turnContraCornersDefinition.roles} lists them, because
 * that is how resolution assigns the parts (`set/resolve.ts`'s `castRings` and
 * `castRoles`).
 */
const CAST = ["self", "partner", "C1", "C0.partner", "C0", "C1.partner"] as const;

/** The two actives, meeting in the middle. */
const ACTIVES: readonly (readonly [FigureRole, FigureRole])[] = [["active", "mate"]];
/** Each active with their **first** corner: the right diagonal. */
const FIRST: readonly (readonly [FigureRole, FigureRole])[] = [
  ["active", "activeFirst"],
  ["mate", "mateFirst"],
];
/** Each active with their **second** corner: the left diagonal. */
const SECOND: readonly (readonly [FigureRole, FigureRole])[] = [
  ["active", "activeSecond"],
  ["mate", "mateSecond"],
];

/** Turn contra corners, as a figure definition. */
export const turnContraCornersDefinition: FigureDefinition = {
  id: "turn-contra-corners",
  call: "TURN CONTRA CORNERS",
  describe:
    "The two actives give right hands in the middle of the set and turn half way. Drop that hand, give your left to your first corner — the dancer on your right diagonal, in the couple one place along the way you are travelling — and turn all the way round. Right hand to the other active in the middle again, half way, and then your left to your second corner on the left diagonal, all the way round. Six dancers: the two of you and the two couples either side of you, and your corners stand and wait between their turns.",
  lead: 4,
  nominalBeats: 16,
  roles: ["active", "mate", "activeFirst", "mateFirst", "activeSecond", "mateSecond"],
  cast: CAST,
  actors: "all",
  // **The middle of whoever is dancing this part**, which is the only anchor a
  // figure spread over three couples has: there is no hands-four under it, and
  // `"meet"` is a rule about *two* dancers and refuses six by name. Each part of
  // the sequence re-anchors on its own cast (`kinds/sequence.ts`), so every turn
  // still turns about the point between the two dancing it.
  anchor: "centroid",
  params: { kind: "canonical", defaults: { holdDrop: 2 } },
  shape: {
    kind: "sequence",
    parts: [
      turn(ACTIVES, "R", 0.5, 4),
      turn(FIRST, "L", 1, 4),
      turn(ACTIVES, "R", 0.5, 4),
      turn(SECOND, "L", 1, 4),
    ],
  },
  holds: [],
  symmetry: {
    mirror: {
      kind: "handed",
      why: "right hands to the other active and left hands to the corners is the figure and not a parameter of it, and the first corner is the right diagonal; the mirror of contra corners is sixteen beats nobody dances",
    },
  },
  ends: "relative",
  timing: { stretch: "pace", profile: "trapezoid" },
};
