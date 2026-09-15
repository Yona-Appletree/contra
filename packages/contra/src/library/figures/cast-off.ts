import type { AngleExpr, FigureDefinition, PointExpr } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Cast off** (M7): the active walks round the inactive and the two of them
 * trade places.
 *
 * Chorus Jig's last four beats of A2, and the acceptance case for **a named
 * pivot dancer as an anchor** (`vision.md` §"Resolution"). The pair is named by
 * the `C2` relation — the dancer of the other couple straight along your own
 * line — and the first of the two named is the one who casts.
 *
 * ## It is the progression
 *
 * In Chorus Jig the cast off *is* the time through's progression: the ones end
 * on the twos' place and the twos on the ones'. So the figure gathers
 * (`ends: "home"`): the two of them settle on the formation's own two places,
 * which is what makes the dance close to 0.01 px rather than to a place pitch.
 *
 * **The inactive really does move.** The brief asks for the twos to be on
 * hold-place "for the whole phrase", with their move up as a zero-length shift
 * at the cycle end; that is not available, and the reason is measured rather
 * than argued — a twos couple that never moves ends the time through one whole
 * dancing place (20 px) from where the progression puts them, which is two
 * thousand times the closure the oracle allows. The twos stand still for every
 * other beat of Chorus Jig; these four are the ones where they step up.
 *
 * ## The way round is the outside of the set
 *
 * A cast goes **outside** the line — that is what makes it a cast rather than a
 * pass — and which way "outside" is differs between the two lines of the set.
 * The route says so in slots rather than in pixels: the outward direction is the
 * bearing from the place across the set to my own.
 */

/** The direction from the place across the set to mine: straight out of the line. */
const OUTWARD: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "other", along: 0 },
  to: { point: "slot", line: "same", along: 0 },
};

/** My own place, stepped `outPx` outside the line. */
const outside = (along: number): PointExpr => ({
  point: "offset",
  from: { point: "slot", line: "same", along },
  along: OUTWARD,
  distance: { param: "outPx" },
});

/** Facing straight across the set, from the place `along` positions on. */
const across = (along: number): AngleExpr => ({
  angle: "bearing",
  from: { point: "slot", line: "same", along },
  to: { point: "slot", line: "other", along },
});

/** The active: out of the line, round, and into the inactive's place. */
const activeTrack: readonly PathStep[] = [
  {
    at: { fromEnd: { number: "mul", of: [{ number: "beats" }, 0.5] } },
    pose: { p: outside(0.5), facing: across(0.5) },
  },
  { at: { fromEnd: 0 }, pose: { p: { point: "slot", line: "same", along: 1 }, facing: across(1) } },
];

/**
 * The pivot: straight up the inside, into the active's place.
 *
 * `along: 1`, not `-1`, and the sign is the whole of the figure: a slot's
 * `along` counts the way **that dancer** travels, and the pivot travels the
 * opposite way from the active. One place the pivot's own way *is* the place the
 * active has just left. Written the other way round it sends the inactive a
 * place further down the set, and the settling then puts them across the
 * set — which in a proper formation is a lark in the robins' line, and is what
 * the lab caught as a closure of 37.7 px.
 */
const pivotTrack: readonly PathStep[] = [
  { at: { fromEnd: 0 }, pose: { p: { point: "slot", line: "same", along: 1 }, facing: across(1) } },
];

/** Cast off, as a figure definition. */
export const castOffDefinition: FigureDefinition = {
  id: "cast-off",
  call: "CAST OFF",
  describe:
    "Turn away from the middle of the set and walk round the dancer standing along the line from you, outside the line, into the place they were in. They step up the inside into the place you have left. The two of you have traded places, and that is the progression.",
  lead: 4,
  nominalBeats: 4,
  roles: ["active", "pivot"],
  actors: "pairs",
  // The pivot is a person, standing still, and the figure turns about them.
  anchor: { pivot: "pivot" },
  params: {
    kind: "canonical",
    defaults: {
      /** The dancer of the other couple straight along your own line. */
      pairs: "C2",
      /** How far outside the line the cast goes, px. */
      outPx: 10,
    },
  },
  shape: {
    kind: "waypoints",
    tracks: { active: activeTrack, pivot: pivotTrack },
  },
  holds: [],
  ends: "home",
  timing: { stretch: "distance", profile: "smooth" },
};
