import type { FigureIR } from "../ir/Figure.js";

/**
 * **Circle** — hands four in a ring, round to the left (or right) so many
 * places (Butter's A1: "(6) Circle left 3/4"). Everyone faces the centre and
 * travels along the ring; circle left is to your own left, which seen from
 * above is clockwise. Hands joined low between neighbours in the ring hold
 * (a placeholder until the gallery: the user's ruling is *"elbows down,
 * making a diamond/ring shape"*).
 *
 * The ring's radius puts neighbours a hold's spacing apart: `14 / (2 sin 45°)`
 * ≈ 9.9 px for four. Three quarters in six beats is an eighth of a turn a beat.
 */
export const circle: FigureIR = {
  id: "circle",
  params: [
    { name: "ring", kind: "group" },
    { name: "direction", kind: "enum", choices: ["left", "right"], default: "left" },
    { name: "places", kind: "number", default: 4 },
    { name: "beats", kind: "number", default: 8 },
  ],
  beats: { nominal: 8, min: 4 },
  pre: {
    arrangement: [],
    holds: [
      { hold: "ring", hand: "right", with: "right" },
      { hold: "ring", hand: "left", with: "left" },
    ],
  },
  post: { arrangement: [], holds: [] },
  windows: [
    {
      kind: "orbit",
      axis: "centroid",
      turns: { param: "places", scale: 0.25 },
      sense: { param: "direction", cases: { left: "left", right: "right" } },
      facing: "inward",
      radiusPx: 9.9,
      rateMaxTurnsPerBeat: 0.25,
    },
  ],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
