import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Pass through**, as data: walk past the dancer opposite and keep going,
 * right shoulders.
 *
 * The simplest path there is — `@caller/choreo`'s own walk, bowed to each
 * dancer's own left, which in this coordinate system is what puts right
 * shoulders together — and the figure that shows what a *pairing* is for. Who
 * you pass is not written down: `"across"` pairs each dancer with the one on
 * the other side of the set and `"along"` with the one up or down the line, and
 * both are read off where the dancers actually stand. So the same written
 * figure passes a becket line through and a duple improper line along without
 * either being a special case.
 */
export const passThroughDefinition: FigureDefinition = {
  id: "pass-through",
  call: "PASS THROUGH",
  describe:
    "Walk forward past the dancer opposite you, passing right shoulders, and stop on the other side without turning round. Four beats. Whatever comes next is what tells you which way to face.",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: { direction: "across", bowPx: DEFAULT_BOW_PX } },
  shape: {
    kind: "path",
    pairing: { kind: "opposite", axis: { param: "direction" } },
    track: {
      // Their place, faced along the way you walked to get there.
      ends: {
        p: { point: "start", role: { role: "mate" } },
        facing: {
          angle: "bearing",
          from: { point: "start", role: { role: "self" } },
          to: { point: "start", role: { role: "mate" } },
        },
      },
      curve: { kind: "walkStep", bow: { param: "bowPx" } },
      facing: { kind: "curve" },
      idleHands: { kind: "down" },
      stepRate: { when: "moving" },
      amp: { when: "moving" },
    },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "cruise" },
  // The bow is a handedness and it is easy to miss: two dancers pass **right**
  // shoulders when each bows to their own left, so in a mirror the same bow
  // passes them left shoulders and the number has to change sign.
  symmetry: { mirror: { kind: "parameters", signs: ["bowPx"] } },
};
