import type { Side } from "@caller/choreo";
import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import { TURN_RADIUS_PX } from "../../pair/allemande.js";
import type {
  FigureDefinition,
  FigureRole,
  HoldSpec,
  NumberExpr,
  OrbitPairShape,
  ParamGuard,
  SequencePart,
} from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Turn contra corners** (M7): sixteen beats, five turns, four dancers, and
 * nobody idle for long.
 *
 * Chorus Jig's B1. The actives turn each other by the right, each turns their
 * **first corner** by the left, back to each other, each turns their **second
 * corner**, and back to each other again to finish in the middle. It is the
 * acceptance case for two things at once:
 *
 * - **Corners by relation.** A corner is a row of the formation's own table, not
 *   a station: your first corner is the dancer of the other couple diagonally
 *   across the set and your second is the one straight along your own line. In a
 *   proper set that makes your first corner your neighbour and your second the
 *   other dancer of your own role, which is what Chorus Jig dances. **(unsure)**
 *   — nothing else in the acceptance set pins the two apart, and the two corner
 *   turns are the same figure with the pair swapped, so a set that has them the
 *   other way round dances the same sixteen beats in the other order.
 * - **Who idles inside a figure.** All four are in the figure for all sixteen
 *   beats and two of them are standing still for three of the five parts, which
 *   is M4's own open question answered: a sequence part names its **casts**, and
 *   a role no cast names holds the pose the part before left them in
 *   (`kinds/sequence.ts`). The two corner turns are the other half of the same
 *   mechanism — two pairs turning at once, inside one figure.
 *
 * ## The schedule **(unsure)**
 *
 * `2 + 4 + 2 + 4 + 4`: a half turn by the right with each other, a whole turn by
 * the left with the first corner, a half by the right, a whole by the left with
 * the second corner, and once round by the right to finish in the middle. That is
 * the breakdown most callers teach and it is the one that sums to sixteen; the
 * corpus transcript says only "(16) Ones turn contra corners".
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
    // for a two-beat one: 1.3 and 1.1 do not fit in two beats at all, so the
    // dancers spend the whole turn stepping in and back out and never turn, at
    // 92 px a beat of hand. As fractions the same turn is the same shape at any
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

/**
 * One joined hand of one turn: the pair, the hand, and when it is taken.
 *
 * `when` is what lets a part whose casts the `axis` parameter chooses carry the
 * holds for **both** answers: the two that are not being danced are guarded out
 * before anything is sampled, so no hold ever names a role this part's own cast
 * does not hold.
 */
function cornerHold(a: FigureRole, b: FigureRole, hand: Side, when?: ParamGuard): HoldSpec {
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
    // absolute beats. Contra corners turns five times in sixteen beats and two
    // of those turns are two beats long; an allemande's hand is fully up at
    // beat 1.3 and starts coming down at 1.1 from the end, which on a two-beat
    // turn overlap — so the hand never reaches the hip between corners and
    // slides from one turning centre to the next at 92 px a beat, which is the
    // library's own bound and a half. Written as fractions, every turn takes
    // and gives back its hand at the same point in its own length.
    window: {
      kind: "ramps",
      takeFrom: { number: "mul", of: [{ number: "beats" }, 0.1] },
      takeTo: { number: "mul", of: [{ number: "beats" }, 0.45] },
      releaseFrom: { number: "mul", of: [{ number: "beats" }, 0.6] },
      releaseTo: { number: "mul", of: [{ number: "beats" }, 0.95] },
    },
    ...(when === undefined ? {} : { when }),
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

/** The two actives, by the hands-four station they stand on. */
const ACTIVES = ["1L", "1R"] as const;
/** Diagonally across the set from each active. */
const DIAGONAL: readonly (readonly [FigureRole, FigureRole])[] = [
  ["1L", "2R"],
  ["1R", "2L"],
];
/** Straight along each active's own line. */
const ALONG: readonly (readonly [FigureRole, FigureRole])[] = [
  ["1L", "2L"],
  ["1R", "2R"],
];

/**
 * **Which corner is your first**, by the axis the figure is called along (M9).
 *
 * `axis: "across"` is Chorus Jig's and the one every caller teaches from a
 * proper set: your first corner is the dancer diagonally across the set and
 * your second the one straight along your own line. `axis: "along"` is the
 * other way round, which is what Jeremy Corners writes — *"(16) Ones turn
 * contra corners (along the set)"* — where the actives are standing in the
 * middle of the set facing each other along it and the corners are reached
 * along the set rather than across it. **(unsure)**: the parenthetical is the
 * whole of what the transcript says, and the two readings dance the same
 * sixteen beats with the two corner turns in the other order.
 *
 * The two answers are two written lists and the parameter chooses between them,
 * which is `{ number: "select" }`'s idea one level up — see
 * {@link SequencePart.casts}.
 */
function cornerTurn(
  which: "first" | "second",
  hand: Side,
  turns: number,
  beats: number,
): SequencePart {
  const cases =
    which === "first" ? { across: DIAGONAL, along: ALONG } : { across: ALONG, along: DIAGONAL };
  const danced = which === "first" ? ["across"] : ["along"];
  const other = which === "first" ? ["along"] : ["across"];
  return {
    beats,
    casts: { select: "axis", cases },
    shape: orbit(turns, hand),
    holds: [
      ...DIAGONAL.map(([a, b]) => cornerHold(a, b, hand, { param: "axis", is: danced })),
      ...ALONG.map(([a, b]) => cornerHold(a, b, hand, { param: "axis", is: other })),
    ],
  };
}

/** Turn contra corners, as a figure definition. */
export const turnContraCornersDefinition: FigureDefinition = {
  id: "turn-contra-corners",
  call: "TURN CONTRA CORNERS",
  describe:
    "Give your right hand to the other active and turn half way, then give your left to your first corner and turn all the way round. Right hand to the active again, half way, left hand to your second corner all the way round, and right hand to the active once more to finish in the middle of the set. The corners stand and wait between their turns: they are in the figure, they are just not moving yet.",
  lead: 4,
  nominalBeats: 16,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: { holdDrop: 2, axis: "across" } },
  shape: {
    kind: "sequence",
    parts: [
      turn([ACTIVES], "R", 0.5, 2),
      cornerTurn("first", "L", 1, 4),
      turn([ACTIVES], "R", 0.5, 2),
      cornerTurn("second", "L", 1, 4),
      turn([ACTIVES], "R", 1, 4),
    ],
  },
  holds: [],
  symmetry: {
    mirror: {
      kind: "handed",
      why: "right hands to the other active and left hands to the corners is the figure and not a parameter of it; the mirror of contra corners is sixteen beats nobody dances",
    },
  },
  ends: "relative",
  timing: { stretch: "pace", profile: "trapezoid" },
};
