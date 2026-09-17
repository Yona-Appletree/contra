import type { FigureIR } from "../ir/Figure.js";

/**
 * A becket's **shift left** (Butter's A1, "(2) Shift left"): the couple, side
 * by side facing across, slides one dancer place along its own line — 20 px,
 * half a couple width; the two lines sliding opposite ways is what brings the
 * next couple across (`data/dances/butter.json`'s notes, FR-C2).
 *
 * The program says `progress()` just before it — the seating moves, every
 * dancer's at once — and the body is a walk to the seat the dialect gives you —
 * along the line for a couple with a couple ahead of it; across to the other
 * line's end for a couple that has reached the end (the dialect's becket
 * end, Q1). Its counterpart is the partner you shift with, so that its exit
 * is back-chained from the swing before it (the same two dancers); with no
 * partner the shift elides and its beats go to the next call
 * (D8: Butter's *"you just don't slide. you wait. (or circle slower)"*).
 *
 * Inside hands joined with the partner is the user's ruling; tonight the shift
 * goes hands-free, because a take costs the entry beat a two-beat figure has
 * not got. A G1 note, and bite B's `couple` hold.
 */
export const shift: FigureIR = {
  id: "shift",
  params: [
    { name: "with", kind: "dancer" },
    { name: "direction", kind: "enum", choices: ["left", "right"], default: "left" },
    { name: "beats", kind: "number", default: 2 },
  ],
  beats: { nominal: 2, min: 1 },
  pre: { arrangement: [{ kind: "facing", who: "self", toward: "home" }], holds: [] },
  post: { arrangement: [{ kind: "facing", who: "self", toward: "home" }], holds: [] },
  windows: [{ kind: "walk-to-seat" }],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "elide" },
};
