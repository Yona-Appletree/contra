import type { AngleExpr, FigureDefinition, NumberExpr, PointExpr } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Mad robin**, as data: circulate round each other without turning round.
 *
 * The pair walk a circle about the point between them — one in front of the
 * other and one behind — and **keep their facing the whole way**, which is the
 * whole figure and the reason it feels the way it does: you are travelling
 * sideways and backwards past somebody while still looking where you were
 * looking. On the Prowl asks for a half of one in three beats, twice, once
 * round a neighbour and once round a partner.
 *
 * So it is an `arc` about the pair's own centre with `facing: { kind: "held" }`
 * — the same curve a california twirl walks, with the body *not* carried round
 * by it. Which way round is `direction`, and how far is `amount`; the ends fall
 * out of both, which is what the polar expression below says.
 *
 * (unsure: a mad robin is most often taught as the robins circulating while the
 * larks stand, and the corpus writes it both ways. This dances whoever `pairs`
 * names, both of them, which is what On the Prowl's "mad robin clockwise 1/2
 * around neighbor" reads as and what makes the half a progression rather than a
 * decoration. G2 should settle whether a one-sided mad robin wants a `who`.)
 */

/** Which way round the pair goes: clockwise is the way a circle left travels. */
const SPIN: NumberExpr = {
  number: "select",
  on: "direction",
  cases: { clockwise: 1, counterclockwise: -1 },
};

/** How far round, in signed degrees. */
const SWEEP: AngleExpr = { number: "mul", of: [360, { param: "amount" }, SPIN] };

/** The point between the pair, which is what they circulate about. */
const CENTRE: PointExpr = {
  point: "midpoint",
  a: { point: "start", role: { role: "self" } },
  b: { point: "start", role: { role: "mate" } },
};

/** Mad robin, as a figure definition. */
export const madRobinDefinition: FigureDefinition = {
  id: "mad-robin",
  call: "MAD ROBIN",
  describe:
    "Circle round the dancer you are dancing this with, one of you passing in front and the other behind, and do not turn round: keep facing exactly the way you were facing the whole way. Half way leaves you on each other's places, still looking the same way; all the way brings you home. Nobody takes hands. (unsure: many callers teach this as the robins circulating while the larks stand still.)",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: { pairs: "neighbors", amount: 0.5, direction: "clockwise" },
  },
  shape: {
    kind: "path",
    pairing: { kind: "param", param: "pairs" },
    track: {
      // Where the circle leaves you: the same distance from the pair's centre,
      // turned by the sweep. A half lands on the other dancer's place and a
      // whole one comes home, and neither is written down as a special case.
      ends: {
        p: {
          point: "polar",
          centre: CENTRE,
          angle: {
            angle: "sum",
            of: [
              { angle: "bearing", from: CENTRE, to: { point: "start", role: { role: "self" } } },
              SWEEP,
            ],
          },
          radius: {
            number: "distance",
            from: CENTRE,
            to: { point: "start", role: { role: "self" } },
          },
        },
        // Facing is untouched: that is the figure.
        facing: { angle: "facingOf", role: { role: "self" }, at: "start" },
      },
      curve: { kind: "arc", sweep: SWEEP },
      facing: { kind: "held" },
      idleHands: { kind: "down" },
    },
    // Whoever the pairing left out stands where they are while it goes on
    // around them.
    idle: { idleHands: { kind: "down" }, amp: 0 },
  },
  holds: [],
  ends: "relative",
  // A walk round a circle: extra beats buy **distance** on the floor rather than
  // a slower turn, because the body is not turning at all.
  timing: { stretch: "distance", profile: "smooth" },
  // Clockwise and counterclockwise are each other's mirror image, and nothing
  // else about the figure is handed: the bodies never turn.
  symmetry: {
    mirror: {
      kind: "parameters",
      words: { direction: { clockwise: "counterclockwise", counterclockwise: "clockwise" } },
    },
  },
};
