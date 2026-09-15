import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { Side } from "@caller/core";
import { PLACE_PITCH_PX } from "../../formation/dupleImproper.js";
import { LANE_ROLES } from "../../set/resolve.js";
import type { AngleExpr, FigureDefinition } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

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
 * further along the set, the way you travel**. That one sentence sends every
 * dancer the way they should go and sends the two of any pair into each other —
 * and the pass finds its own partner geometrically (`kinds/waypoints.ts`), so the
 * definition never names anybody. Which is exactly why the relations come out
 * right: on the duple improper lattice, the dancer you meet on the first pass is
 * N1, on the second N2 and on the third N3, and `relations.test.ts` derives that
 * by hand rather than this file assuming it.
 *
 * **The way you travel, not the way you are looking** (M7b). M6 wrote it as the
 * facing, on the reasoning that a line ready for a grand right and left faces
 * alternately up and down it. A line ready for one does; a line that has just
 * finished a do-si-do does not, and Whoosh's second time through is where that
 * showed: every dancer came out of B2's do-si-do looking **58° off the set**, so
 * the first pass walked twenty pixels diagonally, nobody's swap matched anybody
 * else's, every route stopped on its first pass — and the N2 allemande two
 * figures later found its pair three dancing places apart and swept an orbit
 * sixty pixels wide through four other dancers (`collision 4.919 px`). Travel is
 * a fact about the lattice and is the same at the top of every time through;
 * `{ point: "slot" }` is how a definition says it (M7's node, M6's ask).
 *
 * Whoosh's A1 is `N1R;N2L;N3R`, which is the hands below and is what a grand
 * right and left always alternates to. Three passes, because three is what the
 * acceptance set asks for; a longer one is a parameter the day a dance wants it.
 *
 * ## The end of the line (M7b)
 *
 * Three passes is what the *middle* of the line dances. Near either end one of
 * them has nobody in it — at four couples nobody's N3 exists at all, and the
 * dancers two places from an end have no N2 either — and M6's end-of-set rule
 * applies to each pass on its own: *a relation that resolves to nobody leaves
 * that dancer on hold-place*, here for that pass and the ones after it rather
 * than for the whole call. The rule is `kinds/waypoints.ts`'s and it is
 * **geometric**: a pass with nobody in it stops the route where it stands. The
 * `meets` word on each step is only so the lab's end-effects table can name
 * which pass left whom out, and the test checks that the two agree.
 */

/** How far one dancing place is along the set, px. */
const PLACE = PLACE_PITCH_PX;

/**
 * **Which way along the set this dancer is going**: from their own slot to the
 * slot one dancing place along the way they travel.
 *
 * Two lattice points and the bearing between them, which is a direction and not
 * a place — so a dancer who is not standing exactly on their slot still walks
 * the right way.
 */
const ALONG_MY_WAY: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", along: 0 },
  to: { point: "slot", along: 1 },
};

/**
 * One pass: `n` places further along the set the way you travel, looking that
 * way, bowing to the shoulder the hand names.
 */
const pass = (n: number, of: number, hand: Side): PathStep => ({
  // Whose pass this is, for the end-effects table and for nothing else: the
  // geometry finds its own partner and stops the route where one is missing.
  // The n-th pass meets N(n) — `grand-right-and-left.test.ts` checks that the
  // geometry and the formation's own relation table agree dancer by dancer.
  meets: `N${String(n)}`,
  // An equal share of whatever count the card gives the figure (D3): six beats
  // is two a pass, and a caller who gives it eight gets a slower one rather
  // than a fourth hand.
  at: { number: "mul", of: [{ param: "beats" }, n / of] },
  pose: {
    p: {
      point: "offset",
      from: { point: "start", role: { role: "self" } },
      along: ALONG_MY_WAY,
      distance: n * PLACE,
    },
    facing: ALONG_MY_WAY,
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
    kind: "waypoints",
    tracks: { "*": [pass(1, 3, "R"), pass(2, 3, "L"), pass(3, 3, "R")] },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};
