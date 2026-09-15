import type { AngleExpr, FigureDefinition } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Turn alone** (M7): turn on the spot, by yourself.
 *
 * Chorus Jig's four beats between leading down the centre and leading back up,
 * and Contrablend's own three beats after circling right. The smallest figure
 * there is, and the acceptance case for `actors: "each"` — a figure nobody
 * dances *with*, so there is no pairing and nobody can be left out of it.
 *
 * ## Why it needs a spin
 *
 * A facing at the end of a whole turn is the facing it started from, so a figure
 * that only wrote down where it leaves you would draw nothing at all. The
 * waypoint's `spin` is the body's own turn over the leg, and the end facing
 * stays the truth about where it stops — which is what a seam reads.
 *
 * ## Which way round **(unsure)**
 *
 * The default is to the dancer's own right. Neither transcript says, and the
 * usual teaching is "turn away from the dancer beside you", which a figure
 * danced alone cannot see; `direction` is there for a dance that knows.
 */

/** How far the body turns, signed degrees: turns × 360 × direction. */
const TURN: AngleExpr = {
  number: "mul",
  of: [{ param: "amount" }, 360, { param: "direction" }],
};

/** Stand still; turn. */
const step: PathStep = {
  at: { fromEnd: 0 },
  pose: {
    p: { point: "start", role: { role: "self" } },
    facing: {
      angle: "sum",
      of: [{ angle: "facingOf", role: { role: "self" }, at: "start" }, TURN],
    },
  },
  spin: TURN,
};

/** Turn alone, as a figure definition. */
export const turnAloneDefinition: FigureDefinition = {
  id: "turn-alone",
  call: "TURN ALONE",
  describe:
    "Turn round on the spot by yourself — nobody's hand, nobody to walk around. Half a turn unless the caller says otherwise, so you end facing back the way you came in the place you were already standing.",
  lead: 2,
  nominalBeats: 4,
  roles: ["one"],
  actors: "each",
  anchor: "centroid",
  params: {
    kind: "canonical",
    defaults: {
      /** Whole turns; a half is what "turn alone" means on its own. */
      amount: 0.5,
      /** `+1` is to the dancer's own right. (unsure) */
      direction: 1,
    },
  },
  shape: { kind: "waypoints", tracks: { "*": [step] } },
  holds: [],
  ends: "relative",
  // A fixed-angle turn: extra beats buy a gentler turn, not a bigger one.
  timing: { stretch: "pace", profile: "smooth" },
};
