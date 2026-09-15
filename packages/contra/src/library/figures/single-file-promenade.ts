import type { AngleExpr, FigureDefinition, NumberExpr } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";
import { CIRCLE_IN_BEATS } from "./circle.js";

/**
 * **Single file promenade**, as data: the four of you walk round the **set**, in
 * a line, nose to tail, holding nothing.
 *
 * ## Round the set, not about its middle (FR-A2)
 *
 * The user: *"not at all right. you don't just rotate about the center. you walk
 * around the set single file like in a bike chain."* It used to ride the ring
 * travel the circle and the star ride — everybody steps **in** to a regular
 * circle about the set's middle, the circle turns, everybody steps out — and
 * that is a rotation about the centre, which is exactly what he is looking at.
 *
 * What it is instead is the chain travel (`kinds/ringWalk.ts`): the path is the
 * loop through the dancers' **own places**, so each of them walks the straight
 * run to the place of the dancer in front, rounds the corner where the set
 * turns, and walks the next run. Nobody steps in and nobody steps out, because
 * everybody is already standing on the path — and the pen plot of it is the
 * outline of the set rather than a circle inside it.
 *
 * The other two dressings of the ring walk are untouched: a circle faces its
 * middle and holds hands round, a star faces along the ring with a hand on a
 * wrist, and this one faces the way it is going with **no hands at all**.
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

/**
 * **You face the way you are going** (FR-A2), and on a chain that is the path's
 * own direction rather than an angle off a radius.
 *
 * It used to be a quarter turn off the outward radius, which is the same answer
 * only while the path is a circle — and a promenade round the set is not one.
 */
const THE_WAY_YOU_ARE_GOING: AngleExpr = 0;

/**
 * How far either side of a place the chain turns the body over, px.
 *
 * A dancer walking round the end of the set does not hinge on the spot: they
 * lean into the turn a step before the corner and are straightened out a step
 * after it. Five px is a bit over a step at this scale, and it is bounded by
 * half the run either side so a short run is turned over less rather than
 * overshot. Measured: at two px the ninety degrees of A Rare Bird's corner went
 * by in a fifth of a beat and the hanging hands swung 77.5 px/beat, over the
 * library's own 68.4 bound; at five it is inside it. A quarter of a ring of four
 * is one straight run and never sees a corner at all.
 */
const CHAIN_CORNER_PX = 5;

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
    "Face the way you are going and walk round the outside of the set in single file, one behind the other, nobody holding anything — each of you walking to the place of the dancer in front, the way a chain runs round its sprockets. A quarter is one place along and a half is two, and you stop facing the way you were travelling: whatever comes next is what turns you.",
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
    // **A quarter of a ring of four is one place along, and a third of a ring
    // of three is too** (M9). The ring's size is read off the cast rather than
    // written down, because both are called: On the Prowl and A Rare Bird
    // promenade a whole minor set and Jeremy Corners' B2 promenades **three** —
    // *"[Man one and twos] Single file promenade clockwise 1/3"* — and nothing
    // in the figure changes but how many places a fraction of the ring is.
    places: { number: "mul", of: [{ param: "amount" }, { number: "dancers" }] },
    sign: SPIN,
    faceOffset: THE_WAY_YOU_ARE_GOING,
    // Read by the ring travel this figure no longer uses: a chain steps in to
    // nothing, because everybody is already standing on the path.
    inBeats: STEP_IN,
    outBeats: STEP_OUT,
    // Still facing the way you were going, which is what makes the next figure's
    // own first beat read as a turn rather than a jump.
    endFacing: { kind: "tangent", offset: THE_WAY_YOU_ARE_GOING },
    travel: { kind: "chain", corner: CHAIN_CORNER_PX },
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
