import type { Beat, Side } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraParams, PlanContext } from "../ContraFigure.js";
import type { AngleExpr, NumberExpr, PointExpr, PoseExpr, StationExpr } from "./expr.js";

/**
 * A figure written as data: what a caller says, how long it runs, its tuning
 * defaults, how every dancer moves, and what their hands do.
 *
 * `compileFigureSpec` turns one of these into the same `ContraFigure` a coded
 * figure already is, so nothing downstream — the registry, the decider,
 * `chainCalls`, the oracles, the renderer — can tell the two apart.
 *
 * M1 carries only what `circle` needs. `describe` and `assertions` (the plan's
 * decision 4) are M5's; `pairing`, `walk`, `orbitPair` and `oscillate` are
 * M2/M4/M6's. The one piece deliberately reserved ahead of its milestone is
 * {@link HandSpec}'s `"carried"` case, so M3 widens no closed union.
 */
export interface FigureSpec {
  id: string;
  /** What the caller says, e.g. `"CIRCLE LEFT"`. */
  call: string;
  /** How many beats before the figure the caller starts saying it. */
  lead: Beat;
  /** The figure's natural duration. */
  beats: Beat;
  /**
   * Tuning defaults, by parameter name. `from` is not written here: the
   * compiler adds the empty `from` every contra figure's defaults carry, so a
   * spec stays plain JSON with no geometry in its defaults.
   */
  defaults: Readonly<Record<string, number | string | boolean>>;
  /** How each dancer moves, by track key. See {@link trackFor}. */
  tracks: Readonly<Record<string, readonly Segment[]>>;
  /** What each dancer's two hands do, by the same keys as {@link FigureSpec.tracks}. */
  hands: Readonly<Record<string, { L: HandSpec; R: HandSpec }>>;
}

/**
 * One stretch of a dancer's motion.
 *
 * M1 has one kind. `walk`, `orbitPair` and `oscillate` are later milestones',
 * and the union is open on purpose: adding a kind is additive, and the
 * compiler's `switch` fails to compile when one is added without an evaluator.
 */
export type Segment = RingWalkSegment;

/**
 * Walk the group's own regular ring `places` places round: step on to the ring
 * over `inBeats`, turn, step off to `end` over `outBeats`.
 *
 * `places` is signed — positive is the way the ring order runs, which is the
 * way a circle left travels — and the turn it makes is `places` times the
 * ring's own place pitch.
 *
 * `end` is part of the segment rather than a separate `ends` field on the spec
 * because the segment is the thing that decides where the dancer is left; a
 * track's last segment is the figure's `ends`. It is written out as
 * expressions rather than derived from `places` because a figure's end facing
 * is its own choice — `circle` faces the middle, a star faces across it — and
 * deriving it would have meant an identity (`bearing(p, centre)` versus
 * `bearing(centre, p) + 180`) that is not exact in floating point.
 */
export interface RingWalkSegment {
  kind: "ringWalk";
  /** How many ring places the dancer travels, signed. */
  places: NumberExpr;
  /** Where the body points relative to the ring angle: 180 faces the centre. */
  faceOffset: AngleExpr;
  /** Beats spent stepping in to the ring. */
  inBeats: NumberExpr;
  /** Beats spent stepping out of it again. */
  outBeats: NumberExpr;
  /** Where this segment leaves the dancer. */
  end: PoseExpr;
}

/** What one of a dancer's hands does for the length of a figure. */
export type HandSpec = DownHand | CarriedHand | JoinedHand;

/**
 * A hand left hanging at the dancer's side.
 *
 * `swing` is how much of the step's arm swing it carries, 0 to 1; the coded
 * figures pick per figure (a do-si-do swings its arms, an allemande does not),
 * so the spec says which rather than the compiler choosing. It defaults to 0,
 * which is what most of the library uses.
 */
export interface DownHand {
  hand: "down";
  swing?: NumberExpr;
}

/**
 * A hand still holding whatever it held when the previous figure ended, with
 * no take and no release at the seam.
 *
 * Reserved by the type so M3 does not have to widen a closed union; M1's
 * compiler rejects it, because the data shape it reads — the carried hold
 * threaded through `chainCalls` — does not exist yet.
 */
export interface CarriedHand {
  hand: "carried";
}

/**
 * A hand joined to another dancer's at one shared floor point.
 *
 * The join names both of its ends outright rather than saying "me and them",
 * so the interpreter never has to guess which way round the pair goes: the
 * order decides nothing about the point (it is a midpoint) but it is what
 * `joinsAt` reports, and writing it down keeps a compiled figure's joins the
 * same records a coded one's are. Exactly one of `a` and `b` must be the
 * dancer whose hand this is, on the side this hand is.
 */
export interface JoinedHand {
  hand: "joined";
  a: { station: StationExpr; side: Side };
  b: { station: StationExpr; side: Side };
  /** The shared floor point, usually `{ point: "joinPoint", … }`. */
  point: PointExpr;
  /** How far below shoulder height the joined hands sit, px. */
  drop: NumberExpr;
  /** How much higher the role set's top role's hand sits, px. */
  stackPx?: NumberExpr;
  /** When the hand goes up and when it comes down. */
  window: HoldWindowSpec;
}

/**
 * When a hold is taken and dropped, as the beats `holdWindow` takes: `take`
 * beats to rise at the start, `release` beats to fall at the end.
 */
export interface HoldWindowSpec {
  take: NumberExpr;
  release: NumberExpr;
}

/**
 * Which key of a spec's `tracks`/`hands` a station reads: its own id first,
 * then its role name, then `"all"`.
 *
 * Three levels rather than one because a figure for a whole ring says one
 * thing to everybody, a figure with roles says one thing to the larks and
 * another to the robins, and a figure with a host says one thing to that
 * station alone. `circle` uses only `"all"`.
 */
export function trackFor(
  keyed: Readonly<Record<string, unknown>>,
  ctx: PlanContext,
  station: StationId,
): string {
  const role = ctx.role(station);
  for (const key of [station, role, "all"]) {
    if (key in keyed) return key;
  }
  throw new Error(
    `no track for station "${station}" (role "${role}") in [${Object.keys(keyed).join(", ")}]`,
  );
}

/** A compiled figure's parameters: the contra ones, plus whatever the spec names. */
export interface SpecParams extends ContraParams {
  [key: string]: unknown;
}
