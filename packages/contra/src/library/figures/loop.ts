import type { AngleExpr, FigureDefinition, NumberExpr, PointExpr } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Loop** (M7, handed over from M6): walk a small circle by yourself and come
 * back to where you started.
 *
 * Are You 'Most Done?'s *"men allemande right 1 || women loop right"* and the
 * robins' half of Whoosh's circulate. Like `turn-alone` it is danced by nobody
 * but you — `actors: "each"` — and unlike it you actually go somewhere: round a
 * circle whose centre is one radius off your own shoulder.
 *
 * ## Which circle
 *
 * The centre is `radius` px to the named side of where you stand, so the circle
 * is the one you would walk if you simply curved that way and kept curving. That
 * makes `hand: "R"` "loop right" in the caller's sense — you turn to your right
 * and come back — and it is why the sweep's sign is the hand's: with the centre
 * on your right, walking forward carries you the way the angles increase.
 */

/** Which way round the circle: to your right is the way the angles increase. */
const SPIN: NumberExpr = { number: "select", on: "hand", cases: { L: -1, R: 1 } };

/** The centre of the loop: one radius off the named shoulder. */
const CENTRE: PointExpr = {
  point: "offset",
  from: { point: "start", role: { role: "self" } },
  along: {
    angle: "sum",
    of: [
      { angle: "facingOf", role: { role: "self" }, at: "start" },
      { number: "mul", of: [SPIN, 90] },
    ],
  },
  distance: { param: "radius" },
};

/** How far round, signed degrees. */
const SWEEP: AngleExpr = { number: "mul", of: [{ param: "amount" }, 360, SPIN] };

/** Ride the circle all the way round and stop where you began. */
const step: PathStep = {
  at: { fromEnd: 0 },
  pose: {
    p: { point: "start", role: { role: "self" } },
    facing: {
      angle: "sum",
      of: [{ angle: "facingOf", role: { role: "self" }, at: "start" }, SWEEP],
    },
  },
  around: { centre: CENTRE, turn: SWEEP },
  spin: SWEEP,
};

/** Loop, as a figure definition. */
export const loopDefinition: FigureDefinition = {
  id: "loop",
  call: "LOOP",
  describe:
    "On your own, walk a small circle to the named side — right unless the caller says left — turning as you go, and come back to the place you started from facing the way you were. Nobody's hand: this is a figure you dance by yourself while somebody else is dancing theirs.",
  lead: 2,
  nominalBeats: 4,
  roles: ["one"],
  actors: "each",
  anchor: "centroid",
  params: {
    kind: "canonical",
    defaults: {
      /** Which way you loop: right unless the caller says. */
      hand: "R",
      /** Whole turns round the circle. */
      amount: 1,
      /**
       * How wide the circle is, px.
       *
       * A loop has to fit inside the place you are standing in, and a dancing
       * place is {@link PLACE_PITCH_PX} = 20 px along the set, so five px of
       * radius is a circle ten across — a loop rather than an excursion.
       */
      radius: 5,
    },
  },
  shape: { kind: "waypoints", tracks: { "*": [step] } },
  holds: [],
  ends: "relative",
  timing: { stretch: "pace", profile: "smooth" },
};
