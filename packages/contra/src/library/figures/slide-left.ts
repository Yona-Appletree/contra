import type { AngleExpr, FigureDefinition, NumberExpr } from "../FigureDefinition.js";
import { PLACE_PITCH_PX } from "../../formation/dupleImproper.js";
import { STEP_BEATS } from "../../figures/slide-left.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Slide left**, as data: the whole line sashays one couple's width along to
 * its own left.
 *
 * Becket's progression, and the only figure in the library whose ends leave the
 * group's own frame — which is exactly what a becket time through does.
 *
 * **It is a sidestep, not a walk round.** A becket couple stays square to the
 * couple across the set for the whole of it: you keep your place in the line
 * and in the couple and simply find a new couple in front of you. So the body
 * never turns, unlike every other travelling figure here, which turns toward
 * its travel. What it does instead is **step, twice** — a slide left is called
 * in two beats and danced in two steps, "and slide, two" — and glance along the
 * line it is travelling down.
 *
 * **One couple in an odd line does something else** (S2), and it is an end
 * effect rather than a second reading of the figure: an odd becket line has
 * only one waiting place, so at the end that has none the couple that runs out
 * of line crosses straight over, and this figure is what carries them. That is
 * {@link PathShape.crossing}; everybody else in their minor set slides pose for
 * pose exactly as they always did.
 */

/**
 * How far off the facing a dancer looks along the line they are travelling.
 *
 * The torso stays square, so this is only the head. The renderer's neck limit
 * turns a full 90° glance into about 23° of actual head turn, which is a dancer
 * glancing along the line rather than looking over their shoulder.
 */
const GLANCE_DEG = 90;

/**
 * How far a couple crossing the set turns during the shift, degrees.
 *
 * Half a turn, and the sign matters: `+180` in this frame sweeps a becket
 * dancer's facing through "down the set", so the couple crossing over at the
 * top of an odd line looks *into* the set as it goes rather than out of the
 * hall.
 */
const TURN_DEG = 180;

/** A quarter turn to the dancer's own left, or right, by `direction`. */
const QUARTER: NumberExpr = { number: "mul", of: [-90, { param: "direction" }] };

/** The way this dancer slides: a quarter off the way they are facing. */
const ALONG: AngleExpr = {
  angle: "sum",
  of: [{ angle: "facingOf", role: { role: "self" }, at: "start" }, QUARTER],
};

/** Slide left, as a figure definition. */
export const slideLeftDefinition: FigureDefinition = {
  id: "slide-left",
  call: "SLIDE LEFT ALONG THE SET",
  describe:
    "In a becket dance the whole line slides one couple's width along to its own left, so you find yourselves facing a new couple. It is a sidestep, not a walk round: you stay square to the couple across the set and to your own partner beside you, take two steps sideways along the line — one to the beat, one to the next — and glance the way you are going. The whole line moves together. This is the becket progression, and it is what the dance's last figure sets up.",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: { alongPx: PLACE_PITCH_PX, direction: 1 } },
  shape: {
    kind: "path",
    // Everybody's path is their own: nobody is paired with anybody.
    pairing: { kind: "none" },
    track: {
      ends: {
        p: {
          point: "offset",
          from: { point: "start", role: { role: "self" } },
          along: ALONG,
          distance: { param: "alongPx" },
        },
        facing: { angle: "facingOf", role: { role: "self" }, at: "start" },
      },
      curve: { kind: "stepped", stepBeats: STEP_BEATS },
      facing: { kind: "held" },
      idleHands: { kind: "down" },
      // The head leads and comes back, so the glance starts and ends on the
      // plain facing and no seam has to blend a turned head.
      look: {
        look: "glance",
        amount: { number: "mul", of: [-GLANCE_DEG, { param: "direction" }] },
      },
      stepRate: 1,
      amp: 1,
    },
    crossing: {
      turn: TURN_DEG,
      stepBeats: STEP_BEATS,
      idleHands: { kind: "down" },
      stepRate: 1,
      amp: 1,
    },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  // A slide right is a slide left in a mirror — the travel and the glance both
  // follow `direction`. The crossing couple's own half turn does not, and it
  // does not have to: `crossedOver` is an end effect of an odd becket line and
  // never happens in a plain minor set, which is where the property is read.
  symmetry: { mirror: { kind: "parameters", signs: ["direction"] } },
};
