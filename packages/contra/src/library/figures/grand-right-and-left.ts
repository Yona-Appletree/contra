import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { Side } from "@caller/core";
import { PLACE_PITCH_PX } from "../../formation/dupleImproper.js";
import { LANE_ROLES } from "../../set/resolve.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/pathM6.js";

/**
 * **Grand right and left**: three pull-bys along the line, alternating hands.
 *
 * The figure M6 exists to make possible. It is not a figure of a minor set at
 * all — it runs the length of the line and a dancer meets three *different*
 * people in six beats — so it is the first figure in the library with
 * `actors: "line"`: resolution hands it one instance per line of the lattice,
 * with one part per dancer named by the slot they are standing on
 * ({@link LANE_ROLES}).
 *
 * ## Why it needs nothing but "one place further on"
 *
 * Every dancer's track is the same sentence three times: **one dancing place
 * further along the set, the way you are already facing**. Because a line ready
 * for a grand right and left faces alternately up and down it, that one sentence
 * sends every dancer the way they should go and sends the two of any pair into
 * each other — and the pass finds its own partner geometrically
 * (`kinds/pathM6.ts`), so the definition never names anybody. Which is exactly
 * why the relations come out right: on the duple improper lattice, the dancer
 * you meet on the first pass is N1, on the second N2 and on the third N3, and
 * `relations.test.ts` derives that by hand rather than this file assuming it.
 *
 * Whoosh's A1 is `N1R;N2L;N3R`, which is the hands below and is what a grand
 * right and left always alternates to. Three passes, because three is what the
 * acceptance set asks for; a longer one is a parameter the day a dance wants it.
 */

/** How far one dancing place is along the set, px. */
const PLACE = PLACE_PITCH_PX;

/**
 * One pass: `n` places further along the set the way you were facing when the
 * figure began, bowing to the shoulder the hand names.
 */
const pass = (n: number, of: number, hand: Side): PathStep => ({
  // An equal share of whatever count the card gives the figure (D3): six beats
  // is two a pass, and a caller who gives it eight gets a slower one rather
  // than a fourth hand.
  at: { number: "mul", of: [{ param: "beats" }, n / of] },
  pose: {
    p: {
      point: "offset",
      from: { point: "start", role: { role: "self" } },
      along: { angle: "facingOf", role: { role: "self" }, at: "start" },
      distance: n * PLACE,
    },
    facing: { angle: "facingOf", role: { role: "self" }, at: "start" },
  },
  bow: hand === "R" ? DEFAULT_BOW_PX : -DEFAULT_BOW_PX,
  pass: hand,
  drop: 2,
});

/** Grand right and left, as a figure definition. */
export const grandRightAndLeftDefinition: FigureDefinition = {
  id: "grand-right-and-left",
  call: "GRAND RIGHT AND LEFT",
  describe:
    "Give your right hand to the dancer facing you, pull by, and give your left to the next one; right to the one after that. Keep going the way you started; three hands, two beats each, and the line moves past you the whole time.",
  lead: 4,
  nominalBeats: 6,
  roles: [LANE_ROLES],
  actors: "line",
  anchor: "lane",
  params: { kind: "canonical", defaults: {} },
  shape: {
    kind: "path",
    tracks: { "*": [pass(1, 3, "R"), pass(2, 3, "L"), pass(3, 3, "R")] },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};
