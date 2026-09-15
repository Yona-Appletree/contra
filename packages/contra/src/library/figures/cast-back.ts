import type { AngleExpr, FigureDefinition, PointExpr } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Cast back** (M8): turn away from the middle of the set and walk round into
 * the place behind you along your own line.
 *
 * Fatal Attraction's A2: *"(2) Women cast back || Men go forward"*. 644 corpus
 * dances cast; this is the one that goes **backwards** along the line rather
 * than round a dancer standing still, which is why it is its own figure and not
 * `cast-off` with a sign.
 *
 * ## It is a cast, so it goes outside
 *
 * The same thing that makes `cast-off` a cast: you turn away from the centre of
 * the set and go round the **outside** of your own line rather than through it.
 * The route says so in slots rather than in pixels, because which way "outside"
 * is differs between the two lines and no angle written down can be right for
 * both — the outward bearing is from the place across the set to my own.
 *
 * ## Which way "back" is
 *
 * A slot's `along` counts **the way that dancer travels**, so `along: -1` is one
 * dancing place *behind* you whichever line you are on and whichever way round
 * the set you are going. The facing is unchanged: a cast back leaves you looking
 * the way you were looking, which is what makes it a two-beat adjustment rather
 * than a figure.
 */

/** The direction from the place across the set to mine: straight out of the line. */
const OUTWARD: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "other", along: 0 },
  to: { point: "slot", line: "same", along: 0 },
};

/** Half a place behind me, stepped `outPx` outside the line: the top of the cast. */
const ROUND: PointExpr = {
  point: "offset",
  from: { point: "slot", line: "same", along: -0.5 },
  along: OUTWARD,
  distance: { param: "outPx" },
};

/** The facing I keep throughout: the one I came in with. */
const KEEP: AngleExpr = { angle: "facingOf", role: { role: "self" }, at: "start" };

/** Out of the line, round, and back one place. */
const track: readonly PathStep[] = [
  {
    at: { fromEnd: { number: "mul", of: [{ number: "beats" }, 0.5] } },
    pose: { p: ROUND, facing: KEEP },
  },
  {
    at: { fromEnd: 0 },
    pose: { p: { point: "slot", line: "same", along: -1 }, facing: KEEP },
  },
];

/** Cast back, as a figure definition. */
export const castBackDefinition: FigureDefinition = {
  id: "cast-back",
  call: "CAST BACK",
  describe:
    "On your own, turn away from the middle of the set and walk round the outside of your own line into the place one behind you, still looking the way you were looking. Nobody's hand, and nobody goes with you: whoever was in that place has moved on.",
  lead: 2,
  nominalBeats: 2,
  roles: ["one"],
  actors: "each",
  anchor: "centroid",
  params: {
    kind: "canonical",
    defaults: {
      /**
       * How far outside the line the cast goes, px.
       *
       * `cast-off`'s own number, for the same reason: it is the distance that
       * clears the line you are going round.
       */
      outPx: 10,
    },
  },
  shape: { kind: "waypoints", tracks: { "*": [track[0]!, track[1]!] } },
  holds: [],
  // **`ends: "relative"`**, for `promenade`'s reason: a cast back after a
  // promenade round the major set is nowhere near the four places its own minor
  // set has, and settling on them takes the promenade's travel away again.
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};
