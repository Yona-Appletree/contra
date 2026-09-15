import type { Beat, Side } from "@caller/choreo";
import type { AngleExpr, BoolExpr, Moment, NumberExpr, SideExpr } from "./expr.js";

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
  /** How many of the figure's beats this part takes; the rest go to `"rest"`. */
  beats: NumberExpr | "rest";
  shape: FigureShape;
  /** The holds this part takes, in the same form a definition's own are. */
  holds: readonly HoldSpec[];
}

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
 * Walk the instance's own regular ring so many places round. **M4.**
 *
 * Admitted here, and dispatched by `kinds/index.ts`, so that M4 writes the
 * evaluator and touches no union and no `switch` exhaustiveness. Until then
 * the interpreter throws by name.
 */
export interface RingWalkShape {
  kind: "ringWalk";
  places: NumberExpr;
  faceOffset: AngleExpr;
  inBeats: NumberExpr;
  outBeats: NumberExpr;
}

/** A dancer's own written path, per figure-role. **M4.** */
export interface PathShape {
  kind: "path";
  tracks: Readonly<Record<string, readonly unknown[]>>;
}

/** What the figure actually draws. */
export type FigureShape =
  LegacyShape | SequenceShape | OrbitPairShape | RockShape | RingWalkShape | PathShape;

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
  /** Half way between the two bodies: a one-hand balance. */
  | { kind: "midpoint" }
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
export type HoldSpec = PairHold | RingHold;

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
 * - `"return"` is back to the spot you left and `{ target }` is a target shape
 *   solved backwards (Q6, M7).
 */
export type EndsRule = "home" | "relative" | "return" | { target: string };

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
}

/** Re-exported so a definition file needs one import, not two. */
export type { Moment, NumberExpr, AngleExpr, BoolExpr, SideExpr } from "./expr.js";
export type { Side };
