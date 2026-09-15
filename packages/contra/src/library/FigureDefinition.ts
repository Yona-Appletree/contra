import type { Beat, Side } from "@caller/choreo";
import type { TargetShape } from "../set/shape.js";
import type {
  AngleExpr,
  BoolExpr,
  Moment,
  NumberExpr,
  PoseExpr,
  RoleExpr,
  SideExpr,
} from "./expr.js";
import type { Symmetry } from "./symmetry.js";

/**
 * A figure, as **data**: actors, figure-roles, a frame with an anchor rule, a
 * shape drawn about that anchor, holds, honest ends, a timing profile and a
 * nominal beat count (`vision.md` §"Five layers", layer 4).
 *
 * M1 defined the type and filled it in for the seventeen coded figures through
 * the legacy bridge (`legacy.ts`), whose `shape` is `{ kind: "legacy" }` and
 * whose geometry is still the TypeScript figure's. **M2 makes it real**: the
 * shape kinds `rock`, `orbitPair` and `sequence` are implemented once in
 * `kinds/` and the five gatherers in `figures/` are written against them, with
 * nothing of their own but data. `ringWalk` and `path` are admitted by the
 * union and by the interpreter's dispatch from here so that M4 adds their
 * bodies rather than widening a closed union.
 *
 * Every definition is plain data and survives
 * `JSON.parse(JSON.stringify(def))` — `figures/*.test.ts` asserts it for each
 * of the five. A legacy definition names its coded figure by **id** rather than
 * holding it: what the bridge needs from the coded figure (its `ends`, its
 * `joinsAt`) is fetched from the registry at planning time, which is also what
 * lets `?chain=`-style default overrides reach the new path with no extra
 * plumbing.
 */

/**
 * One of the parts a figure has: `["lark", "robin"]` for a swing, `["a", "b"]`
 * for a symmetric pair, `["1L", "1R", "2L", "2R"]` for a bridged coded figure.
 *
 * A figure-role is a part in *this figure*, not a place in the formation — the
 * whole point of the rebuild. A swing's parts are named for the two contra
 * roles because a swing really is asymmetric (the ballroom hold puts the
 * robin's hand on top and on the right); an allemande's are `a` and `b`,
 * because "larks allemande left" pairs two dancers of the *same* role and the
 * figure has no opinion about which is which beyond the order the call named
 * them in.
 *
 * The one exception is the legacy bridge, whose roles are the hands-four
 * station ids on purpose, because that is exactly what the coded figures are
 * written against.
 */
export type FigureRole = string;

/**
 * How a call's `who` becomes instances.
 *
 * - `"all"` — one instance over everybody the call selected. The legacy
 *   bridge's, because a bridged coded figure takes the whole minor set and
 *   does its own pairing through `params.pairs`.
 * - `"pairs"` — one instance per pair, the pairs named by `params.pairs` (a
 *   relation word, or the station pairs a dance writes today). Everybody the
 *   call selected whom the pairing left out dances hold-place, which is what
 *   the two robins do during "larks allemande left".
 * - `"ring"` — one instance over the ring everybody the call selected makes.
 *
 * `"each"` and `"line"` are named here because the design names them and M4–M7
 * fill them in; `resolveCall` refuses them by name.
 */
export type ActorRule = "pairs" | "ring" | "each" | "all" | "line";

/**
 * Where an instance's shape is anchored — its **origin and axis inside the
 * instance's frame**, not a frame of its own.
 *
 * - `"hands-four"` — the formation's own minor-set frame, unmoved. The legacy
 *   bridge's, which is what every coded figure assumes.
 * - `"meet"` — the pair's midpoint where they stand when the call starts, with
 *   the axis running between them. What every gatherer for two uses: "the
 *   balance's frame anchors where the partners actually are" (`vision.md`
 *   §"Worked example").
 * - `"centroid"` — the centre of everybody the instance cast. The ring's.
 * - `"home"`, `"lane"`, `{ pivot }`, `{ other }` are the design's and land with
 *   the shapes that need them (M4, M7).
 *
 * The anchor is carried on the instance as {@link ResolvedAnchor} and handed to
 * the shape as a parameter; the group's frame stays the set's. See
 * `resolve.ts` for why: a frame per pair would mean a world round trip on
 * every spot, and `planCycle.ts`'s `LocalSpot` records what that costs.
 */
export type AnchorRule =
  | "hands-four"
  | "meet"
  | "centroid"
  | "home"
  | "lane"
  | { pivot: FigureRole }
  | { other: FigureRole };

/** A parameter's value: anything a dance record can write and JSON can hold. */
export type ParamValue = number | string | boolean | null | readonly unknown[];

/**
 * How a call's shorthand parameters expand to the canonical ones the shape
 * runs on.
 *
 * `{ kind: "passthrough" }` is the legacy bridge's: a coded figure's parameters
 * already *are* its canonical ones, and a dance record writes them directly.
 * `{ kind: "canonical", defaults }` is what a data figure declares — the
 * parameter names its shape reads and the value each takes when a call is
 * silent, which is exactly the `defaults` object the compiled figure is built
 * with. Shorthand with a real expansion (`robins@2`, a pass list) is M5's.
 */
export type ParamSpec =
  { kind: "passthrough" } | { kind: "canonical"; defaults: Readonly<Record<string, ParamValue>> };

/** The coded figure of that id, run exactly as the decider runs it today. */
export interface LegacyShape {
  kind: "legacy";
  figure: string;
}

/**
 * Several shapes in a row, each given a share of the figure's beats, with the
 * ends and the hands threaded between them.
 *
 * `balance-and-swing` is one call and one figure: the rock flows into the turn
 * with **nothing let go**. So the sequence hands each part the previous part's
 * ends as its start, and the previous part's hands at its last beat as the
 * hands this part's take starts from — and a hold both parts declare is not
 * released and retaken at all. That is `carryHolds`' own rule, applied inside
 * one figure instead of across a call boundary.
 */
export interface SequenceShape {
  kind: "sequence";
  parts: readonly SequencePart[];
}

/** One part of a {@link SequenceShape}. */
export interface SequencePart {
  /**
   * How many of the figure's beats this part takes; the rest go to `"rest"`.
   *
   * `{ share }` is a **fraction of whatever count the card gives the figure**
   * (D3, M9), which is what a figure made of equal parts wants: a square
   * through's two pull-bys are half the count each whether the caller gives it
   * four beats or six, where a written `2` would leave the second pull-by with
   * the whole of the difference.
   */
  beats: NumberExpr | "rest" | { share: number };
  shape: FigureShape;
  /** The holds this part takes, in the same form a definition's own are. */
  holds: readonly HoldSpec[];
  /**
   * **Who dances this part, in which groups.** Left out, everybody the figure
   * cast, as one group.
   *
   * M7's answer to M4's finding — *"resolution says who is **in** a figure but
   * not who stands still **inside** it"*. Contra corners is what needs it, and
   * needs both halves of it:
   *
   * - **Somebody stands still.** All four of a minor set are in the figure for
   *   its whole sixteen beats, and in three of its five parts the two inactives
   *   are waiting to be turned. A role no cast of this part names holds the pose
   *   the part before it left them in — an honest end, not an empty one — and
   *   takes no hands.
   * - **Two pairs turn at once.** The other two parts are the corner turns, and
   *   the two actives turn *different* corners over the same four beats. So a
   *   part is a **list** of casts, each planned on its own over its own dancers
   *   and running at the same time.
   *
   * Deliberately the smaller of the two mechanisms the brief offered: a
   * hold-place instance per **unselected** dancer already exists and is right
   * for Chorus Jig's twos, who are not in the figure at all; casts inside an
   * instance is what a figure whose own parts take turns needs, and M5's hey for
   * three wants the same thing for the same reason.
   *
   * **A part's casts may be a parameter** (M9). A square through's two pull-bys
   * are with two *different* people and which two is the call's business — The
   * Set Monster's is `(N3R;PL)`, a neighbour and then a partner — so the list is
   * written as `{ param: … }` and read off the call in exactly the form
   * {@link PairingRule}'s own `{ kind: "param" }` reads it: `"partners"`,
   * `"neighbors"`, or the station pairs written out. And it may be a **choice
   * between written lists**, which is `{ number: "select" }`'s idea one level
   * up: contra corners' `axis` says whether your first corner is the one
   * diagonally across the set or the one straight along it, and the two answers
   * are two lists of pairs rather than a number.
   */
  casts?: PartCasts;
}

/**
 * Who dances one part of a sequence: written out, named by a parameter, or
 * chosen between written lists by a parameter's own word.
 *
 * @see SequencePart.casts
 */
export type PartCasts =
  | readonly (readonly FigureRole[])[]
  /** A {@link PairingRule}-shaped parameter: `"partners"`, `"neighbors"`, or pairs. */
  | { param: string }
  /** One of several written lists, chosen by a parameter's own word. */
  | { select: string; cases: Readonly<Record<string, readonly (readonly FigureRole[])[]>> };

/**
 * Two dancers turning about a shared centre: the swing and the allemande.
 *
 * One kind rather than two because the two figures are the same shape with
 * different dressing — a radius from the anchor, a turn amount from a
 * parameter, a body facing built in stages, one or two hands that are held and
 * one or two that are not — and the differences are all data. What is *not*
 * data is the orbit itself: the trapezoid speed profile, the stepping in and
 * opening out, the clearance to the pair turning beside you, and (for a swing)
 * the velocity-sampled feet, which are an interpreter service because the kind
 * knows its own velocity analytically.
 */
export interface OrbitPairShape {
  kind: "orbitPair";
  /**
   * How the two bodies sit on the turn.
   *
   * `"pair"` is one moving axis with a dancer on each end of it — a swing's
   * ballroom hold, where the two are locked together and turn as one body.
   * `"each"` is two dancers each on their own radius about the centre, which is
   * an allemande: they can be any distance apart and they close in and out
   * independently.
   */
  radial: "pair" | "each";
  /** For `radial: "pair"`, the role the orbit angle is measured toward. */
  axisRole?: FigureRole;
  /** How far from the turning axis each dancer orbits, px. */
  radius: NumberExpr;
  /** How far each sits to the side of that axis — the ballroom offset, px. */
  lateral: NumberExpr;
  /**
   * How much room to leave the pair turning beside you, px.
   *
   * Two pairs of a minor set turn at once and their centres are one place pitch
   * apart, which is 20 px, so a pair with another pair close by turns tighter.
   * `null` leaves the orbit alone. Which pairs are close by is a fact about the
   * *resolution*, not about the figure, so it arrives as `params.nearby`.
   */
  clearance: NumberExpr | null;
  /**
   * How the clearance is spent: shrinking the whole orbit toward the axis
   * (a swing, which has a lateral offset to shrink too), or capping the radius
   * (an allemande, whose dancers simply walk a smaller circle).
   */
  squeeze: "orbit" | "radius";
  /** How far round, in whole and half turns, and which way. */
  turn: TurnSpec;
  /** The trapezoid the turn runs on. */
  profile: SpeedWindow;
  /** Beats spent stepping in to the turn from where the dancers stood. */
  inBeats: NumberExpr;
  /** Beats spent opening out of it on to the ends. */
  outBeats: NumberExpr;
  /** How the body is turned, stage by stage, over the figure. */
  body: readonly BodyStage[];
  /** Where each dancer looks: at the other one, or at the anchor. */
  look: "other" | "anchor" | "ahead";
  /** Where the pair's end places are. */
  ends: OrbitEnds;
  /** Hands the figure rests on the other dancer without joining them. */
  contact: readonly ContactHand[];
  /** The buzz step, the lean, the flare and the feet — a swing's, or nothing. */
  motion: OrbitMotion | null;
}

/**
 * One hand a figure places on the other dancer's body without joining it.
 *
 * The swing's other two hands: the lark's right on the robin's back, the
 * robin's left on the lark's shoulder. They are two points, never one, because
 * they are not joined — which is exactly why they are not holds.
 */
export interface ContactHand {
  /** Whose hand it is. */
  role: FigureRole;
  side: Side;
  /** Whose body it rests on. */
  on: FigureRole;
  /** Body-local forward from that dancer's centre, px. */
  forward: NumberExpr;
  /** Body-local to that dancer's right, px. */
  right: NumberExpr;
  /** How far below shoulder height, px. */
  drop: NumberExpr;
}

/** How far an orbit goes round, and which way. */
export interface TurnSpec {
  /** Turns, signed by `sign`; usually `{ param: "turns" }` or `{ param: "amount" }`. */
  amount: NumberExpr;
  /** `+1`, `-1`, or a choice made by a string parameter (an allemande's hand). */
  sign: NumberExpr;
  /**
   * Whether the turn is rounded so the pair opens straight out on to its ends.
   *
   * A swing's is: `turns` is "how many times round to the nearest half turn",
   * and without the rounding the pair can open out *through* each other. An
   * allemande's is not: once and a half means once and a half.
   */
  round: "open" | "none";
}

/**
 * The four corners of a trapezoid speed profile, each measured from the start
 * of the figure (`+n`) or from its end (`-n`).
 */
export interface SpeedWindow {
  a0: Moment;
  a1: Moment;
  b0: Moment;
  b1: Moment;
}

/**
 * One stage of how a body is turned: lerp the facing toward `to` over
 * `[from, to]` beats.
 *
 * The swing has two (into the hold, then out on to the end facing); the
 * allemande has three (on to the partner, into the turn with its inward lean,
 * then back on to the partner to finish). Written as stages rather than as one
 * formula because that is exactly what the two coded figures do, in that order,
 * and the order is what has to be reproduced to 0.1°.
 */
export interface BodyStage {
  /** Where the facing is being taken. */
  to: BodyTarget;
  /** The beat the lerp starts. */
  from: Moment;
  /** The beat it finishes. */
  until: Moment;
  /**
   * An extra offset, in degrees, multiplied by this stage's own ramp.
   *
   * The swing's 30° body turn: as the hold is taken the body turns out of the
   * line of the turn, continuously, rather than being lerped on to a fixed
   * angle. Zero for every stage that does not do that.
   */
  turnOut?: AngleExpr;
}

/** Where a {@link BodyStage} takes the body. */
export type BodyTarget =
  /**
   * The dancer's own orbit angle plus an offset.
   *
   * For `radial: "each"` that angle is the dancer's own radius from the centre,
   * so `180` faces the centre. For `radial: "pair"` it is the line through the
   * pair, read the way that dancer looks along it, so `0` faces the partner.
   */
  | { orbit: AngleExpr }
  /** The end facing the figure settles on. */
  | { end: true };

/** Where a pair's end places are. */
export type OrbitEnds =
  /**
   * Square out from the centre: the pair's first role on the left of the end
   * facing and the second on its right, `half` away. A swing's, and the reason
   * `endFacing` is still the caller's word for which way "out" is.
   */
  | { kind: "square"; facing: { param: string } }
  /**
   * Where the turn stopped: each dancer on their own orbit angle, `half` from
   * the centre, facing it. An allemande's.
   */
  | { kind: "turned" };

/** The buzz step and everything that goes with it. */
export interface OrbitMotion {
  /** Steps per beat while the buzz is fully in. */
  stepRate: NumberExpr;
  /** How far the bodies lean into the turn, px. */
  lean: NumberExpr;
  /** Extra skirt radius at full turning speed, px. */
  flare: NumberExpr;
  /** Whether the feet are the buzz step's, sampled off the shape's own velocity. */
  feet: boolean;
}

/**
 * A pair, or a ring, closing up, rocking forward and rocking back: the balance.
 *
 * `close: "pair"` steps in to the frame's hold spacing, which is what dancers
 * do — a pair standing in the lines is 32 px apart and no 15 px arm reaches
 * half way. `close: "ring"` steps on to the ring of joined hands and rocks
 * along its radius.
 */
export interface RockShape {
  kind: "rock";
  close: "pair" | "ring";
  /** How far the body rocks forward, px. */
  rock: NumberExpr;
  /** Beats spent closing up. */
  closeBeats: NumberExpr;
  /** Beats spent letting go and stepping back out, when `openOut` is true. */
  openBeats: NumberExpr;
  /** Whether the dancers step back out to where they started. */
  openOut: BoolExpr;
}

/**
 * Walk the instance's own regular ring so many places round: the circle, the
 * star and the petronella.
 *
 * **The ring is regular whatever the stations are.** Four dancers standing on
 * the corners of a rectangle who take hands in a ring have to stand the same
 * distance from each neighbour or the arms cannot all reach, so the ring is a
 * circle of `n` evenly spaced places whose phase is the circular mean of where
 * everybody already stands (`@caller/choreo`'s `ringOf`). That is what makes
 * "one place round the ring" a place and not an angle, and it is the same ring
 * `balance-ring` rocks on.
 *
 * Where a dancer **ends** is therefore a place arithmetic — whoever's place is
 * `sign × places` along the ring — and not a point the shape computes. How they
 * get there is {@link RingWalkShape.travel}: round the ring itself, holding on
 * (a circle, a star), or along the chord between the two places with a body
 * spin and nothing held (a petronella).
 */
export interface RingWalkShape {
  kind: "ringWalk";
  /** How many places round, in places of the ring. */
  places: NumberExpr;
  /**
   * Which way round `places` counts: `+1` is the way {@link Ring.order} runs,
   * which is the way a **circle left** travels.
   *
   * A right-hand star keeps the middle on the dancer's right and so turns the
   * same way a circle left does; a left-hand star turns back. A petronella
   * travels to the dancer's own **right**, which is one place *back* round the
   * ring, so its sign is `-1`.
   */
  sign: NumberExpr;
  /** Where the body points relative to the ring angle mid-travel: 180 faces in. */
  faceOffset: AngleExpr;
  /** Beats spent stepping in to the ring. */
  inBeats: NumberExpr;
  /** Beats spent stepping out of it on to the end place. */
  outBeats: NumberExpr;
  /** Which way the figure leaves the body pointing. */
  endFacing: RingFacing;
  /** How the dancers get from their place to the one they end on. */
  travel: RingTravel;
  /** What a hand no hold covers is doing. */
  idleHands: IdleHands;
}

/** Which way a {@link RingWalkShape} leaves a dancer facing. */
export type RingFacing =
  /** Straight at the middle of the ring: a circle's, and a petronella's. */
  | { kind: "inward" }
  /** Along the ring, `offset` off the outward radius: a star's. */
  | { kind: "tangent"; offset: AngleExpr };

/** How a {@link RingWalkShape}'s dancers travel between their two places. */
export type RingTravel =
  /**
   * Round the ring itself: step in to it, turn it, step out. The circle's and
   * the star's, and `@caller/choreo`'s own `ringWalk` — both ends exact and
   * both eased to a stop, so a seam matches to the bit.
   */
  | { kind: "ring" }
  /**
   * Along the chord between the two places, bowed a little away from the
   * middle, with the body spinning as it goes and nobody holding on: the
   * petronella's.
   *
   * The chord and not the arc, because riding the circle through both places
   * bulges `R(1 − cos(arc / 2))` beyond the set — most of the gap to the next
   * minor set — which is `petronella.ts`'s own `bowPx` note.
   */
  | { kind: "chord"; bow: NumberExpr; spins: NumberExpr; flare: NumberExpr }
  /**
   * **Round the set itself, one behind another: the bike chain** (FR-A2).
   *
   * The user, on the single file promenade: *"not at all right. you don't just
   * rotate about the center. you walk around the set single file like in a bike
   * chain."* So the path is the **loop through the dancers' own places** — the
   * set's own outline — and not a ring the four step in to: each dancer walks
   * the straight run to the place in front of them, rounds the corner where the
   * set turns, and walks the next run, exactly as a chain runs round its
   * sprockets. Nobody steps in, nobody steps out, and the shape of the set is
   * what the path is shaped like.
   *
   * `corner` is how far either side of a place the body is turned over, px.
   *
   * With this travel, {@link RingWalkShape.faceOffset} and a `tangent`
   * {@link RingFacing}'s offset are read against the **direction of travel**
   * rather than against a radius: on a loop with corners there is no radius to
   * measure a tangent off.
   */
  | { kind: "chain"; corner: NumberExpr };

/**
 * A dancer's own written path: a walk to a computed point, along a named curve,
 * carrying the body a named way.
 *
 * Six figures are this shape — pass through, long lines, slide left, roll away,
 * the california twirl and the do-si-do — and what they share is the frame: who
 * am I dancing this with ({@link PathShape.pairing}), where does it leave me
 * ({@link PathTrack.ends}), what curve do I walk to get there
 * ({@link PathTrack.curve}), and what is the body doing on the way
 * ({@link PathTrack.facing}). What they do not share is the curve itself, so
 * {@link PathCurve} is a small vocabulary rather than one rule: a plain walk, a
 * bowed walk, an arc about a point and an ellipse about one are genuinely four
 * different things a dancer's feet do.
 */
export interface PathShape {
  kind: "path";
  /** Who each dancer is dancing this with. */
  pairing: PairingRule;
  /** What everybody does. One track, read per role. */
  track: PathTrack;
  /** What a dancer the pairing left out of the figure does. */
  idle?: IdleTrack;
  /**
   * What a dancer the **formation** marked as crossing over does instead: S2's
   * odd-becket-line end effect, which a slide left is what carries.
   *
   * An odd becket line has only one waiting place, so at the end that has none
   * the couple that runs out of line crosses straight over — no time out — and
   * they cross **as a couple**: the pair turns half way round about its own
   * centre while that centre walks straight across the set, so they stay side
   * by side a place apart the whole way and arrive on the far line's own two
   * stations rather than on each other's. Everybody else in their minor set
   * slides pose for pose exactly as they always did.
   */
  crossing?: CrossingTrack;
}

/**
 * **A dancer's own written route, waypoint by waypoint, with the passes
 * marked**: M6's figures, and a different idea from {@link PathShape}'s.
 *
 * The two were written at the same time against the same admitted union member
 * and they answer different questions, so they ship as two kinds rather than as
 * one with a mode. A **path** names a *curve* and a *pairing* — "walk to the
 * place opposite along `@caller/choreo`'s own bowed walk, paired with whoever is
 * across the set" — which is what the eleven figures whose geometry was already
 * settled needed. A **waypoint route** names *where you are, when*, and lets the
 * passes find their own partners geometrically, which is what a pull-by and a
 * grand right and left need: one figure takes three hands with three different
 * dancers and no definition names any of them.
 *
 * Reconciling them into one kind would mean either writing each of M4's six
 * curves out as control points or giving M6's routes a curve vocabulary they do
 * not want. Both are real shapes; see `kinds/waypoints.ts` for this one and
 * `kinds/path.ts` for the other.
 */
export interface WaypointShape {
  kind: "waypoints";
  /**
   * One route per role.
   *
   * A key of `"*"` is every dancer's; a key that is one of the **contra** roles
   * is every dancer of that role; anything else is a figure-role by name. The
   * wildcard exists because a figure resolved in the lane has one part per
   * dancer, named for the slot they stand on, which no definition can write
   * down. Typed loosely, as M2 admitted it, because `kinds/waypoints.ts` owns
   * the waypoint's own shape.
   */
  tracks: Readonly<Record<string, readonly unknown[]>>;
}

/** What a dancer the formation marked `crossedOver` does; see {@link PathShape.crossing}. */
export interface CrossingTrack {
  /** How far the couple turns as it crosses, degrees. */
  turn: AngleExpr;
  /** How long one walking step of the crossing lasts, beats. */
  stepBeats: NumberExpr;
  idleHands: IdleHands;
  stepRate?: NumberExpr;
  amp?: NumberExpr;
}

/**
 * How a {@link PathShape} pairs its dancers up.
 *
 * A figure for the whole minor set still pairs people: a pass through pairs you
 * with the dancer opposite, long lines with the one beside you in the line, a
 * roll away with whoever `params.pairs` names. The pairing is a fact about
 * **where people are standing**, which is why it is resolved from the instance
 * rather than written into the call — the same figure passes a becket line
 * across and a duple improper line along without either being written down.
 */
export type PairingRule =
  /** Nobody: every dancer's path is their own. Slide left's. */
  | { kind: "none" }
  /**
   * The dancer on the other side of the group's centre, `axis` deciding which
   * way "other side" is measured and the nearest on the other axis winning.
   * A pass through's.
   */
  | { kind: "opposite"; axis: "across" | "along" | { param: string } }
  /** The dancer straight in front of you: right and left through's. */
  | { kind: "ahead" }
  /** The other dancer on your own side of the set: long lines'. */
  | { kind: "lineMate" }
  /** Whoever the named parameter's pairing says: a roll away's, a twirl's. */
  | { kind: "param"; param: string };

/** One dancer's path, read for every role the pairing put in the figure. */
export interface PathTrack {
  /**
   * Where the figure leaves this dancer.
   *
   * Left out only by a curve that works its own ends out — the `ellipse`, whose
   * end places fall out of the clearance it had to solve for anyway.
   */
  ends?: PoseExpr;
  /** The curve from where they stand to there. */
  curve: PathCurve;
  /** What the body does on the way. */
  facing: PathFacing;
  /** What a hand no hold covers is doing. */
  idleHands: IdleHands;
  /** Where the head looks; the facing by default. */
  look?: PathLook;
  stepRate?: NumberExpr | { when: "moving" };
  amp?: NumberExpr | { when: "moving" };
  /** Extra skirt radius, `flare × sin(πt/beats)`. */
  flare?: NumberExpr;
}

/** Where a walking dancer's head looks. */
export type PathLook =
  /**
   * The facing, swung `amount × sin(πt/beats)` and back.
   *
   * A slide left's glance along the line it is travelling: the head leads and
   * comes back, so the glance starts and ends on the plain facing and no seam
   * has to blend a turned head.
   */
  | { look: "glance"; amount: AngleExpr }
  /**
   * At the dancer opposite you through the centre of your own pair — which for
   * a do-si-do is exactly where your partner is at every instant, because the
   * two of you ride the same ellipse a half turn apart.
   */
  | { look: "opposite" }
  /** A written angle. */
  | { look: "angle"; angle: AngleExpr };

/** What a dancer the pairing left out does: stand where they are. */
export interface IdleTrack {
  idleHands: IdleHands;
  amp?: NumberExpr;
}

/** What a hand no hold covers is doing. */
export type IdleHands =
  /** Nothing at all: the renderer hangs it. A pass through's, a slide's. */
  | { kind: "down" }
  /**
   * Hanging at the dancer's own side and swinging with the step. A petronella's
   * (with no swing at all) and a do-si-do's (swung, faded in and out so a seam
   * never jumps).
   */
  | { kind: "hanging"; swing: NumberExpr; fadeIn?: NumberExpr; fadeOut?: NumberExpr };

/** The curve a {@link PathTrack} walks. */
export type PathCurve =
  /**
   * `@caller/choreo`'s own walk: eased, bowed to the dancer's own left so two
   * dancers swapping places pass **right shoulders**, and turning to face the
   * way it is going and then on to the end facing. A pass through's.
   */
  | { kind: "walkStep"; bow: NumberExpr }
  /**
   * A straight line, eased, bowed `sign × bow × sin(πk)` along the dancer's own
   * facing where they started.
   *
   * A roll away's: one of the couple passes in front and the other behind, so
   * they never share a point, and `sign` is which.
   */
  | { kind: "bowed"; bow: NumberExpr; sign: NumberExpr }
  /** A straight line covered in `steps` equal eased steps. A slide left's. */
  | { kind: "stepped"; stepBeats: NumberExpr }
  /**
   * Out `distance` px along `along` and back again, on `(1 − cos(2πt/beats))/2`
   * — still at both ends, furthest out in the middle. Long lines forward and
   * back, which ends where it started and so has no walk to write.
   */
  | { kind: "oscillate"; along: AngleExpr; distance: NumberExpr }
  /** Half a turn about the point between the pair: a california twirl's. */
  | { kind: "arc"; sweep: AngleExpr }
  /**
   * An ellipse about the point between the pair, its long radius the pair's own
   * half separation and its short one a bow: a do-si-do's pass.
   */
  | {
      kind: "ellipse";
      /** How far round, signed degrees. */
      turn: AngleExpr;
      /** The short radius: how far off the line between them they step, px. */
      pass: NumberExpr;
      /** How much room to leave anybody standing still inside the ellipse, px. */
      clearance: NumberExpr;
      /**
       * How far from the centre each dancer ends, px — or `null` to read it off
       * the formation's own places, which is what every dance wants.
       */
      endHalf: NumberExpr | null;
    };

/** What a {@link PathTrack}'s body does on the way. */
export type PathFacing =
  /** Whatever the curve itself decided: `walkStep`'s two-stage turn. */
  | { kind: "curve" }
  /** Held where it started, with an optional whole-turn spin on top. */
  | { kind: "held"; spin?: PathSpin }
  /** Turned on to the end facing over the first `beats` of the figure. */
  | { kind: "settle"; beats: NumberExpr }
  /** Carried round with an `arc` curve, by the same sweep. */
  | { kind: "withArc" };

/**
 * A whole-turn spin laid over a held facing, eased over whatever is left of the
 * figure after {@link PathSpin.from}.
 *
 * A roll away's robin turns once round as she crosses in front while the lark
 * simply slides behind, so a spin is **whose** as well as how far.
 */
export interface PathSpin {
  /** Whole turns, signed. */
  turns: NumberExpr;
  /** Only the dancers whose contra role the named parameter names. */
  who?: { role: string };
  /** The beat the spin starts; `0` by default. */
  from?: NumberExpr;
}

/**
 * **The courtesy turn**: a couple closes up and turns as one rigid body, ending
 * facing back the way it came with the robin still on the lark's right.
 *
 * Two figures are this shape and they turn two different ways, which is why
 * {@link CourtesyTurnShape.regime} is data and not a second kind:
 *
 * - **`"rigid"`** — right and left through's, and the textbook one. The couple
 *   walks over, closes up short of the far line, and the whole of it (both
 *   bodies *and* the line between them) pivots a half about a point near the
 *   lark. The turn is solved **backwards from its ends**: a rigid half turn is
 *   its own inverse, so where the hands close is the pair of end places
 *   reflected through the pivot, and the figure walks its dancers there.
 * - **`"orbit"`** — the chain's, F13's candidate 5 and the user's own account
 *   of the figure: the lark is walking backward from beat one round a small
 *   circle, the robin pulls by the other robin in the middle and joins that
 *   circle a quarter of the way through, and the two of them finish it
 *   together.
 *
 * **Only these two ship** (A6). The three tunings of the rigid turn that F9
 * kept behind `?chain=` — the pivot at the lark, and the two couple-spins — are
 * gone with `CHAIN_CANDIDATES`, `?chain=` and `pnpm figure --chain`.
 */
export interface CourtesyTurnShape {
  kind: "courtesyTurn";
  regime: "rigid" | "orbit";
  /** How the couple that turns is found. */
  pairing: CourtesyPairing;
  /** Where the figure leaves the pair, and whoever it did not cast. */
  ends: CourtesyEnds;
  /**
   * How long the dancers spend getting to the turn: the pass through, or the
   * pull by. For an orbit it is also the beat the robin joins the circle on.
   */
  approachBeats: NumberExpr;
  /** How far each dancer bows to their own left on the way over, px. */
  bow: NumberExpr;
  /** How far from the lark the rigid turn pivots, px. Unread by an orbit. */
  pivotFromLark: NumberExpr;
  /** How far to her own left of the set's centre a robin pulls by, px. */
  passPx: NumberExpr;
  /** Beats spent opening out on to the two places, at the end. */
  openBeats: NumberExpr;
  /** Beats spent closing up on to the hold, after a pass through. Rigid only. */
  closeBeats: NumberExpr;
  /** How long before the hands close the lark is standing on his take, beats. */
  larkLead: NumberExpr;
  /** Whether the couple's two right hands go to the robin's back. */
  backHands: BoolExpr;
  /**
   * The couple's own joined hands, and the pull by's.
   *
   * Declared on the **shape** rather than in the definition's `holds`, as the
   * swing's ballroom hold is the orbit's own: a courtesy turn's four hands are
   * constitutive of it — "left hand in her left, her own right hand behind her
   * back and his right hand on it" is the figure, not a dressing of it — and
   * their windows are the turn's own take and release rather than beats a
   * definition could write down, because the turn's phases are solved from its
   * ends.
   */
  hands: CourtesyHands;
}

/** A courtesy turn's joined hands, and their heights. */
export interface CourtesyHands {
  /** How far below shoulder height the couple's joined left hands sit, px. */
  drop: NumberExpr;
  /** How much higher the role set's top role's hand sits, px. */
  stackPx: NumberExpr;
  /**
   * The pull by's own two right hands, for a chain: how far below shoulder
   * height they meet. `null` where the figure has no pull by.
   */
  pullDrop: NumberExpr | null;
}

/** How a {@link CourtesyTurnShape} finds the couple that turns. */
export type CourtesyPairing =
  /**
   * The couple walks over together and turns: right and left through's. The
   * pairing is `params.couples`, and who passes whom is who is *ahead*.
   */
  | { kind: "couples"; param: string; passing: "ahead" }
  /**
   * One role chains across and turns with the lark of the couple whose place
   * she lands on: the chain's. Which lark is hers is decided by the facing her
   * landing place carries, not by who is nearest.
   */
  | { kind: "chain"; param: string };

/** Where a {@link CourtesyTurnShape} leaves everybody. */
export type CourtesyEnds =
  /** On the place opposite, facing back: right and left through's. */
  | { kind: "throughAndTurn" }
  /** The two chaining dancers trade places; the larks stay: the chain's. */
  | { kind: "trade" };

/**
 * **The hey: a schedule of meetings, laid along a lane** (M5, Q8).
 *
 * The other kinds answer "where do my feet go"; this one answers "**who do I
 * meet, when, and by which shoulder**", and the feet fall out of it. A hey for
 * four is seven meetings on counts 2 to 14 — the robins in the middle, then
 * everybody at the lanes' edges, then the larks in the middle — and everything a
 * caller can vary about a hey is a variation on that list: half a hey is its
 * first three, a ricochet is one meeting you bounce out of instead of passing
 * through, a hey for three is the same list with one dancer standing, and ending
 * short is stopping on a meeting rather than walking home from it.
 *
 * The **pass list** (`RR NL LR PL RR NL LR`, D5) is that list written down, and
 * `library/passList.ts` is its parser and printer. The shape reads it out of a
 * parameter — or, when a call writes none, derives it from the dancers
 * themselves — and expands it into one {@link ScheduleItem} list per figure-role
 * (`kinds/schedule.ts`).
 *
 * **The lane** is the axis the weave runs along, which across a contra set is
 * the axis between the two lines. Its stations are where the meetings happen:
 * the centre of the set, the two lanes' edges where the lines stand, and the
 * loops beyond the ends. See `kinds/schedule.ts` for the curve that threads
 * them, and why its side-step swings once between the middle and the end.
 */
export interface ScheduleShape {
  kind: "schedule";
  /** How far a dancer steps to their own side of the lane at a meeting, px. */
  passPx: NumberExpr;
  /**
   * How far the loop past the end of the lane reaches, as a multiple of the
   * lane's own half-width.
   *
   * Dancers really do loop outside the set at the end of a hey; `√2` is how far
   * the weave has to reach for its quarter points to land on the four places.
   */
  loopReach: NumberExpr;
  /** Beats spent stepping on to the weave at the start and off it at the end. */
  joinBeats: NumberExpr;
  /** How far below shoulder height a `pull-by` meeting's joined hands sit, px. */
  passDrop: NumberExpr;
  /** Which of the figure's parameters the schedule is read from. */
  shorthand: ScheduleShorthand;
}

/**
 * The parameter names a {@link ScheduleShape} reads its schedule out of.
 *
 * Named rather than fixed so the kind knows nothing about any figure's
 * vocabulary, exactly as `PathShape`'s `{ param }` references do.
 */
export interface ScheduleShorthand {
  /** The canonical pass list: a string, or the words spelled out. */
  passes: string;
  /** Which contra role steps off into the middle first. */
  start: string;
  /** Which shoulder the first meeting is by. */
  by: string;
  /** How much of the weave is danced, when no pass list is written. */
  amount: string;
  /** A role-scoped ricochet, `robins@2`. */
  ricochet: string;
  /** How many dance it: four, or three with one standing out. */
  for: string;
  /** Which figure-role stands out of a hey for three. */
  idle: string;
  /** The lane's axis: the dancers' own spread, across, along, or a diagonal. */
  axis: string;
  /** Whether every meeting is a pull by rather than a pass. */
  hands: string;
}

/** What happens when a {@link ScheduleItem}'s two dancers meet. */
export type ScheduleMode =
  /** Walk past each other and keep going: what almost every meeting is. */
  | "pass"
  /** Come into the middle and bounce back out the other side: a ricochet. */
  | "bounce"
  /** Pass, giving the shoulder's hand and letting go on the way by. */
  | "pull-by"
  /** Stand this one out: a hey for three's idle role. */
  | "stand"
  /** Nobody to meet — you are round the end of the lane, looping. */
  | "loop";

/**
 * One meeting on one dancer's schedule.
 *
 * `meet` is a **relation** (`"neighbor"`, `"partner"`, `"N2"`) or a
 * **figure-role**, which is the honest pair of answers: a pass in the middle is
 * with the other dancer of your own role and a pass at the side is with whoever
 * the set says is beside you. A `loop` or a `stand` meets nobody.
 */
export interface ScheduleItem {
  meet?: string;
  shoulder: "right" | "left";
  mode: ScheduleMode;
  /** The beat of the figure it happens on; the expansion fills it in. */
  at?: Beat;
  /** The figure stops here rather than walking on: the pass list's `~`. */
  short?: boolean;
}

/**
 * **A line with an order, travelling**: the line of four that goes down the
 * hall and comes back up it (M7).
 *
 * The kind the brief's own headline names. What makes it a shape of its own
 * rather than a walk to a written point is that **the order is a parameter**:
 * The Nice Combination writes `M1-W2-M2-W1` going down and `W2-M1-W1-M2` coming
 * back, and no definition can say in advance which dancer stands at which end.
 * So the shape is told the order and solves the line from it
 * (`set/shape.ts`'s `solveShape`).
 *
 * It serves a line of two as happily as a line of four, which is what "the ones
 * lead down the centre" is.
 */
export interface LineWalkShape {
  kind: "lineWalk";
  /**
   * The parameter naming the order across the line, first place first.
   *
   * Each entry is a figure-role, or a contra role for a line whose order is by
   * role. The order runs the way {@link LineWalkShape.axis} points, which is a
   * **fixed** direction across the hall and not the way the line faces — see
   * `set/shape.ts` for why those are two different angles.
   */
  order: string;
  /** Which way the line travels and everybody in it faces, frame-local degrees. */
  facing: AngleExpr;
  /** Which way the order runs across the line, frame-local degrees. */
  axis: AngleExpr;
  /** How far the line travels along its facing, px. */
  travel: NumberExpr;
  /** How far apart adjacent dancers stand, px. */
  spacing: NumberExpr;
  /** Beats spent turning on to the line's own facing. */
  settleBeats: NumberExpr;
  /** How far below shoulder height the joined hands sit, or `null` for none. */
  handDrop: NumberExpr | null;
  /**
   * Beats at the end over which the hands come down; `0` keeps them.
   *
   * A line going down the hall keeps hold all the way and hands the hold on to
   * whatever comes next. A line that **bends into a ring on the formation's own
   * places** cannot: the two lines of this hall stand 32 px apart and an arm is
   * 15, so four joined hands round a ring that wide is a reach the oracle refuses
   * — measured at 6.63 px short before this existed. Dancers really do let go as
   * a bend opens out, so the figure says when.
   */
  handRelease: NumberExpr;
  idleHands: IdleHands;
}

/**
 * **Two dancers as one actor**: a unit with its own centre and its own
 * orientation, which turns and travels as a body (M7).
 *
 * `vision.md` §"Resolution" names this frame kind outright — *"couple (or any
 * two dancers, per Hey for Thee) as a unit with its own orientation"* — and it
 * is what "neighbour turn as couples" is: the pair does not turn *about* each
 * other, it turns *with* each other, so the two of them stay side by side a hold
 * apart the whole way round and simply end pointing the other way.
 *
 * The unit is any two dancers the call paired, not a couple by definition: that
 * is the difference between this and a courtesy turn, whose geometry is a
 * couple's own. M8's promenade around the major set is the same kind with a
 * travel instead of a turn.
 */
export interface UnitShape {
  kind: "unit";
  /** How far the unit turns about its own centre, degrees. */
  turn: AngleExpr;
  /** How far the unit's centre travels, px; `0` to turn on the spot. */
  travel: NumberExpr;
  /** Which way it travels, frame-local degrees. */
  along: AngleExpr;
  /** How far apart the two stand once they have closed up, px; `null` to keep. */
  spacing: NumberExpr | null;
  /** How far below shoulder height their joined hands sit, or `null` for none. */
  handDrop: NumberExpr | null;
  /**
   * **How the two of them hold on** (FR-A2). Left out is `"inside"`.
   *
   * - `"inside"` — the one hand each that points at the other, joined half way
   *   between the two bodies. A turn as couples', and every unit written before
   *   this parameter existed.
   * - `"promenade"` — the skater's hold: *"in a promenade you stand beside each
   *   other, left in left, right in right, walking the same direction"* (the
   *   user). **Both** hands are joined, each pair where the two arms meet, so
   *   the arms cross in front of the couple and the joins sit outside them
   *   rather than between them. {@link UnitShape.topRise} lifts the right-hand
   *   pair clear of the left.
   */
  hold?: "inside" | "promenade";
  /** For `"promenade"`: how much higher than the left pair the right pair sits, px. */
  topRise?: NumberExpr;
  /** For `"promenade"`: how far the role on top lifts its hand over the other's. */
  stackPx?: NumberExpr;
  idleHands: IdleHands;
}

/**
 * **A wave, and its balance**: a line of dancers facing alternately in and out,
 * joined hand to hand along it, rocking forward and back (M7, from M6).
 *
 * M6 left `balance-wave` unwritten and said why: *"it needs a wave-hold rule
 * inside the shape kind — the named hand to the lane neighbour you are facing,
 * the other hand to the one behind you"*. That rule is what this kind is, and it
 * is written on **slots** rather than on cast order, because the dancer whose
 * right hand you have is the one at `position + travel` and cast order alone
 * cannot say which way that is.
 *
 * It is a rock, not a walk: `rock.ts` owns the pair's and the ring's, and this
 * owns the wave's, because a wave's closing up is along a line whose two ends
 * hold nobody.
 */
export interface WaveShape {
  kind: "wave";
  /**
   * Which way the wave **runs** (M8). Left out is `"along"`, the long wave down
   * the set that Whoosh forms and every wave written before M8.
   *
   * `"across"` is the other wave the corpus writes and the one Anna's Reel
   * forms: four dancers in a row **between** the lines, looking along the set
   * rather than across it. They are different shapes with different hand rules
   * and neither is the other with a sign — see `kinds/wave.ts`.
   */
  axis?: "along" | "across";
  /**
   * For `"across"`: the parameter naming the contra role that stands in the
   * **middle** of the row, the other role taking the two ends.
   */
  centre?: string;
  /** Which hand goes to the dancer one place along the way you travel. */
  hand: SideExpr;
  /** For `"across"`: how far apart the row's places sit, px. A hold when left out. */
  spacing?: NumberExpr;
  /**
   * The parameter naming the contra role that faces **in** — toward the other
   * line — with the other role facing out. Whoosh's "men face in". Read only by
   * the long wave: an across wave's facings follow from its hands.
   */
  facesIn: string;
  /**
   * The parameter naming **which way the wave balances** (FR-A2): one of
   * `forward`, `left`, `right`, `left-and-back`, `right-and-back`. Left out —
   * or named but not given — is `forward`, forwards and back, which is what a
   * card that says nothing means. See `kinds/wave.ts`'s `WaveDirection`.
   */
  direction?: string;
  /**
   * How far the body rocks off the line of the wave, px. Bounded by
   * `kinds/wave.ts`'s `WAVE_ROCK_CAP_PX`, so no call can shear the wave past
   * the width of a dancer.
   */
  rock: NumberExpr;
  /** Beats spent closing up on to the wave. */
  closeBeats: NumberExpr;
  /** How far below shoulder height the joined hands sit, px. */
  handDrop: NumberExpr;
  idleHands: IdleHands;
}

/** What the figure actually draws. */
export type FigureShape =
  | LegacyShape
  | SequenceShape
  | OrbitPairShape
  | RockShape
  | RingWalkShape
  | PathShape
  | WaypointShape
  | ScheduleShape
  | CourtesyTurnShape
  | LineWalkShape
  | UnitShape
  | WaveShape;

/**
 * Only when this parameter has one of these values.
 *
 * What lets a balance declare all three of its holds as data — two hands, one
 * hand, or the ring — and the interpreter take the ones the call asked for,
 * rather than the shape growing a `switch` over a parameter it should not know
 * about.
 */
export interface ParamGuard {
  param: string;
  is: readonly (string | number | boolean)[];
}

/** One hand two figure-roles hold, and over which of the figure's beats. */
export interface PairHold {
  kind: "pair";
  a: FigureRole;
  aSide: SideExpr;
  b: FigureRole;
  bSide: SideExpr;
  /** Where the shared floor point sits. */
  point: HoldPoint;
  /** How far below shoulder height the joined hands sit, px. */
  drop: NumberExpr;
  /** How much higher the role set's top role's hand sits, px. */
  stackPx?: NumberExpr;
  /** When the hand goes up and when it comes down. */
  window: HoldWindowSpec;
  /** Only when this parameter says so. */
  when?: ParamGuard;
}

/** Every hand round the ring, joined to the dancer on each side. */
export interface RingHold {
  kind: "ring";
  drop: NumberExpr;
  stackPx?: NumberExpr;
  /** How much higher the joined hands sit at full back rock, px. */
  riseGain: NumberExpr;
  window: HoldWindowSpec;
  when?: ParamGuard;
}

/**
 * Which of a dancer's hands a hold uses.
 *
 * A figure written for a whole minor set cannot name a hand outright when the
 * answer depends on which way round the dancers are standing: "inside hands"
 * means the lark's right and the robin's left on one side of the set and the
 * other way round on the other, and a becket line and a duple improper line
 * disagree about both. So the two geometric rules are data — the hand nearest
 * the other dancer, and the hand away from them — and which **facing** they are
 * read against is part of the rule, because long lines takes hands along a line
 * everybody has turned to face along while a roll away takes them where the
 * couple already stands.
 */
export type SideRule =
  | SideExpr
  | { nearest: RoleExpr; facing: "start" | "end" }
  | { furthest: RoleExpr; facing: "start" | "end" };

/**
 * **One hand joined to whoever the shape's pairing put you with.**
 *
 * {@link PairHold} names both ends outright, which a figure for two can do and
 * a figure for a whole minor set cannot: a pass through's four dancers take
 * hands in two different pairs and which pair you are in comes out of where you
 * are standing. So a mate hold is written once, per dancer, and both ends
 * evaluate the same rule — each for themselves — which is what keeps the two
 * hands one shared floor point rather than two that agree.
 */
export interface MateHold {
  kind: "mate";
  /** Which hand, evaluated by each dancer for themselves. */
  side: SideRule;
  /** Where the one shared floor point sits. */
  point: HoldPoint;
  drop: NumberExpr;
  /** How much higher the role set's top role's hand sits, px. */
  stackPx?: NumberExpr;
  window: HoldWindowSpec;
  when?: ParamGuard;
}

/**
 * **One hand a dancer places that nobody else is holding.**
 *
 * The library takes hands three ways and this is the third: a hand that is on
 * something rather than in somebody's. The star's giving hand is on the wrist
 * of the dancer ahead — only she has a hand there, his is busy on the next
 * wrist round — and long lines' outward hand is on a point half the line's own
 * pitch beyond her, which is where the *next minor set's* dancer puts theirs by
 * the same rule, without either group knowing the other exists. That is the
 * three-pass rule doing its work: the point is read from where the other dancer
 * is **at this same beat**, so both hands land on one floor point without
 * anybody negotiating.
 *
 * {@link SoloHold.joins} is for the one case where the two really do meet: a
 * hands-across star, whose two diagonals each put one hand at the middle. The
 * hold is still written per dancer — each has their own drop — and the join is
 * what the figure *reports*, so `carryHolds` and the reach oracle see it.
 */
export interface SoloHold {
  kind: "solo";
  /** Whose hand it is; `"each"` is every role of the instance. */
  role: RoleExpr | "each";
  side: SideRule;
  point: SoloPoint;
  /** How far below shoulder height it sits, px. */
  drop: NumberExpr;
  /**
   * How much higher the role set's **top** role's hand sits than the other's,
   * px: the top role's is `stackPx / 2` above {@link SoloHold.drop} and the
   * other's the same below.
   *
   * By the dancer's own role and not by the pair, which is what lets a
   * four-person star stack "robins above larks" all the way round while two
   * robins who meet at the middle of a hands-across star are trivially at one
   * height and still read above the two larks beside them.
   */
  stackPx?: NumberExpr;
  /** The dancer this hand is really joined to, when it is. */
  joins?: { with: RoleExpr; side: SideExpr };
  window: HoldWindowSpec;
  when?: ParamGuard;
}

/** Where a {@link SoloHold}'s hand goes. */
export type SoloPoint =
  /** The shape's own origin: a hands-across star's middle. */
  | { kind: "anchor" }
  /**
   * One forearm out from the anchor, in the direction of the dancer ahead of
   * you round the ring — the spot your own reaching arm would occupy in a palm
   * star, a forearm short of actually getting there. The wrist star's.
   */
  | { kind: "wristOf"; of: RoleExpr; radius: NumberExpr }
  /**
   * Half your own distance from `of`, straight on past you away from them:
   * where the next minor set's dancer puts their own hand by the same rule.
   * Long lines' outward hand.
   */
  | { kind: "beyond"; of: RoleExpr };

/** Where a joined hand's one shared floor point sits. */
export type HoldPoint =
  /**
   * Where the two outstretched arms meet, pushed further out to the side and
   * lower as the pair rocks forward, and lifted a little as it rocks back.
   * A two-hand balance's.
   */
  | {
      kind: "reach";
      /** How much wider the hands spread at full forward rock, px. */
      spread: NumberExpr;
      /** How much lower they sit at full forward rock, px. */
      dropGain: NumberExpr;
      /** How much higher they sit at full back rock, px. */
      riseGain: NumberExpr;
    }
  /** Half way between the two bodies: a one-hand balance, and a roll away. */
  | { kind: "midpoint" }
  /**
   * Half way between the two **shoulders** the hold names: where two
   * outstretched hands actually meet, and the point every figure that simply
   * takes a hand uses — long lines along the line, a california twirl's arch,
   * a courtesy turn's joined lefts, a chain's pull by.
   */
  | { kind: "joinPoint" }
  /** The anchor itself, held high: an allemande. */
  | { kind: "anchor" }
  /** In from the midpoint of the two joined shoulders: a swing's outer hands. */
  | { kind: "shoulders"; inset: NumberExpr };

/**
 * When a hold is taken and dropped.
 *
 * Three kinds, because the library really does take hands three ways:
 *
 * - `"holdWindow"` — `take` beats to rise at the start and `release` beats to
 *   fall at the end, clamped to half the figure. A balance's.
 * - `"ramps"` — four beats written out, negative ones counting back from the
 *   last beat. An allemande's, whose hand goes up between 0.4 and 1.3.
 * - `"orbit"` — the orbit's own stepping in and opening out. A swing's, whose
 *   hold *is* the ballroom hold it closes into.
 *
 * A hold carried in loses its take and one carried out loses its release,
 * which is `joinWindowFor`'s rule stated once for all three.
 */
export type HoldWindowSpec =
  | { kind: "holdWindow"; take: NumberExpr; release: NumberExpr }
  | {
      kind: "ramps";
      takeFrom: Moment;
      takeTo: Moment;
      releaseFrom: Moment;
      releaseTo: Moment;
    }
  | { kind: "orbit" };

/** One hold a figure takes, as data. */
export type HoldSpec = PairHold | RingHold | SoloHold | MateHold;

/**
 * Where the figure leaves people.
 *
 * - `"relative"` — wherever the shape put them. A carrier's, and a bridged
 *   coded figure's (its own `plan.ends`, which is what `chainCalls` threads
 *   today). The balance's too: it ends where it balanced, facing its partner,
 *   because the swing that almost always follows wants the pair closed up.
 * - `"home"` — a **gatherer's**: the shape's own end places are replaced by the
 *   formation's own home places for the dancers cast, assigned so that nobody
 *   crosses anybody (the assignment with the least total travel), with each
 *   shape keeping its own end facings. This is what makes "balance and swing
 *   your neighbour" *be* the progression rather than merely end near it, and
 *   what makes Butter's `endHalf: 10` override unnecessary (AC2).
 * - `"return"` is back to the spot you left.
 * - **`{ target }`** — the shape the figure forms, solved backwards from its end
 *   (Q6, M7). The shape's own natural ends are replaced by the places the
 *   **target shape** gives its dancers, solved from where the shape's geometry
 *   was going to leave them: so "bend the line" writes `{ target: { shape:
 *   "ring" } }` and does not have to say where a ring of four is, and the set
 *   records that it is now standing in a ring (`planCycle.ts`).
 *
 *   A gatherer and a target are not exclusive: a figure may form a shape **and**
 *   settle it on to the formation's own places, which is what `bend-the-line`
 *   does and what stops a ring drifting a pixel a time through.
 */
export type EndsRule = "home" | "relative" | "return" | { target: TargetShape };

/** How a figure stretches to the count the card gives it (D3). */
export interface TimingProfile {
  /** Whether extra beats buy distance (a walk) or pace (a fixed-angle turn). */
  stretch: "distance" | "pace";
  /**
   * The motion profile the shape is sampled with.
   *
   * `"trapezoid"` is what the swing, the allemande and the do-si-do use today
   * and keep using; `"smooth"` is a plain ramp. M10 adds `cruise` and `gait`
   * and sets them per definition (R4).
   */
  profile: "smooth" | "trapezoid" | "cruise" | "gait";
}

/** A figure in the library. */
export interface FigureDefinition {
  id: string;
  /** What the caller says. The registry's coded figure still owns the spoken line. */
  call?: string;
  /** What the dancers do, in a caller's words. */
  describe?: string;
  /** How many beats before the figure the caller starts saying it. */
  lead?: Beat;
  /** The figure's own natural count; a call's own count overrides it (D3). */
  nominalBeats: Beat;
  roles: readonly FigureRole[];
  actors: ActorRule;
  anchor: AnchorRule;
  params: ParamSpec;
  shape: FigureShape;
  holds: readonly HoldSpec[];
  ends: EndsRule;
  timing: TimingProfile;
  /**
   * The figure's own symmetries, as data: which of its parameters are handed,
   * which name a contra role, and whether it turns into itself.
   *
   * A definition without one is simply not claimed to be symmetric, which is
   * different from being claimed asymmetric — `symmetry.ts`'s two transforms
   * return it unchanged rather than guessing. See {@link Symmetry}.
   */
  symmetry?: Symmetry;
}

export type { Symmetry } from "./symmetry.js";

/** Re-exported so a definition file needs one import, not two. */
export type {
  Moment,
  NumberExpr,
  AngleExpr,
  BoolExpr,
  SideExpr,
  PointExpr,
  PoseExpr,
  RoleExpr,
} from "./expr.js";
export type { Side };
