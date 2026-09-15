import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { AngleExpr, FigureDefinition, PointExpr } from "../FigureDefinition.js";
import { LANE_ROLES } from "../../set/resolve.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Circulate** (M7, handed over from M6): everybody moves one place along the
 * box, the larks across the set and the robins round the end of their own line.
 *
 * Whoosh's A2 — *"Circulate: Men cross, women loop right"* — and the figure M6
 * could not write. Its report says exactly why, and it is worth quoting, because
 * this definition is the answer:
 *
 * > "Men cross, women loop right" is a figure whose destinations are **lattice
 * > places**: the lark ends across the set and one place along, the robin one
 * > place along her own line. The expression calculus has no `PointExpr` for a
 * > slot … and in a lane instance the roles are the dancers' own slot names, so a
 * > definition cannot name the dancer whose place it is walking to. Every way of
 * > faking it is wrong for one of the two lines, because "across the set" is `+x`
 * > for one line and `−x` for the other and no expression can see which.
 *
 * With `{ point: "slot" }` the two destinations are two sentences, and both come
 * out right on both lines:
 *
 * - a lark goes to `{ line: "other", along: 0 }` — straight across the set;
 * - a robin goes to `{ line: "same", along: 1 }` — one place on, her own line.
 *
 * `along` counts positions **the way the dancer travels**, which is what makes
 * the two halves of a line circulate the same way round the box rather than into
 * each other.
 *
 * ## Why the lark does not also move along
 *
 * Because everybody would land on top of somebody. A line of the lattice
 * alternates larks and robins, so if both crossed *and* moved along, the lark
 * coming across from the other line and the robin looping along this one would
 * claim the same slot — measured, before the arithmetic was corrected, as two
 * dancers 0.000 px apart. The box is four places, two on each line, and a
 * circulate turns it one place round: two dancers cross it and two walk the
 * length of it, which is exactly what "men cross, women loop right" says.
 *
 * ## The lark crosses and the robin loops
 *
 * The difference is not only where they end but how they get there. A lark walks
 * straight across, bowed to their own left, so two larks crossing pass right
 * shoulders. A robin has nowhere to walk straight to — her place is one along her
 * own line with somebody standing in it until they move — so she loops out of
 * the line, round and back in, which is the waypoint's own `around` about a
 * centre one radius off her shoulder.
 */

/** A place of the box: straight across the set, or one along my own line. */
const destination = (line: "same" | "other"): PointExpr => ({
  point: "slot",
  line,
  along: line === "other" ? 0 : 1,
});

/** Facing: keep the way you were looking. A circulate turns nobody round. */
const KEEP: AngleExpr = { angle: "facingOf", role: { role: "self" }, at: "start" };

/** Straight across the set, bowed to your own left so two crossing pass right. */
const cross: readonly PathStep[] = [
  { at: { fromEnd: 0 }, pose: { p: destination("other"), facing: KEEP }, bow: DEFAULT_BOW_PX },
];

/**
 * Out of the line, round, and in again one place along.
 *
 * The centre of the loop is `radius` px off the shoulder named by `hand`, so
 * "loop right" really is a loop to the dancer's right; the sweep is a half turn,
 * which is what carries a body from one place to the next one along without
 * walking through anybody standing in between.
 */
const loop: readonly PathStep[] = [
  {
    at: { fromEnd: 0 },
    pose: { p: destination("same"), facing: KEEP },
    around: {
      centre: {
        point: "offset",
        from: {
          point: "midpoint",
          a: { point: "start", role: { role: "self" } },
          b: destination("same"),
        },
        along: {
          angle: "bearing",
          from: { point: "slot", line: "other", along: 0 },
          to: { point: "slot", line: "same", along: 0 },
        },
        distance: { param: "radius" },
      },
      turn: { number: "mul", of: [180, { number: "select", on: "hand", cases: { L: -1, R: 1 } }] },
    },
  },
];

/** Circulate, as a figure definition. */
export const circulateDefinition: FigureDefinition = {
  id: "circulate",
  call: "CIRCULATE",
  describe:
    "Everybody moves one place along the box, all at the same time. The larks cross straight over the set, passing right shoulders, and the robins loop out of their own line and back into it one place along. You end in the same wave you started in, with different people beside you.",
  lead: 4,
  nominalBeats: 4,
  roles: [LANE_ROLES],
  actors: "line",
  anchor: "lane",
  params: {
    kind: "canonical",
    defaults: {
      /** Which way the looping role loops. */
      hand: "R",
      /** How far outside the line the loop bulges, px. */
      radius: 6,
    },
  },
  shape: { kind: "waypoints", tracks: { lark: cross, robin: loop } },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};
