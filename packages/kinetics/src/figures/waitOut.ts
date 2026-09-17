import type { FigureIR } from "../ir/Figure.js";

/**
 * **Wait out** — the end of the line as a figure in the language (D7):
 * a couple with nobody to dance with this time through walks to the out
 * place the dialect has seated it at (the other line's end, in the becket
 * end the dialect dances tonight; Q1 is the user's) over its first beats,
 * and stands there, facing in, for the rest. Its `pre` is "arrived with no
 * neighbours"; its `post` is "at the seat the next progression will bring
 * in". Written as a figure so the ends are a construct, not an engine case.
 */
export const waitOut: FigureIR = {
  id: "wait-out",
  params: [
    { name: "with", kind: "dancer" },
    { name: "beats", kind: "number", default: 64 },
  ],
  beats: { nominal: 64, min: 8 },
  pre: { arrangement: [], holds: [] },
  post: { arrangement: [{ kind: "facing", who: "self", toward: "home" }], holds: [] },
  windows: [
    { kind: "walk-to-seat", beats: 8 },
    { kind: "stand", beats: 56 },
  ],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
