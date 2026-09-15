import type { FigureDefinition, NumberExpr } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Roll away with a half sashay**, as data: the couple trades places, one
 * rolling across in front while the other slides behind, and both keep facing
 * the way they were.
 *
 * A bowed walk whose bow has a **sign**: the roller passes in front and the
 * other behind, so the two of them never share a point. Which of them rolls is
 * a question about the dancer's contra role rather than about their part in the
 * figure, which is `{ number: "ifRole" }`.
 *
 * The hands are joined to start the roll and let go as it turns, because a
 * dancer spinning a whole turn cannot keep a hand on a point ten px away and
 * still have an arm that reaches it.
 */

/** `+1` for the dancer who rolls across in front, `−1` for the one who slides. */
const ROLLER: NumberExpr = { number: "ifRole", role: "roller", then: 1, else: -1 };

/** Roll away with a half sashay, as a figure definition. */
export const rollAwayDefinition: FigureDefinition = {
  id: "roll-away",
  call: "ROLL AWAY WITH A HALF SASHAY",
  describe:
    "Take your partner's near hand. The robin rolls across in front of the lark, turning once round as she goes, while the lark slides sideways into the place she came out of. You have traded places and you are both still facing the way you were. Four beats, hands joined through the roll.",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: { pairs: "partners", roller: "robin", bowPx: 4.5, spins: 1, holdDrop: 6 },
  },
  shape: {
    kind: "path",
    pairing: { kind: "param", param: "pairs" },
    track: {
      // Their place, still facing the way you were.
      ends: {
        p: { point: "start", role: { role: "mate" } },
        facing: { angle: "facingOf", role: { role: "self" }, at: "start" },
      },
      curve: { kind: "bowed", bow: { param: "bowPx" }, sign: ROLLER },
      facing: {
        kind: "held",
        // She turns once round as she goes; he simply slides.
        spin: { turns: { param: "spins" }, who: { role: "roller" }, from: 0.8 },
      },
      idleHands: { kind: "down" },
      flare: { number: "ifRole", role: "roller", then: 2.2, else: 0 },
    },
    // A pairing that leaves somebody out leaves them standing.
    idle: { idleHands: { kind: "down" }, amp: 0 },
  },
  holds: [
    {
      kind: "mate",
      side: { nearest: { role: "mate" }, facing: "start" },
      point: { kind: "midpoint" },
      drop: { param: "holdDrop" },
      window: {
        kind: "ramps",
        takeFrom: 0,
        takeTo: 0.6,
        // The hold is gone before the spin is far enough round to tear an arm
        // off it, whatever count the card gives the figure.
        releaseFrom: {
          number: "min",
          of: [1.2, { number: "mul", of: [{ number: "beats" }, 1 / 3] }],
        },
        releaseTo: { number: "min", of: [2, { number: "mul", of: [{ number: "beats" }, 1 / 2] }] },
      },
    },
  ],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  symmetry: {
    // Which of the couple passes in front is the role the call names, not a
    // handedness. Her turn is: she rolls *away* from him, so in a mirror she
    // turns the other way round.
    mirror: { kind: "parameters", signs: ["spins"] },
    // "Larks roll away with the robins" is this same figure with one word
    // changed, which is what a role swap is for.
    roles: ["roller"],
  },
};
