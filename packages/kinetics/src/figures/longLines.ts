import type { FigureIR } from "../ir/Figure.js";

/**
 * **Long lines forward and back** (Butter's A2, "(8) In long lines, go
 * forward and back"): hands joined along the line — tonight with the partner
 * only, in the `line` hold, a placeholder: the user's ruling is hands hanging
 * at the side, about a hand's width between shoulders — walk forward toward
 * the other line and back to place. Three steps and a close each way, which
 * the cruise ramp makes of four beats.
 */
export const longLines: FigureIR = {
  id: "long-lines",
  params: [
    { name: "with", kind: "dancer" },
    { name: "beats", kind: "number", default: 8 },
  ],
  beats: { nominal: 8, min: 4 },
  pre: {
    arrangement: [{ kind: "facing", who: "self", toward: "home" }],
    holds: [{ hold: "line", hand: "left", with: "partner" }],
  },
  post: {
    arrangement: [{ kind: "facing", who: "self", toward: "home" }],
    holds: [],
  },
  windows: [
    { kind: "walk", direction: "forward", distancePx: 10, beats: 4 },
    { kind: "walk", direction: "back", distancePx: 10, beats: 4 },
  ],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
