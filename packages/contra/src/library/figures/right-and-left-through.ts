import { DEFAULT_BOW_PX } from "@caller/choreo";
import { COURTESY_PIVOT_FROM_LARK_PX } from "../../figures/courtesyTurn.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Right and left through**, as data: pass the dancer you are facing by the
 * right, and courtesy turn with the one you came over with.
 *
 * The figure whose turn is the textbook one. The couple walks over with the
 * robin already on the lark's right and stops short of the far line, and the
 * whole of it — both bodies *and* the line between them — pivots as one rigid
 * body a half round a point near the lark, so they end facing back the way they
 * came, the robin still on his right and both of them on the other line. Dance
 * it twice and everybody is home.
 *
 * Almost all of it is now one word — `regime: "rigid"` — because the turn
 * itself is the shared kind's, and the rest is five numbers.
 */

/** How long the couple takes to open out on to its two places, beats. */
const OPEN_BEATS = 1.5;

/** How long the couple takes to close up from the far places on to the hold, beats. */
const CLOSE_BEATS = 1;

/** Right and left through, as a figure definition. */
export const rightAndLeftThroughDefinition: FigureDefinition = {
  id: "right-and-left-through",
  call: "RIGHT AND LEFT THROUGH",
  describe:
    "The two couples walk toward each other and pass through by the right, each dancer passing right shoulders with the one they are facing, and close up with the one they came over with, stopping short of the far line — the lark sliding the further of the two, because the couple closes up about the point it is going to turn about. Left hand in her left, her own right hand behind her back and his right hand on it, the couple pivots as one, a half turn about a point near the lark — he backs round a small circle of his own, she walks the big arc round him, and the arms stay put — until both of them face in again with the robin still on the lark's right, and then opens out on to the two places. Eight beats, both couples doing it at once; dance it twice and everybody is home. (unsure: exact pivot distance — the user judges by eye. And a hall turns a courtesy turn at a hold and stands in the lines at a hold, where this model's lines are nearly four times that far apart, so the couple stops short of the line to turn and opens out again as it lets go.)",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      couples: "partners",
      passBeats: 3.5,
      bowPx: DEFAULT_BOW_PX,
      holdDrop: 6,
      stackPx: 1,
      pivotFromLark: COURTESY_PIVOT_FROM_LARK_PX,
    },
  },
  shape: {
    kind: "courtesyTurn",
    regime: "rigid",
    // Who you pass is who is in front of you; who you turn with is the one you
    // came over with, which the call names.
    pairing: { kind: "couples", param: "couples", passing: "ahead" },
    ends: { kind: "throughAndTurn" },
    approachBeats: { param: "passBeats" },
    bow: { param: "bowPx" },
    pivotFromLark: { param: "pivotFromLark" },
    // No pull by: both couples walk straight through each other.
    passPx: 0,
    openBeats: OPEN_BEATS,
    closeBeats: CLOSE_BEATS,
    larkLead: 0,
    backHands: true,
    hands: { drop: { param: "holdDrop" }, stackPx: { param: "stackPx" }, pullDrop: null },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  symmetry: {
    mirror: {
      kind: "handed",
      why:
        "a courtesy turn has a handedness the figure does not choose — the robin ends on the " +
        "lark's right, she walks forward and he backs up, and `COURTESY_HALF_TURN` is one sign " +
        "for exactly that reason. Its mirror image is a figure nobody dances.",
    },
  },
};
