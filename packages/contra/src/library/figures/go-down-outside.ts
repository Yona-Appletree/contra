import type { AngleExpr, FigureDefinition, NumberExpr, PointExpr } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Go down the outside**, and **go up the outside** again (M7).
 *
 * Chorus Jig's A1: the ones step out of the line, walk down the outside of the
 * set past the twos, and come back. Each of them dances it on their own —
 * `actors: "each"` — because there is nobody to dance it *with*: the two ones
 * are on opposite sides of a proper set and never touch.
 *
 * ## Everything is written in slots
 *
 * "Outside" is `+x` on one line and `−x` on the other, and "down" is one way for
 * a ones and the other for a twos, so neither can be an angle. Both are written
 * against the dancer's own slot instead — the outward direction is the bearing
 * from the place across the set to mine, and one place "down" is one position
 * the way I travel — which is the expression node M6 asked M7 for, doing exactly
 * the job M6 said it would.
 *
 * ## How far down
 *
 * One dancing place ({@link PLACE_PITCH_PX}, 20 px) in eight beats, which is
 * 2.5 px a beat — long lines' own walking pace to within a fifth of a pixel. It
 * takes a ones level with the twos and no further, which is what keeps them
 * clear of the couple waiting at the end of the line.
 */

/** The direction from the place across the set to mine: straight out of the line. */
const OUTWARD: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "other", along: 0 },
  to: { point: "slot", line: "same", along: 0 },
};

/** The place `along` positions the way I travel, stepped `outPx` outside the line. */
const outside = (along: NumberExpr): PointExpr => ({
  point: "offset",
  from: { point: "slot", line: "same", along },
  along: OUTWARD,
  distance: { param: "outPx" },
});

/** The way I travel along the set: down the hall for a ones, up it for a twos. */
const ALONG_TRAVEL: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "same", along: 0 },
  to: { point: "slot", line: "same", along: 1 },
};

/** The other way along the set. */
const BACK_ALONG: AngleExpr = { angle: "sum", of: [ALONG_TRAVEL, 180] };

/** Step out of the line, then walk on down it. */
const downTrack: readonly PathStep[] = [
  {
    at: { param: "stepBeats" },
    pose: { p: outside(0), facing: ALONG_TRAVEL },
  },
  {
    at: { fromEnd: 0 },
    pose: { p: outside({ param: "places" }), facing: ALONG_TRAVEL },
  },
];

/** Walk back up the outside, then step into the line. */
const upTrack: readonly PathStep[] = [
  {
    at: { fromEnd: { param: "stepBeats" } },
    pose: { p: outside(0), facing: BACK_ALONG },
  },
  {
    at: { fromEnd: 0 },
    pose: { p: { point: "slot", line: "same", along: 0 }, facing: ALONG_TRAVEL },
  },
];

const defaults = {
  /** How far outside your own line the route goes, px. */
  outPx: 10,
  /** How many dancing places along the set, the way you travel. */
  places: 1,
  /** Beats spent stepping out of the line and back into it. */
  stepBeats: 2,
};

/** Go down the outside, as a figure definition. */
export const goDownOutsideDefinition: FigureDefinition = {
  id: "go-down-outside",
  call: "DOWN THE OUTSIDE",
  describe:
    "Step out of your line, away from the middle of the set, and walk down the outside of it — past the couple below you — on your own. Your partner is doing the same thing on the other side. You end outside the line, a place further down than you began.",
  lead: 4,
  nominalBeats: 8,
  roles: ["one"],
  actors: "each",
  anchor: "centroid",
  params: { kind: "canonical", defaults },
  shape: { kind: "waypoints", tracks: { "*": downTrack } },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};

/** Go up the outside, as a figure definition. */
export const goUpOutsideDefinition: FigureDefinition = {
  id: "go-up-outside",
  call: "UP THE OUTSIDE",
  describe:
    "Turn round where you are and walk back up the outside of the set to your own place, stepping into the line as you arrive. You end facing the way you were facing before you left.",
  lead: 4,
  nominalBeats: 8,
  roles: ["one"],
  actors: "each",
  anchor: "centroid",
  params: { kind: "canonical", defaults },
  shape: { kind: "waypoints", tracks: { "*": upTrack } },
  holds: [],
  ends: "home",
  timing: { stretch: "distance", profile: "smooth" },
};
