import type { Angle, Beat, Hand, PoseSample, Side, Vec2 } from "@caller/core";
import {
  HOLD_SPACING_PX,
  angleDiff,
  angleOfVec,
  dist,
  lerpHand,
  mix,
  ramp,
  shouldersAt,
  sub,
} from "@caller/core";
import type {
  EndPose,
  FigureDef,
  FigureParams,
  Frame,
  Group,
  RoleName,
  RoleSet,
  Station,
  StationId,
} from "@caller/choreo";
import { frame, frameAngle, framePoint, joinHands, walkStep } from "@caller/choreo";
import { handDown } from "../pair/PairFrame.js";

/**
 * The contra figure library's own contract, on top of `@caller/choreo`'s
 * {@link FigureDef}.
 *
 * Two things every contra figure needs that the engine's contract does not
 * give it, and one it gives back:
 *
 * - **Where the dancers already are.** `sample` is pure and only sees the
 *   group, so a figure that starts anywhere but the stations has to be told:
 *   `from` carries the dancers' places, in the group frame's own axes, and
 *   defaults to the stations. A dance threads them with {@link chainCalls}.
 * - **Frame-local geometry.** Every figure here does its maths in the frame's
 *   local px — local +y along the set, +x across it — and is turned into world
 *   px once, at the boundary. The transform is rigid, so `shouldersAt`,
 *   `bodyPoint`, `solveArm` and the rest are the same either side of it, and a
 *   figure's `ends` come out exact rather than through a round trip.
 * - **`moves`**, which is the same end places without a group: what
 *   {@link chainCalls} composes to thread a dance.
 *
 * Passing convention: in this coordinate system (y down, angles from +x toward
 * +y) two dancers pass **right shoulders** when each bows to their own **left**
 * — see {@link passRight}.
 */
export interface Spot {
  /** Where the dancer stands, in frame-local px. */
  p: Vec2;
  /** Which way they face, in frame-local degrees. */
  facing: Angle;
}

/** Where every dancer of a group stands, in frame-local px. */
export type Spots = Record<StationId, Spot>;

/** What every contra figure's parameters carry. */
export interface ContraParams extends FigureParams {
  /**
   * Where each dancer stands when the figure starts, in frame-local px. An
   * empty object — the default — means the group's own stations.
   */
  from: Spots;
}

/** A hand a figure places, in frame-local px, or one left hanging. */
export type LocalHand = Hand | "down";

/** One dancer's pose in frame-local px; everything but `p`, `facing` and `hands` defaults. */
export interface LocalSample {
  p: Vec2;
  facing: Angle;
  look?: Angle;
  lean?: number;
  hands: { L: LocalHand; R: LocalHand };
  stepRate?: number;
  buzz?: boolean;
  flare?: number;
  amp?: number;
  feet?: { L: Vec2; R: Vec2 };
}

/** Two hands the figure is holding as one shared floor point at this instant. */
export interface HandJoin {
  a: StationId;
  aSide: Side;
  b: StationId;
  bSide: Side;
}

/** A figure, planned for one group: everybody's motion and where it leaves them. */
export interface FigurePlan {
  /** One dancer's pose `t` beats in, in frame-local px. */
  at(station: StationId, t: Beat): LocalSample;
  /** Where every station's dancer stands when it is over, frame-local. */
  ends: Spots;
  /** The hands held as one point at `t`; empty when nothing is joined. */
  joinsAt(t: Beat): HandJoin[];
}

/** Everything a plan needs about the group, without the frame. */
export interface PlanContext {
  stations: readonly Station[];
  ids: StationId[];
  roleSet: RoleSet;
  /** How far apart two dancers stand to join hands, px. */
  spacing: number;
  /** Where each dancer starts, frame-local. */
  start: Spots;
  spot(station: StationId): Spot;
  role(station: StationId): RoleName;
}

/** A contra figure: a {@link FigureDef} that also says where it leaves people. */
export interface ContraFigure<P extends ContraParams = ContraParams> extends FigureDef<P> {
  /** The figure planned for a group, in frame-local px. */
  plan(ctx: PlanContext, params: P): FigurePlan;
  /** Where the figure leaves every dancer, frame-local: what a dance chains on. */
  moves(params: P, stations: readonly Station[], spacing?: number): Spots;
}

/** What {@link contraFigure} needs to make one. */
export interface ContraFigureSpec<P extends ContraParams> {
  id: string;
  call: string;
  /** What the dancers do, in a caller's words. See {@link FigureDef.describe}. */
  describe: string;
  lead: Beat;
  beats: Beat;
  defaults: Omit<P, "beats">;
  plan(ctx: PlanContext, params: P): FigurePlan;
}

/**
 * A contra figure from its plan: the plan does the geometry in frame-local px
 * and this wraps it in the engine's contract.
 */
export function contraFigure<P extends ContraParams>(spec: ContraFigureSpec<P>): ContraFigure<P> {
  const planOf = (group: Group, params: P): FigurePlan =>
    spec.plan(planContext(group.stations, group.roleSet, group.frame.spacing, params.from), params);

  return {
    id: spec.id,
    call: spec.call,
    describe: spec.describe,
    lead: spec.lead,
    beats: spec.beats,
    defaults: spec.defaults,
    plan: spec.plan,

    sample(group: Group, station: StationId, t: Beat, params: P): PoseSample {
      const clamped = t < 0 ? 0 : t > params.beats ? params.beats : t;
      return worldPose(group.frame, planOf(group, params).at(station, clamped));
    },

    ends(group: Group, params: P): Record<StationId, EndPose> {
      const out: Record<StationId, EndPose> = {};
      for (const [id, spot] of Object.entries(planOf(group, params).ends)) {
        out[id] = worldSpot(group.frame, spot);
      }
      return out;
    },

    moves(params: P, stations: readonly Station[], spacing: number = HOLD_SPACING_PX): Spots {
      return spec.plan(planContext(stations, CHAIN_ROLES, spacing, params.from), params).ends;
    },
  };
}

/**
 * The role set {@link ContraFigure.moves} plans with. Only hand stacking reads
 * it and stacking never moves a foot, so which role set a chain is computed
 * with cannot change where a figure leaves anybody.
 */
const CHAIN_ROLES: RoleSet = { roles: ["lark", "robin"], top: "robin" };

/** The context a plan runs in, with `from` filled in from the stations. */
export function planContext(
  stations: readonly Station[],
  roleSet: RoleSet,
  spacing: number,
  from: Spots,
): PlanContext {
  const start: Spots = {};
  const roles: Record<StationId, RoleName> = {};
  for (const station of stations) {
    const given = from[station.id];
    start[station.id] = given ?? { p: station.p, facing: station.facing };
    roles[station.id] = station.role;
  }
  return {
    stations,
    ids: stations.map((s) => s.id),
    roleSet,
    spacing,
    start,
    spot(station) {
      const found = start[station];
      if (!found) throw new Error(`no station "${station}" in [${Object.keys(start).join(", ")}]`);
      return found;
    },
    role(station) {
      const found = roles[station];
      if (!found) throw new Error(`no station "${station}" in [${Object.keys(roles).join(", ")}]`);
      return found;
    },
  };
}

/** The frame a chain is computed in: local px are the same in any of them. */
export const CHAIN_FRAME: Frame = frame([0, 0], 90, HOLD_SPACING_PX);

/** One frame-local pose in world px. */
export const worldSpot = (f: Frame, s: Spot): EndPose => ({
  p: framePoint(f, s.p),
  facing: frameAngle(f, s.facing),
});

/** One frame-local hand in world px. */
export const worldHand = (f: Frame, h: LocalHand): Hand | "down" =>
  h === "down" ? "down" : { p: framePoint(f, h.p), drop: h.drop };

/** One frame-local sample as the pose the engine and the renderer want. */
export function worldPose(f: Frame, s: LocalSample): PoseSample {
  const pose: PoseSample = {
    p: framePoint(f, s.p),
    facing: frameAngle(f, s.facing),
    look: frameAngle(f, s.look ?? s.facing),
    lean: s.lean ?? 0,
    hands: { L: worldHand(f, s.hands.L), R: worldHand(f, s.hands.R) },
    stepRate: s.stepRate ?? 1,
    buzz: s.buzz ?? false,
    flare: s.flare ?? 0,
    amp: s.amp ?? 1,
  };
  return s.feet === undefined ? pose : { ...pose, feet: s.feet };
}

/** A spot, as the {@link EndPose} the walk helpers take. */
export const asPose = (s: Spot): EndPose => ({ p: s.p, facing: s.facing });

/**
 * Walk from one spot to another, bowing `bowPx` to the dancer's own **left** so
 * two dancers swapping places pass **right shoulders**.
 *
 * `@caller/choreo`'s `walkStep` bows to the dancer's right, which in this
 * coordinate system passes left shoulders: with y down, a dancer facing 90°
 * (down the set) has their right at 180° (−x), so two dancers who both bow
 * right put their *left* shoulders together. Right-shoulder passing is the
 * contra convention, hence the negative bow here.
 */
export const passRight = (from: Spot, to: Spot, t: Beat, beats: Beat, bowPx = 0) =>
  walkStep(asPose(from), asPose(to), t, beats, -bowPx);

/** The shared floor point where two dancers' named hands meet. */
export function joinPoint(a: Spot, aSide: Side, b: Spot, bSide: Side): Vec2 {
  const sa = shouldersAt(a.p, a.facing)[aSide];
  const sb = shouldersAt(b.p, b.facing)[bSide];
  return [(sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2];
}

/**
 * The two hands of a join, as one floor point, stacked with the role set's top
 * role on top. Returns the hand for each of the two stations.
 */
export function joinedHands(
  ctx: PlanContext,
  a: StationId,
  b: StationId,
  p: Vec2,
  drop: number,
  stackPx = 0,
): Record<StationId, Hand> {
  const roleA = ctx.role(a);
  const roleB = ctx.role(b);
  if (roleA === roleB) {
    // Two dancers of the same role join hands at the same point; nothing in the
    // role set distinguishes them, so neither hand is raised.
    return { [a]: { p, drop }, [b]: { p, drop } };
  }
  const byRole = joinHands(p, drop, [roleA, roleB], ctx.roleSet, stackPx);
  const handA = byRole[roleA];
  const handB = byRole[roleB];
  if (!handA || !handB) throw new Error(`no joined hand for roles ${roleA}/${roleB}`);
  return { [a]: handA, [b]: handB };
}

/**
 * A hand that rises from the dancer's side to a joined point and goes back
 * down again: every take and every release is animated, never a snap.
 *
 * Both dancers of a join lerp toward the **same** point, so the two hands meet
 * exactly when the take is done and stay one point until the release starts.
 * `t` is the figure's own beat, which is also the step phase the hanging hand
 * swings on.
 */
export function takeAndRelease(
  self: Spot,
  side: Side,
  t: Beat,
  joined: Hand,
  window: HoldWindow,
  swing = 0,
): Hand {
  const down = handDown(self.p, self.facing, side, t, swing);
  const taken = lerpHand(down, joined, ramp(t, window.takeFrom, window.takeTo));
  return lerpHand(taken, down, ramp(t, window.releaseFrom, window.releaseTo));
}

/** When a figure's hands are on their way up, held, and on their way down. */
export interface HoldWindow {
  takeFrom: Beat;
  takeTo: Beat;
  releaseFrom: Beat;
  releaseTo: Beat;
}

/** The window for a figure of `beats` that takes hands early and drops them at the end. */
export const holdWindow = (beats: Beat, take: Beat = 1, release: Beat = 1): HoldWindow => ({
  takeFrom: 0,
  takeTo: Math.min(take, beats / 2),
  releaseFrom: Math.max(beats - release, beats / 2),
  releaseTo: beats,
});

/** True while the hands of `window` are fully joined. */
export const isHeld = (window: HoldWindow, t: Beat): boolean =>
  t >= window.takeTo && t <= window.releaseFrom;

/**
 * How much room a figure for two leaves the pair dancing beside it, px.
 *
 * Two pairs of a minor set turn at once, and in duple improper their centres
 * are one place pitch — 20 px — apart while the lines are 32 px apart. A pair
 * turning at half their own separation would walk through the pair beside them,
 * so a turn for two takes a tighter radius when another pair is close. See
 * {@link orbitRadius}, and the README for the number this comes out of.
 */
export const CLEARANCE_PX = 8.5;

/** The biggest turning radius that leaves {@link CLEARANCE_PX} to the nearest other pair. */
export function orbitRadius(
  want: number,
  centre: Vec2,
  centres: readonly Vec2[],
  clearance = CLEARANCE_PX,
): number {
  let nearest = Infinity;
  for (const other of centres) {
    const gap = dist(centre, other);
    if (gap > 1e-9) nearest = Math.min(nearest, gap);
  }
  if (!Number.isFinite(nearest)) return want;
  return Math.max(0, Math.min(want, (nearest - clearance) / 2));
}

/** Where a spot's centre is, as a plain pose. */
export const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The centre of a set of spots. */
export function centreOf(spots: readonly Spot[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const s of spots) {
    x += s.p[0];
    y += s.p[1];
  }
  return [x / spots.length, y / spots.length];
}

/** How far apart two spots stand. */
export const spotGap = (a: Spot, b: Spot): number => dist(a.p, b.p);

/** The angle from one point to another. */
export const bearing = (from: Vec2, to: Vec2): Angle => angleOfVec(sub(to, from));

/** A point `r` px from `centre` at `angle`. */
export const polar = (centre: Vec2, angle: Angle, r: number): Vec2 => {
  const t = (angle * Math.PI) / 180;
  return [centre[0] + Math.cos(t) * r, centre[1] + Math.sin(t) * r];
};

/**
 * Turn an angle so it is within half a turn of `near`, keeping the same
 * direction on the floor. Used to take the short way round between two facings.
 */
export const nearestTurn = (near: Angle, a: Angle): Angle => near + angleDiff(near, a);

/** Linear interpolation of an angle by the shortest arc, unclamped. */
export const turnBy = (a: Angle, degrees: number, k: number): Angle => a + degrees * k;

/** Scalar mix, re-exported so a figure file needs one import fewer. */
export { mix };
