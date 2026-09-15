import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { AngleExpr, FigureDefinition, PointExpr } from "../FigureDefinition.js";
import { LANE_ROLES } from "../../set/resolve.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **The box circulate** (M7, rebuilt to the user's words in FR-B1, DD43): from
 * long wavy lines, the four places of a box turn one place round, and nobody
 * changes minor set.
 *
 * The user, on the Moves page (2026-09-15 08:20 and 09:20):
 *
 * > "I only know 'box-circulate' which this is not."
 *
 * > "**box-circulate** — everyone is in long wavy lines up and down the set.
 * > alternating face in, face out. the people facing out orbit around to face in
 * > while the ones facing in walk across the set. **you stay in your current
 * > minor set.**"
 *
 * Three sentences, and each is one thing this definition says:
 *
 * - **The box is the minor set's own four places**, two on each line, and a
 *   circulate turns them one place round. Two dancers cross it and two walk the
 *   length of it, which is the only way four places rotate by one without
 *   anybody walking through anybody: a crosser's place is taken by a looper and
 *   a looper's by a crosser, all the way round the box. So the destinations are
 *   the two the lattice can name and nothing else — `{ line: "other", along: 0 }`
 *   straight across, and `{ line: "same", along: 1 }` the other place of the box
 *   on your own line.
 * - **`along` counts the way the dancer travels**, which is what keeps everybody
 *   inside their own box. The two couples of a minor set travel opposite ways,
 *   so one place "on" is the *same* pair of places read from either end: the
 *   dancer at the top of the box going down and the dancer at the bottom going
 *   up each name the other's place, and neither of them names the next minor
 *   set's.
 * - **Which route you dance is which way you are looking**, not which role you
 *   are. In a long wave the dancers alternate facing in and facing out, the ones
 *   facing in walk straight across, and the ones facing out loop round to face
 *   in. Which role is which is the wave's own clause — Whoosh's *"men face in"* —
 *   so it is the same `facesIn` parameter `balance-wave` reads, and
 *   {@link WaypointShape.by} is what routes the two tracks off it.
 *
 * ## What changed from M7's circulate
 *
 * M7 hard-wired the two routes to the two **contra roles** — the larks crossed
 * and the robins looped, because Whoosh's card says *"Men cross, women loop
 * right"* — and left everybody's facing exactly as it was. Both are wrong away
 * from Whoosh's own wave: a wave with the robins facing in circulates the other
 * way round, and a dancer who loops out of the line and back into it is facing
 * **in** when they arrive, which is what makes the wave a wave again. The
 * geometry of the box is unchanged, and Whoosh's own circulate is the same four
 * places with the two facings corrected.
 *
 * ## The progression is taken at the start
 *
 * Whoosh's card writes the circulate `[with N2]`, and the user's rule of
 * 2026-09-15 09:25 is what settles it: *"you absolutely can progress as that
 * card assumes… progressing at the start of any move in long (wavy) lines is
 * valid."* So the box is formed with the next neighbour and the shift happens
 * before the call, which is `"progresses": "start"` on the call and not anything
 * in this figure (`set/planCycle.ts`, DD43). No figure reads it and none should.
 */

/** A place of the box: straight across the set, or the other place on my line. */
const destination = (line: "same" | "other"): PointExpr => ({
  point: "slot",
  line,
  along: line === "other" ? 0 : 1,
});

/** Facing: keep the way you were looking. A crossing turns nobody round. */
const KEEP: AngleExpr = { angle: "facingOf", role: { role: "self" }, at: "start" };

/**
 * **Facing in, from the place you loop to**: straight across the set at the
 * dancer who will be opposite you there.
 *
 * The other half of *"the people facing out orbit around to face in"*. It has to
 * be read at the **new** place rather than turned by a written angle, because
 * "in" is `+x` for one line of the set and `−x` for the other and no angle can
 * see which.
 */
const FACE_IN: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "same", along: 1 },
  to: { point: "slot", line: "other", along: 1 },
};

/** Straight across the set, bowed to your own left so two crossing pass right. */
const cross: readonly PathStep[] = [
  { at: { fromEnd: 0 }, pose: { p: destination("other"), facing: KEEP }, bow: DEFAULT_BOW_PX },
];

/**
 * Out of the line, round, and in again on the other place of the box, facing in.
 *
 * The centre of the loop is `radius` px off the shoulder named by `hand`, so
 * "loop right" really is a loop to the dancer's right; the sweep is a half turn,
 * which is what carries a body from one place of the box to the other without
 * walking through anybody standing in between.
 */
const loop: readonly PathStep[] = [
  {
    at: { fromEnd: 0 },
    pose: { p: destination("same"), facing: FACE_IN },
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
    "From long wavy lines up and down the set, everybody moves one place round the box of four you are standing in, all at the same time. If you are facing in, walk straight across the set to the place opposite, passing right shoulders. If you are facing out, loop out of your own line, round, and back into it on the other place of your box, and arrive facing in. Nobody leaves the four they are dancing with.",
  lead: 4,
  nominalBeats: 4,
  roles: [LANE_ROLES],
  actors: "line",
  anchor: "lane",
  params: {
    kind: "canonical",
    defaults: {
      /**
       * Which contra role is facing **in** — toward the other line — when the
       * circulate starts, the other role facing out. The wave's own clause:
       * Whoosh forms its long wave with "men face in".
       */
      facesIn: "lark",
      /** Which way the looping role loops. */
      hand: "R",
      /** How far outside the line the loop bulges, px. */
      radius: 6,
    },
  },
  shape: {
    kind: "waypoints",
    by: { param: "facesIn", then: "crossing", else: "looping" },
    tracks: { crossing: cross, looping: loop },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  // Which role faces in is a parameter and the loop's hand is a parameter, so
  // the mirror image of a circulate is a circulate with the other role facing in
  // and the other hand leading — which is a real wave somebody really dances.
  symmetry: { mirror: { kind: "parameters", hands: ["hand"] }, roles: ["facesIn"] },
};
