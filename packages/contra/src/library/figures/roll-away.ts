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
 *
 * ## Nose to nose first (FR-A1)
 *
 * The user, on the Moves page:
 *
 * > "people should always turn inward so they go nose to nose first."
 *
 * The roll is **inward**, always: the first quarter of the turn brings the
 * roller's face round on to the dancer she is rolling away from, and only then
 * does she carry on past. Until now the turn was a signed parameter, `spins: 1`
 * for everybody, and `1` is the wrong way round for a robin whose partner
 * stands on her left — which, in a duple improper minor set, is every one of
 * them: the measured turn went to her **right**, away from him, so the first
 * thing the couple showed each other was the back of her head.
 *
 * So `spins` is a magnitude now and the sign is read off the floor —
 * `spin.toward` (`kinds/path.ts`) — which also retires the `signs: ["spins"]`
 * mirror entry: reflect the arrangement and the partner is on the other side,
 * so the roll turns the other way of its own accord.
 */

/** `+1` for the dancer who rolls across in front, `−1` for the one who slides. */
const ROLLER: NumberExpr = { number: "ifRole", role: "roller", then: 1, else: -1 };

/** Roll away with a half sashay, as a figure definition. */
export const rollAwayDefinition: FigureDefinition = {
  id: "roll-away",
  call: "ROLL AWAY WITH A HALF SASHAY",
  describe:
    "Take your partner's near hand. The robin rolls across in front of the lark, turning inward — nose to nose with him first, then on round once — while the lark slides sideways into the place she came out of. You have traded places and you are both still facing the way you were. Four beats, hands joined through the roll.",
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
        // She turns once round as she goes, inward — nose to nose with him
        // first — and he simply slides.
        spin: {
          turns: { param: "spins" },
          who: { role: "roller" },
          from: 0.8,
          toward: { role: "mate" },
        },
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
  timing: { stretch: "distance", profile: "cruise" },
  symmetry: {
    // Which of the couple passes in front is the role the call names, not a
    // handedness — and her turn is not a parameter at all any more: it is
    // inward, toward whoever she is rolling away from, so a mirror flips it by
    // moving him to her other side. Nothing here is left to flip.
    mirror: { kind: "parameters" },
    // "Larks roll away with the robins" is this same figure with one word
    // changed, which is what a role swap is for.
    roles: ["roller"],
  },
};
