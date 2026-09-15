import type { AngleExpr, FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **California twirl**, as data: the couple trades places under a raised arch
 * and comes out facing the other way.
 *
 * The pair turns as one about the point between them, so the arch — their two
 * joined inside hands — stays one floor point over that centre and both bodies
 * come round with it. That is the `arc` curve with `facing: { kind: "withArc" }`:
 * the body turns by exactly the sweep the feet do, which is what "as one" means
 * and is why nothing here interpolates a hand.
 *
 * The two places a twirl ends on are the same either way round — it is half a
 * turn about a point — but the arc between them is not, and at the end of a
 * line the wrong arc reaches into the couple crossing over, so `direction` is a
 * parameter and a dance that needs the other arc says so.
 */

/** Half a turn, the way `direction` says. */
const HALF: AngleExpr = { number: "mul", of: [180, { param: "direction" }] };

/** California twirl, as a figure definition. */
export const californiaTwirlDefinition: FigureDefinition = {
  id: "california-twirl",
  call: "CALIFORNIA TWIRL",
  describe:
    "Take inside hands with your partner and raise them, then walk forward: one of you walks round the outside while the other turns under the arch, so the two of you trade places and end facing back the way you came. Four beats, hands joined the whole way through. (unsure: which of the two turns under varies from hall to hall; this turns the robin under.)",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: { pairs: "partners", holdDrop: 0, direction: 1 } },
  shape: {
    kind: "path",
    pairing: { kind: "param", param: "pairs" },
    track: {
      // Their place, facing back the way you came.
      ends: {
        p: { point: "start", role: { role: "mate" } },
        facing: {
          angle: "sum",
          of: [{ angle: "facingOf", role: { role: "self" }, at: "start" }, HALF],
        },
      },
      curve: { kind: "arc", sweep: HALF },
      facing: { kind: "withArc" },
      idleHands: { kind: "down" },
    },
    idle: { idleHands: { kind: "down" }, amp: 0 },
  },
  holds: [
    {
      // The arch: both inside hands on one floor point over the pair's centre.
      kind: "mate",
      side: { nearest: { role: "mate" }, facing: "start" },
      point: { kind: "joinPoint" },
      drop: { param: "holdDrop" },
      window: { kind: "holdWindow", take: 1, release: 1 },
    },
  ],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  // The two places a twirl ends on are the same either way round; the arc
  // between them is the mirror image, which is `direction`.
  symmetry: { mirror: { kind: "parameters", signs: ["direction"] } },
};
