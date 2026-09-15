import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { FigureDefinition, NumberExpr } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Pull by**: give one hand, walk past each other, and let go.
 *
 * The smallest travelling figure there is, and the one the whole of M6's lane
 * rests on: two dancers exchange places along the set, so a pull-by with N1 and
 * a pull-by with N3 are the same figure danced with different people, and the
 * only thing that decides which is the relation the call names.
 *
 * The hand you give is the shoulder you pass: right hands means right
 * shoulders, which means each dancer bows to their own **left** on the way
 * through ({@link DEFAULT_BOW_PX}, the same number `pass-through` uses). The
 * ends are `"relative"` — you end where the other dancer was, which is the
 * point — and the figure gathers nobody on to anything.
 */

/** Which way to bow: right hands pass right shoulders, so you bow to your left. */
const BOW: NumberExpr = {
  number: "select",
  on: "hand",
  cases: { L: -DEFAULT_BOW_PX, R: DEFAULT_BOW_PX },
};

/** Walk to where the other one is standing, looking the way you are going. */
const stepTo = (other: "a" | "b"): PathStep => ({
  at: { fromEnd: 0 },
  pose: {
    p: { point: "start", role: other },
    facing: {
      angle: "bearing",
      from: { point: "start", role: { role: "self" } },
      to: { point: "start", role: other },
    },
  },
  bow: BOW,
  pass: { param: "hand" },
  drop: { param: "holdDrop" },
});

/** Pull by, as a figure definition. */
export const pullByDefinition: FigureDefinition = {
  id: "pull-by",
  call: "PULL BY",
  describe:
    "Give the named hand to the dancer coming toward you, walk straight past them passing that shoulder, and let go as you go by. You end where they were standing and they end where you were; do not turn round.",
  lead: 2,
  nominalBeats: 2,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  params: { kind: "canonical", defaults: { pairs: "neighbors", hand: "R", holdDrop: 2 } },
  shape: {
    kind: "waypoints",
    tracks: { a: [stepTo("b")], b: [stepTo("a")] },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};
