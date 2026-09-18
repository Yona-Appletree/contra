import { PLACE_PX } from "../schedule/drift.js";
import type { FigureIR } from "../ir/Figure.js";

/**
 * **Mad robin** (Robins on a Wire's A1 and B1): the two beside each other in
 * the line, facing across, circulate around each other **keeping that
 * facing** — a sideways do-si-do, danced looking across the set. The user,
 * on the old library's version (`packages/contra/src/library/figures/
 * mad-robin.ts`): *"you're facing someone across the set. you and them orbit
 * sideways around the person next to you, staying looking at the person
 * across the set."*
 *
 * So it is the do-si-do's orbit of the pair's midpoint with one difference:
 * the facing is **kept** as the dancers arrive with it, not turned to face
 * each other. `around` is the one beside you (the neighbour, after the chain
 * has put her on the lark's right); `direction` is which way round —
 * `Left` the way a circle left goes, clockwise seen from above, `Right`
 * counterclockwise — and the look is straight ahead, across the set, at the
 * dancer opposite, who is not in this figure's cast. No hands. The radius
 * is half a place, the spacing the two stand at in the line, so the pair
 * keeps it all the way round and lands where it started.
 *
 * Six beats, four at the least: a whole turn of the pair in four is the
 * orbit's rate cap.
 */
export const madRobin: FigureIR = {
  id: "mad-robin",
  params: [
    { name: "around", kind: "dancer" },
    { name: "direction", kind: "enum", choices: ["left", "right"], default: "right" },
    { name: "beats", kind: "number", default: 6 },
  ],
  beats: { nominal: 6, min: 4 },
  pre: {
    arrangement: [
      { kind: "apart", who: "self", from: "partner", minPx: PLACE_PX, maxPx: PLACE_PX },
    ],
    holds: [],
  },
  post: {
    arrangement: [
      { kind: "apart", who: "self", from: "partner", minPx: PLACE_PX, maxPx: PLACE_PX },
    ],
    holds: [],
  },
  windows: [
    {
      kind: "orbit",
      axis: "midpoint",
      turns: 1,
      sense: { param: "direction", cases: { left: "left", right: "right" } },
      facing: "kept",
      radiusPx: PLACE_PX / 2,
      // The body does not turn, so this caps how fast it travels round: a
      // quarter of the circle a beat is a 63 cm step at this radius.
      rateMaxTurnsPerBeat: 0.25,
    },
  ],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
