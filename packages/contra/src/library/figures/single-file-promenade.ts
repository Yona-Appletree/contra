import type { AngleExpr, FigureDefinition, NumberExpr } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";
import { CIRCLE_IN_BEATS } from "./circle.js";

/**
 * **Single file promenade**, as data: the four of you walk round the ring in a
 * line, nose to tail, holding nothing.
 *
 * The ring walk again, and the third dressing of it: a circle faces its middle,
 * a star faces along the ring with a hand on a wrist, and this faces along the
 * ring with **no hands at all**. That is the whole difference, which is why it
 * is a definition rather than a shape kind.
 *
 * `amount` is a fraction of the **ring** rather than a count of places, because
 * that is what callers say — "single file promenade clockwise a quarter", "half
 * way round" — and a ring of four has four places, so a quarter is one place
 * along. A Rare Bird asks for a half in four beats and On the Prowl for a
 * quarter in two.
 */

/** Which way round: clockwise is the way a circle left travels. */
const SPIN: NumberExpr = {
  number: "select",
  on: "direction",
  cases: { clockwise: 1, counterclockwise: -1 },
};

/** Facing along the ring, the way you are going: a quarter off the outward radius. */
const ALONG_THE_RING: AngleExpr = { number: "mul", of: [SPIN, 90] };

/**
 * Stepping on to the ring and off it again, **as a share of the count**, and
 * **not the same share** either way.
 *
 * The circle's and the star's 1.5 beats are fixed numbers because both are
 * eight-beat figures; this one is two beats in On the Prowl and four in A Rare
 * Bird, and 1.5 in and 1.5 out of two beats is more stepping than there is
 * figure — the walk is squeezed into the half beat between them and the dancers
 * cross the ring in a single frame. So both are a share of the count, capped at
 * the ring walk's own 1.5 so an eight-beat promenade is the circle exactly (D3).
 *
 * The **step in is longer than the step out** because they are not the same
 * thing. Stepping on to the ring means turning to face the way it is going, and
 * from a duple improper line that is a hundred and fifty degrees for two of the
 * four; stepping off it means no turn at all, because the figure ends facing
 * along the ring — the tangent it has been facing the whole way round. Half a
 * beat of turning at two beats is 407°/beat of body, which is more than a whole
 * turn a beat and is not a thing a dancer does; two fifths of the count brings
 * it down to a walkable number, and the promenade's own row in `pnpm dance
 * on-the-prowl` is what says so.
 */
const STEP_IN: NumberExpr = {
  number: "min",
  of: [CIRCLE_IN_BEATS, { number: "mul", of: [{ number: "beats" }, 0.4] }],
};

/** @see STEP_IN */
const STEP_OUT: NumberExpr = {
  number: "min",
  of: [CIRCLE_IN_BEATS, { number: "mul", of: [{ number: "beats" }, 0.25] }],
};

/** Single file promenade, as a figure definition. */
export const singleFilePromenadeDefinition: FigureDefinition = {
  id: "single-file-promenade",
  call: "SINGLE FILE PROMENADE",
  describe:
    "Face the way the ring is going and walk round it in single file, one behind the other, nobody holding anything. A quarter is one place along and a half is two, and you stop facing the way you were travelling — whatever comes next is what turns you.",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: { direction: "clockwise", amount: 0.25 },
  },
  shape: {
    kind: "ringWalk",
    // A ring of four: a quarter of it is one place along.
    places: { number: "mul", of: [{ param: "amount" }, 4] },
    sign: SPIN,
    faceOffset: ALONG_THE_RING,
    inBeats: STEP_IN,
    outBeats: STEP_OUT,
    // Still facing the way you were going, which is what makes the next figure's
    // own first beat read as a turn rather than a jump.
    endFacing: { kind: "tangent", offset: ALONG_THE_RING },
    travel: { kind: "ring" },
    idleHands: { kind: "down" },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  // Clockwise and counterclockwise are each other's mirror image, and the
  // facing goes with the direction, which is the one `words` entry.
  symmetry: {
    mirror: {
      kind: "parameters",
      words: { direction: { clockwise: "counterclockwise", counterclockwise: "clockwise" } },
    },
  },
};
