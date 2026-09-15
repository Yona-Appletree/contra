import type { AngleExpr, FigureDefinition, NumberExpr, PointExpr } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Cast off** (M7): the active turns out of the set, swoops round the
 * inactive, and the two of them trade places.
 *
 * Chorus Jig's last four beats of A2, and the acceptance case for **a named
 * pivot dancer as an anchor** (`vision.md` §"Resolution"). The pair is named by
 * the `C2` relation — the dancer of the other couple straight along your own
 * line — and the first of the two named is the one who casts.
 *
 * ## The user's own account (FR-A1)
 *
 * > "in a cast off you turn out of the set, like if you're on the right, you
 * > look up the hall and swoop out to your right walking around the other
 * > person, often while they step in to take your place, then you loop back to
 * > where they were."
 *
 * Three things in it, and M7's route had none of them. It stepped `outPx` out
 * of the line at the half way mark **already facing across the set** — the
 * dancer turned inward on the first beat and walked the whole cast looking at
 * the other line, which is a side step and not a cast. And the inactive walked
 * a dead straight line up the inside.
 *
 * So the active's route is a **loop** written in three poses: out of the set
 * first (facing straight out, away from the middle, a quarter of the way
 * along), then round the outside travelling the way the line goes, then in on
 * to the place the inactive has left, facing across. And the inactive **steps
 * in** — `inPx` toward the middle at the half way mark — rather than walking
 * the line, which is both what the user describes and what keeps the two of
 * them a real distance apart as they pass.
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
 * bearing from the place across the set to my own. That one sentence is also
 * what makes the user's "if you're on the right… swoop out to your right" come
 * out right on both lines without the figure knowing which it is standing in:
 * out of the set is the caster's right hand in one line and their left in the
 * other, and neither is written down.
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

/** My own place, stepped `inPx` **into** the set: the inactive's step in. */
const inside = (along: number): PointExpr => ({
  point: "offset",
  from: { point: "slot", line: "same", along },
  along: OUTWARD,
  distance: { number: "mul", of: [{ param: "inPx" }, -1] },
});

/** Facing straight across the set, from the place `along` positions on. */
const across = (along: number): AngleExpr => ({
  angle: "bearing",
  from: { point: "slot", line: "same", along },
  to: { point: "slot", line: "other", along },
});

/** The way this dancer's own line runs, from where they stand to where they end. */
const ALONG: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "same", along: 0 },
  to: { point: "slot", line: "same", along: 1 },
};

/** A beat of the figure as a share of whatever count the card gives it. */
const share = (of: number): NumberExpr => ({
  number: "mul",
  of: [{ number: "beats" }, of],
});

/**
 * The active: **out** of the line, **round** the outside, and **in** to the
 * inactive's place.
 *
 * The first pose is the cast itself — a quarter of the way along, `outPx`
 * outside the line, turned to look **straight out of the set**, which is the
 * "turn out of the set" the figure is named for. The second is the swoop: three
 * quarters along, still outside, travelling the way the line goes. The third is
 * the loop back in.
 */
const activeTrack: readonly PathStep[] = [
  { at: share(0.35), pose: { p: outside(0.25), facing: OUTWARD } },
  { at: share(0.7), pose: { p: outside(0.75), facing: ALONG } },
  { at: { fromEnd: 0 }, pose: { p: { point: "slot", line: "same", along: 1 }, facing: across(1) } },
];

/**
 * The pivot: **in**, and up the inside into the active's place.
 *
 * `along: 1`, not `-1`, and the sign is the whole of the figure: a slot's
 * `along` counts the way **that dancer** travels, and the pivot travels the
 * opposite way from the active. One place the pivot's own way *is* the place the
 * active has just left. Written the other way round it sends the inactive a
 * place further down the set, and the settling then puts them across the
 * set — which in a proper formation is a lark in the robins' line, and is what
 * the lab caught as a closure of 37.7 px.
 *
 * The step in is `inPx` at the half way mark: *"often while they step in to take
 * your place"*. It is a small bow rather than a route of its own, which is what
 * the user's "step in" is — and it is the other half of the clearance, because
 * the caster is coming the other way `outPx` outside the same line.
 */
const pivotTrack: readonly PathStep[] = [
  { at: share(0.5), pose: { p: inside(0.5), facing: ALONG } },
  { at: { fromEnd: 0 }, pose: { p: { point: "slot", line: "same", along: 1 }, facing: across(1) } },
];

/** Cast off, as a figure definition. */
export const castOffDefinition: FigureDefinition = {
  id: "cast-off",
  call: "CAST OFF",
  describe:
    "Turn away from the middle of the set — if the set is on your left you turn to your right — and swoop out and round the dancer standing along the line from you, on the outside, then loop back in to the place they were in. They step in toward the middle and come up the inside into the place you have left. The two of you have traded places, and that is the progression.",
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
      /** How far into the set the inactive steps as they come up, px. */
      inPx: 4,
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
