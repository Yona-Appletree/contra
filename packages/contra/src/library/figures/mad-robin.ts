import type { AngleExpr, FigureDefinition, NumberExpr, PointExpr } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Mad robin**, as data: a sideways do-si-do, danced looking across the set.
 *
 * The user, on the Moves page:
 *
 * > "also totally wrong. you're facing someone across the set. you and them
 * > orbit sideways around the person next to you, staying looking at the person
 * > across the set. often called a sideways do-si-do while looking across the
 * > set."
 *
 * Three sentences, and they name three separate things:
 *
 * 1. **Who you go round** is the dancer *beside* you — in a long line, your
 *    neighbour up or down it — and you go round them the way a do-si-do does,
 *    on the circle whose diameter is the two of you. That is `pairs`, and it is
 *    what On the Prowl's *"mad robin clockwise 1/2 around neighbor"* names. It
 *    has not moved.
 * 2. **Which way your body points** is *across the set*, and that is the whole
 *    figure. It was `held` — whatever you happened to be facing — which on the
 *    Moves page meant a set standing in its own hands-four places danced the
 *    whole figure looking **up and down the line at the very dancer it was
 *    going round**. So the facing is written down now instead of inherited: the
 *    bearing from where you stand to the set's own midline, abeam of you, which
 *    is `long-lines`' own idiom and comes out right on both lines and in either
 *    formation. A dancer already standing across the set is not turned at all —
 *    On the Prowl's A2 mad robin is unchanged to the last pixel — and one who
 *    is not turns on to it over the first beat and then holds it.
 * 3. **You do not turn again.** Once across, the facing is pinned there for the
 *    whole figure: you travel forward past your neighbour, sideways along the
 *    line, and backwards behind them, still looking at the same person.
 *
 * `direction` says which way round and `amount` how far; the ends fall out of
 * both, which is what the polar expression below says.
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

/**
 * **Straight across the set from where I stand**: the set's own midline, abeam
 * of me.
 *
 * `x` is across the set and `y` along it in the frame's local axes, so the
 * anchor's across-coordinate at my own along-coordinate is the point opposite
 * me — and the dancer across the set is standing on or near it. Long lines is
 * written in the same sentence.
 */
const ACROSS: AngleExpr = {
  angle: "bearing",
  from: { point: "start", role: { role: "self" } },
  to: { point: "compose", x: { point: "anchor" }, y: { point: "start", role: { role: "self" } } },
};

/** How long a dancer who is not already across the set takes to turn on to it. */
const SETTLE: NumberExpr = {
  number: "min",
  of: [1, { number: "mul", of: [{ number: "beats" }, 1 / 3] }],
};

/** Mad robin, as a figure definition. */
export const madRobinDefinition: FigureDefinition = {
  id: "mad-robin",
  call: "MAD ROBIN",
  describe:
    "Look straight across the set, at the dancer opposite you, and keep looking at them: that is the whole figure. Now circle round the dancer beside you the way a do-si-do goes — forward and past them on one side, sideways along the line, back behind them on the other — without ever turning your body. It is a sideways do-si-do, danced looking across the set. Half way leaves you on their place, still looking across; all the way brings you home. Nobody takes hands.",
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
        // Still looking straight across the set: that is the figure.
        facing: ACROSS,
      },
      curve: { kind: "arc", sweep: SWEEP },
      // On to the across-the-set facing over the first beat, and pinned there:
      // a dancer the dance already left facing across is not turned at all.
      facing: { kind: "settle", beats: SETTLE },
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
  // else about the figure is handed: "across the set" is a direction a mirror
  // maps on to itself.
  symmetry: {
    mirror: {
      kind: "parameters",
      words: { direction: { clockwise: "counterclockwise", counterclockwise: "clockwise" } },
    },
  },
};
