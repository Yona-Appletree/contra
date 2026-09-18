import type { FigureIR } from "../ir/Figure.js";

/**
 * **Single file promenade** (Robins on a Wire's B1: "(4) Single file
 * promenade clockwise 5/8"): the ring — the minor set's four — walks round
 * in a line, nose to tail, each facing the way they are going, holding
 * nothing, `eighths` of the way round. The user, on the old library's
 * version (`packages/contra/src/library/figures/single-file-promenade.ts`):
 * *"you walk around the set single file like in a bike chain."*
 *
 * Written as the circle's orbit of the ring's centroid with the facing on
 * the **tangent** and no holds: `Left` is clockwise seen from above, the way
 * a circle left goes. With no hands joined the ring is not pulled in to a
 * hold's radius: the four go round where they stand, on the circle through
 * the places (`orbitRadius`). What the old library did — the loop through
 * the places rather than the circle through them, cornering at each — is
 * the difference between a bike chain and a wheel, and is a G1 question
 * with the picture.
 *
 * Five eighths of a turn in four beats is 0.156 turns a beat, under the
 * quarter-turn cap; on the circle through the places (19 px out) it is a
 * 74 px walk in four beats, and the steps say what they are.
 */
export const singleFilePromenade: FigureIR = {
  id: "single-file-promenade",
  params: [
    { name: "ring", kind: "group" },
    { name: "direction", kind: "enum", choices: ["left", "right"], default: "left" },
    { name: "eighths", kind: "number", default: 2 },
    { name: "beats", kind: "number", default: 4 },
  ],
  beats: { nominal: 4, min: 2 },
  pre: { arrangement: [], holds: [] },
  post: { arrangement: [], holds: [] },
  windows: [
    {
      kind: "orbit",
      axis: "centroid",
      turns: { param: "eighths", scale: 1 / 8 },
      sense: { param: "direction", cases: { left: "left", right: "right" } },
      facing: "tangent",
      // The circle through the four places of a set: half the diagonal.
      radiusPx: 18.9,
      rateMaxTurnsPerBeat: 0.25,
    },
  ],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
