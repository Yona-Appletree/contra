import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Do-si-do**, as data: pass right shoulders, round back to back, and come
 * back — or carry on round and a half to change places.
 *
 * The path is an **ellipse**, not a circle, and that is the whole of what F4
 * changed: its long radius is the pair's own half separation, so each dancer
 * still walks through the other's place, and its short radius is one bow, so
 * half way out they are 10 px apart, shoulder to shoulder, moving opposite
 * ways. The circle this used to be held them at a constant 20.2 px — two people
 * orbiting a point they never got near, which is not a do-si-do.
 *
 * Hands stay down and neither body turns; only the head follows the partner
 * round, which is `{ look: "opposite" }` — the point opposite you through the
 * centre of your own ellipse, which is exactly where your partner is at every
 * instant of it.
 *
 * It takes the **whole minor set** in one instance, and not because everybody
 * dances: "robins right shoulder round once and a half" leaves the two larks
 * standing at the corners, 18.87 px from the robins' own centre, and a circle
 * through both robins would pass 2.9 px inside them. The ellipse has to see
 * them to clear them.
 */

/** The arm swing fades up at the start and out at the end, so a seam never jumps. */
const SWING_IN = 0.6;
const SWING_OUT = 0.6;

/** Do-si-do, as a figure definition. */
export const doSiDoDefinition: FigureDefinition = {
  id: "do-si-do",
  call: "DO-SI-DO",
  describe:
    "Walk forward and pass right shoulders, slide across back to back without turning, then walk backward to place passing left shoulders. Nobody takes hands and nobody turns around — you face the same way for the whole eight beats. Once round for a plain do-si-do, once and a half where the dance says so.",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: { pairs: "neighbors", amount: 1, passPx: 5, endHalf: null },
  },
  shape: {
    kind: "path",
    pairing: { kind: "param", param: "pairs" },
    track: {
      // The ellipse works its own ends out: they fall out of the clearance it
      // has to solve for anyway.
      curve: {
        kind: "ellipse",
        turn: { number: "mul", of: [360, { param: "amount" }] },
        pass: { param: "passPx" },
        clearance: CLEARANCE_PX,
        // The call may say how far from the centre the pair ends, or leave it
        // `null` to take it off the formation's own places — which is what
        // every dance does.
        endHalf: { param: "endHalf" },
      },
      facing: { kind: "held" },
      idleHands: { kind: "hanging", swing: 1, fadeIn: SWING_IN, fadeOut: SWING_OUT },
      look: { look: "opposite" },
    },
    // A dancer the pairing leaves out stands still while the circle goes round
    // them, hands swinging exactly as everybody else's.
    idle: { idleHands: { kind: "hanging", swing: 1, fadeIn: SWING_IN, fadeOut: SWING_OUT } },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "trapezoid" },
  // A do-si-do passes **right** shoulders first, so its mirror image goes round
  // the other way — `amount` signed — and passes left shoulders, which is a
  // "left shoulder round" and a figure callers really do ask for.
  symmetry: { mirror: { kind: "parameters", signs: ["amount"] } },
};
