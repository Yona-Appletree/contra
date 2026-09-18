import type { FigureIR, Waypoint } from "../ir/Figure.js";

/**
 * How far to their own left of the lane's centre two dancers meeting in the
 * middle of the hey each keep, px: 5, so they pass 10 px apart — over the
 * 8.5 px two bodies clear each other by, with room for the executor's
 * spline to round the corner.
 */
export const HEY_PASS_PX = 5;

/**
 * How far outside the line the loop at each end reaches, in half-widths of
 * the set: 0.75 — twelve px, half a metre, at the contract's 32 px set. A
 * loop from one place round to the other is a half-ellipse this far out
 * and a place wide; at a quarter of the lap it is walked at about the
 * pace of the crossing, which is what keeps a dancer's speed even through
 * the figure.
 */
export const HEY_LOOP_REACH = 0.75;

/**
 * One lap of the hey's track, sixteen beats, in the lane frame of the role
 * that starts it: across in half-widths, along in half-places. A **closed
 * track through the four places** — cross from your own place to the place
 * across from it, loop round the outside of that end to the place beside
 * it, cross back, loop home — so everybody is home on sixteen by
 * construction and nobody steps on or off a weave.
 *
 * The middle waypoint of each crossing sits on the lane's centre with a
 * `left` offset: a pass, by right shoulders when the offset is to the left,
 * and a hey by the left is the same track with every pass the other way.
 */
export const HEY_TRACK: readonly Waypoint[] = [
  { beat: 0, x: -1, y: 1 },
  // Across: on to the lane's centre line by the first beat, through the
  // middle keeping your own left, off it again after the third, to the
  // place across. The two knots on the centre line make the crossing a
  // shallow arc rather than a V, so two arcs meeting in the middle stay
  // the pass's width apart as they open out.
  { beat: 1, x: -0.6, y: 0 },
  { beat: 2, x: 0, y: 0, left: HEY_PASS_PX },
  { beat: 3, x: 0.6, y: 0 },
  { beat: 4, x: 1, y: 1 },
  // Round the far end, outside the line, to the place beside it.
  { beat: 5, x: 1 + HEY_LOOP_REACH * Math.SQRT1_2, y: Math.SQRT1_2 },
  { beat: 6, x: 1 + HEY_LOOP_REACH, y: 0 },
  { beat: 7, x: 1 + HEY_LOOP_REACH * Math.SQRT1_2, y: -Math.SQRT1_2 },
  { beat: 8, x: 1, y: -1 },
  // Back across the same way — a point reflection of the first crossing.
  { beat: 9, x: 0.6, y: 0 },
  { beat: 10, x: 0, y: 0, left: HEY_PASS_PX },
  { beat: 11, x: -0.6, y: 0 },
  { beat: 12, x: -1, y: -1 },
  // Round the home end to your own place.
  { beat: 13, x: -1 - HEY_LOOP_REACH * Math.SQRT1_2, y: -Math.SQRT1_2 },
  { beat: 14, x: -1 - HEY_LOOP_REACH, y: 0 },
  { beat: 15, x: -1 - HEY_LOOP_REACH * Math.SQRT1_2, y: Math.SQRT1_2 },
  { beat: 16, x: -1, y: 1 },
];

/** The beats the starting role takes to cross the set once: the other role's entry. */
export const HEY_ENTRY_BEATS = 4;

/**
 * **Hey for four** (Butter's B1: "(16) hey for four, robins start right"):
 * seven meetings — the robins pass right in the middle, everyone passes at
 * the sides, the larks pass right in the middle, and so on to sixteen —
 * each dancer walking one closed track across the set, the four of them a
 * quarter of it apart.
 *
 * The role that starts (`start`) steps into the middle first and is a
 * quarter of a lap ahead of the other. The other role does not loop at the
 * start — at their own place they face into the set, and the track passes
 * through every place heading **out** of it — so their first four beats are
 * an entry of their own: wait two, then a side-step to the place beside
 * them (the one the starter has just left), facing across, from where the
 * track's crossing begins. From there everybody is on the lap: the two
 * robins half a lap apart, as are the two larks, and every dancer's own copy
 * of the track, in their own lane frame, is the same list of points.
 * `shoulder` is the middle pass's; `amount` is how much of the lap is danced
 * (a half hey is `0.5` over eight beats: the entry and one more crossing),
 * so the corpus's heys are numbers. The ring is the minor set; the lane runs
 * across it.
 *
 * Meetings, from the start: the starting pair in the middle on 2, everyone
 * at the sides on 4, the other pair in the middle on 6, the sides on 8, and
 * again on 10, 12 and 14; home on 16. The passes at the sides are between
 * the two places of one couple — a dancer arriving at one as the other
 * leaves the other — twenty px apart, which is where this track puts them
 * and what a gate looks at.
 */
export const hey: FigureIR = {
  id: "hey",
  params: [
    { name: "ring", kind: "group" },
    { name: "start", kind: "role" },
    { name: "shoulder", kind: "enum", choices: ["right", "left"], default: "right" },
    { name: "amount", kind: "number", default: 1 },
    { name: "beats", kind: "number", default: 16 },
  ],
  beats: { nominal: 16, min: 12 },
  pre: { arrangement: [{ kind: "facing", who: "self", toward: "home" }], holds: [] },
  post: { arrangement: [{ kind: "facing", who: "self", toward: "home" }], holds: [] },
  windows: [
    {
      kind: "parallel",
      beats: HEY_ENTRY_BEATS,
      parts: [
        {
          // The starters' first crossing: the first quarter of the lap.
          kind: "path",
          who: { role: "start" },
          points: HEY_TRACK,
          lap: { phase: [{ who: "self", beats: 0 }], amount: HEY_ENTRY_BEATS / 16 },
          mirror: { param: "shoulder", when: "left" },
        },
        {
          // The others' entry: a shallow loop to your own right — a little
          // back to make room, round, and in to the place beside you — still
          // facing across, never at rest. The shape is the caps' and the
          // clearance check's: a dancer who waits a beat has stopped, and the
          // courtesy turn before a hey cannot both finish and stop; and the
          // starter arriving at your side comes past this place's row a beat
          // before and a beat after you cross it, so you cross it between.
          kind: "path",
          who: { role: "start", not: true },
          points: [
            { beat: 0, x: -1, y: -1, facing: 0 },
            { beat: 1, x: -1.2, y: -0.55, facing: 0 },
            { beat: 2, x: -1.25, y: 0.15, facing: 0 },
            { beat: 3, x: -1.12, y: 0.65, facing: 0 },
            { beat: 4, x: -1, y: 1, facing: 0 },
          ],
        },
      ],
    },
    {
      // The lap, the rest of the way: the starters from a quarter round it,
      // the others from its start — `16 × amount − 4` beats of it.
      kind: "path",
      beats: { param: "amount", scale: 16, offset: -HEY_ENTRY_BEATS },
      points: HEY_TRACK,
      lap: {
        phase: [
          { who: { role: "start" }, beats: HEY_ENTRY_BEATS },
          { who: { role: "start", not: true }, beats: 0 },
        ],
        amount: { param: "amount", offset: -HEY_ENTRY_BEATS / 16 },
      },
      mirror: { param: "shoulder", when: "left" },
    },
  ],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
