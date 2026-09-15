import type { Angle, Beat, Hand, PoseSample, Side, Vec2 } from "@caller/core";
import { HOLD_SPACING_PX, angleDiff, dist, lerpHand, mix, ramp } from "@caller/core";
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

/**
 * One hand that is already joined when a figure starts, or still joined when it
 * ends: whose hand it is in, and which of their hands.
 */
export interface CarriedHold {
  /** The other dancer's station. */
  with: StationId;
  /** Which of *their* hands. */
  side: Side;
}

/** What one dancer carries, by their own hand. */
export type CarriedHands = Partial<Record<Side, CarriedHold>>;

/**
 * The hands nobody lets go of at a figure boundary, keyed by station and side.
 *
 * The user: "the arms still disappear between the balance and the swing." When
 * one figure ends holding a hand and the next begins holding the **same** hand
 * of the **same** two dancers, the hand is one shared floor point across the
 * seam and moves continuously from where the first figure held it to where the
 * second does. Only a hold that actually changes — a different partner, a
 * different hand, or none — is released and retaken.
 *
 * It is plain data, keyed by station id and side, so a dance still survives
 * `JSON.parse(JSON.stringify(dance))`. {@link chainCalls} works it out by
 * asking each figure what it is holding at its end and what the next one holds
 * through its middle, so a dance never writes it by hand. M11's M3 is where it
 * becomes `{ hand: "carried" }` in the data language.
 */
export interface Carried {
  /** Hands already joined at beat 0, so the figure does not take them. */
  in: Record<StationId, CarriedHands>;
  /** Hands still joined at the last beat, so the figure does not let go. */
  out: Record<StationId, CarriedHands>;
}

/** Nothing carried either way: what a figure danced on its own gets. */
export const NO_CARRIED: Carried = { in: {}, out: {} };

/** What every contra figure's parameters carry. */
export interface ContraParams extends FigureParams {
  /**
   * Where each dancer stands when the figure starts, in frame-local px. An
   * empty object — the default — means the group's own stations.
   */
  from: Spots;
  /**
   * Which hands are carried across this figure's boundaries; see
   * {@link Carried}. Absent — which is what a figure danced on its own gets —
   * means every hold is taken at the start and let go at the end.
   */
  carried?: Carried;
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
  /**
   * What the figure is holding `t` beats in, without a group: what
   * {@link chainCalls} reads to work out which holds cross a boundary.
   */
  joins(params: P, t: Beat, stations: readonly Station[], spacing?: number): HandJoin[];
}

/** What {@link contraFigure} needs to make one. */
export interface ContraFigureSpec<P extends ContraParams> {
  id: string;
  call: string;
  /**
   * What the dancers do, in a caller's words. See {@link FigureDef.describe}.
   *
   * Optional on the spec so a figure compiled from data can leave it out; the
   * registry test insists every figure in `createContraRegistry()` has one.
   */
  describe?: string;
  lead: Beat;
  beats: Beat;
  /**
   * Everything but `beats` and `carried`: a figure never declares its own
   * carried holds, because {@link chainCalls} is what works them out and a
   * figure danced alone carries nothing.
   */
  defaults: Omit<P, "beats" | "carried">;

  plan(ctx: PlanContext, params: P): FigurePlan;
}

/**
 * How many planned figures the library keeps, over every figure at once.
 *
 * A plan is only worth caching if the cache holds every plan a frame asks
 * for, and small enough that a whole evening cannot fill memory with it. A
 * frame of the hall asks for one plan per group per figure event, twice over
 * at a seam — the eighteen-couple perf hall is about forty, the Moves gallery
 * about a hundred — while an evening's timeline holds some 1 400 figure
 * events, one params object each. 512 is comfortably above the first number
 * and well below the second, so a running page never evicts a plan it is
 * about to want and never accumulates the evening's worth either.
 */
export const PLAN_CACHE_SIZE = 512;

/**
 * Identity numbers for the objects a plan is keyed on.
 *
 * A `WeakMap` so interning an object never keeps it alive, and a number so the
 * cache itself can key on a string and use `Map`'s insertion order as its LRU
 * order.
 */
const planIds = new WeakMap<object, number>();
let planIdSeq = 0;
function planId(o: object): number {
  const seen = planIds.get(o);
  if (seen !== undefined) return seen;
  planIdSeq += 1;
  planIds.set(o, planIdSeq);
  return planIdSeq;
}

/** The plans themselves, oldest use first: a `Map` keeps its insertion order. */
const planCache = new Map<string, FigurePlan>();

/**
 * The plan for one figure, one group and one params object, built once.
 *
 * `contraFigure().sample` used to rebuild the whole {@link FigurePlan} — the
 * ends, the joins, the ring geometry, every pair lookup — for **every dancer
 * of every frame**, and again for the previous figure at a seam. That was the
 * hall's frame cost: the geometry is a pure function of the figure, the group
 * and the parameters, and none of the three changes while a frame is drawn.
 *
 * The cache is keyed on object identity, which is sound because all three are
 * immutable once a timeline holds them: a `Group` is minted fresh for every
 * time through and never written to (`@caller/choreo`'s `Group`), and the
 * decider's `withDefaults` builds a **new** params object for every figure
 * event. `moves` and `joins` deliberately do **not** go through here — they
 * are `chainCalls`' dance-build path, which does mutate `params.carried` as it
 * threads a dance, and they are called once per dance rather than once per
 * dancer per frame.
 *
 * `sample` stays pure seen from outside: the same arguments give the same
 * pose, the cache is not observable through the figure's contract, and
 * dropping every entry changes nothing but the time taken.
 */
function cachedPlan<P extends ContraParams>(
  spec: object,
  group: Group,
  params: P,
  build: (group: Group, params: P) => FigurePlan,
): FigurePlan {
  const key = `${String(planId(spec))}/${String(planId(group))}/${String(planId(params))}`;
  const hit = planCache.get(key);
  if (hit !== undefined) {
    // Re-insert, so the most recently used plan is last and the first key is
    // always the least recently used one.
    planCache.delete(key);
    planCache.set(key, hit);
    return hit;
  }
  const made = build(group, params);
  planCache.set(key, made);
  if (planCache.size > PLAN_CACHE_SIZE) {
    const oldest = planCache.keys().next();
    if (oldest.done !== true) planCache.delete(oldest.value);
  }
  return made;
}

/**
 * Empty the plan cache.
 *
 * Nothing in the running page needs this — the cache is bounded and invisible
 * — but a test that counts how often a plan is built needs to start from
 * nothing.
 */
export function clearPlanCache(): void {
  planCache.clear();
}

/** How many plans the cache is holding. For tests, and for nothing else. */
export const planCacheSize = (): number => planCache.size;

/**
 * A contra figure from its plan: the plan does the geometry in frame-local px
 * and this wraps it in the engine's contract.
 */
export function contraFigure<P extends ContraParams>(spec: ContraFigureSpec<P>): ContraFigure<P> {
  const build = (group: Group, params: P): FigurePlan =>
    spec.plan(planContext(group.stations, group.roleSet, group.frame.spacing, params.from), params);
  const planOf = (group: Group, params: P): FigurePlan => cachedPlan(spec, group, params, build);

  return {
    id: spec.id,
    call: spec.call,
    describe: spec.describe,
    lead: spec.lead,
    beats: spec.beats,
    defaults: { ...spec.defaults, carried: NO_CARRIED } as Omit<P, "beats">,
    plan: spec.plan,

    sample(group: Group, station: StationId, t: Beat, params: P): PoseSample {
      const clamped = t < 0 ? 0 : t > params.beats ? params.beats : t;
      const pose = worldPose(group.frame, planOf(group, params).at(station, clamped));
      return finiteHands(pose, spec.id, station, clamped);
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

    joins(
      params: P,
      t: Beat,
      stations: readonly Station[],
      spacing: number = HOLD_SPACING_PX,
    ): HandJoin[] {
      return spec.plan(planContext(stations, CHAIN_ROLES, spacing, params.from), params).joinsAt(t);
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

/**
 * The pose, if every hand in it is a number, and a loud failure otherwise.
 *
 * A hand that is not a number is drawn as nothing at all, and — this is the
 * part that made it survive for so long — no oracle in the repository can see
 * one: `NaN > max` is false, so every maximum steps over it silently. F3a found
 * 4160 of them across the ten demo dances, which is both arms of every dancer
 * for 0.4 beats after every balance. Nothing is going to catch the next one by
 * looking, so a figure that emits one fails here instead.
 */
export function finiteHands(
  pose: PoseSample,
  figure: string,
  station: StationId,
  t: Beat,
): PoseSample {
  for (const side of ["L", "R"] as const) {
    const hand = pose.hands[side];
    if (hand === "down") continue;
    if (Number.isFinite(hand.p[0]) && Number.isFinite(hand.p[1]) && Number.isFinite(hand.drop)) {
      continue;
    }
    throw new Error(
      `${figure}: "${station}" has a ${side} hand that is not a number at beat ${t} ` +
        `(${String(hand.p[0])}, ${String(hand.p[1])}, drop ${String(hand.drop)})`,
    );
  }
  return pose;
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
export { joinPoint } from "@caller/choreo";

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
  // A window of no length says the hold crosses the boundary: taken before the
  // figure started, or still held when it ends. Neither is a snap — the seam
  // moves the hand from where the figure before held it to where this one does.
  if (window.takeTo <= window.takeFrom && window.releaseTo <= window.releaseFrom) return joined;
  const down = handDown(self.p, self.facing, side, t, swing);
  const take = window.takeTo <= window.takeFrom ? 1 : ramp(t, window.takeFrom, window.takeTo);
  const release =
    window.releaseTo <= window.releaseFrom ? 0 : ramp(t, window.releaseFrom, window.releaseTo);
  const taken = lerpHand(down, joined, take);
  return lerpHand(taken, down, release);
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
 * The hold window for one join, with the take dropped when the hold is carried
 * in and the release dropped when it is carried out.
 *
 * `self` and `other` name the two stations and `side`/`otherSide` the two
 * hands, which is exactly what {@link Carried} is keyed by — so a figure asks
 * this once per join and never has to know how the carrying was worked out.
 */
export function joinWindowFor(
  carried: Carried | undefined,
  self: StationId,
  side: Side,
  other: StationId,
  otherSide: Side,
  beats: Beat,
  take: Beat = 1,
  release: Beat = 1,
): HoldWindow {
  return holdWindow(
    beats,
    isCarried(carried?.in, self, side, other, otherSide) ? 0 : take,
    isCarried(carried?.out, self, side, other, otherSide) ? 0 : release,
  );
}

/** Whether this side of this dancer is joined to that side of that one. */
export function isCarried(
  hands: Record<StationId, CarriedHands> | undefined,
  self: StationId,
  side: Side,
  other: StationId,
  otherSide: Side,
): boolean {
  const held = hands?.[self]?.[side];
  return held !== undefined && held.with === other && held.side === otherSide;
}

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

/**
 * The centre of a set of spots, the bearing between two points and a polar
 * offset — `@caller/choreo`'s, under the names the contra figures already use.
 *
 * These four moved down a layer with the ring geometry that reads them (B3);
 * they are re-exported rather than re-implemented so there is one of each.
 */
export { bearing, centreOf, polar } from "@caller/choreo";

/** How far apart two spots stand. */
export const spotGap = (a: Spot, b: Spot): number => dist(a.p, b.p);

/**
 * Turn an angle so it is within half a turn of `near`, keeping the same
 * direction on the floor. Used to take the short way round between two facings.
 */
export const nearestTurn = (near: Angle, a: Angle): Angle => near + angleDiff(near, a);

/** Linear interpolation of an angle by the shortest arc, unclamped. */
export const turnBy = (a: Angle, degrees: number, k: number): Angle => a + degrees * k;

/** Scalar mix, re-exported so a figure file needs one import fewer. */
export { mix };
