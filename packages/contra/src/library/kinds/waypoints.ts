import type { Angle, Beat, Hand, Side, Vec2 } from "@caller/core";
import { addScaled, angleLerp, dirOf, dist, lerp, ramp } from "@caller/core";
import type { FigurePlan, HandJoin, LocalHand, Spot, Spots } from "../../figures/ContraFigure.js";
import { bearing, joinedHands, midpoint } from "../../figures/ContraFigure.js";
import type {
  AngleExpr,
  FigureRole,
  HoldSpec,
  Moment,
  NumberExpr,
  SideExpr,
  WaypointShape,
} from "../FigureDefinition.js";
import type { ExprEnv, PointExpr, PoseExpr } from "../expr.js";
import { evalAngle, evalMoment, evalNumber, evalPoint, evalSide } from "../expr.js";
import type { ShapeInput } from "../interpret.js";
import { settleEnds } from "./places.js";

/**
 * **The waypoint route** (M6): a dancer's own written route, waypoint by
 * waypoint, with the passes marked.
 *
 * M6 wrote this against `path`, which M2 had admitted to the shape union and M4
 * owned; the two milestones ran in parallel and arrived with different ideas of
 * what a written route is. On the rebase they became **two kinds**, because they
 * answer different questions rather than the same one twice: a `path` names a
 * *curve* and a *pairing* (`kinds/path.ts`), which is what M4's eleven figures
 * needed, and a waypoint route names *where you are, when*, and lets its passes
 * find their own partners — which is what a pull-by and a grand right and left
 * need and what a curve vocabulary cannot say. Nothing about the geometry
 * changed in the reconciliation; only the kind's name and this file's.
 *
 * ## What it draws
 *
 * A track is a list of waypoints. Each says **when** (a {@link Moment}, so it
 * stretches with the count), **where** and **which way** (a {@link PoseExpr},
 * read in the interpreter's own calculus), and optionally how far the dancer
 * **bows** to their own left on the way — which is what makes two dancers
 * walking into each other pass right shoulders rather than collide.
 *
 * ### Tracks are matched by role, with a wildcard
 *
 * A key of `"*"` is every dancer's track. A key that is one of the *contra*
 * roles (`lark`, `robin`) is every dancer of that role — which is how a
 * circulate says "the larks cross and the robins loop" as data. Anything else
 * is a figure-role, matched by name. The wildcard exists because a figure
 * resolved in the **lane** has one part per dancer and their names are the slots
 * they are standing on, so no definition can write them down.
 *
 * ### A pass finds its own partner
 *
 * `pass` on a waypoint says "give this hand to whoever you are swapping places
 * with over this step". The partner is found **geometrically** — the dancer
 * whose start of the step is your end of it and whose end is your start — which
 * is the whole of what a pull-by is, and is what lets one grand right and left
 * take three different hands with three different dancers without a definition
 * naming any of them. A step whose swap has nobody in it (the end of the line)
 * takes no hand and is simply walked, which is M6's end-of-set rule seen from
 * inside a figure.
 */

/** One waypoint of a track. */
export interface PathStep {
  /** The beat of the figure this waypoint is reached at. */
  at: Moment;
  /** Where the dancer is then, and which way they look. */
  pose: PoseExpr;
  /** How far the dancer bows to their **own left** on the way, px. */
  bow?: NumberExpr;
  /** Give this hand to whoever you swap places with over this step. */
  pass?: SideExpr;
  /** How far below shoulder height a passing hand sits, px. */
  drop?: NumberExpr;
  /**
   * **Get there round a circle, not along a line** (M7).
   *
   * A cast off goes *around* the inactive and a loop goes *around* nothing at
   * all and comes back — neither is a straight leg with a bow on it, and a bow
   * cannot make a leg that starts and ends in the same place go anywhere. So a
   * leg may name a centre and a sweep instead: the dancer rides the circle
   * through `turn` degrees, and the radius and the phase are read off where the
   * leg begins.
   *
   * The waypoint's own `pose` still says where the leg ends, and it should be
   * where the arc lands; where the two disagree the dancer is eased from the arc
   * on to the written end over the leg, which is what lets a cast off settle on
   * to the formation's own place without leaving the circle early.
   */
  around?: { centre: PointExpr; turn: AngleExpr };
  /**
   * How far the body turns over this leg, signed degrees, instead of being
   * lerped on to the waypoint's own facing.
   *
   * What "turn alone" needs: a whole turn ends on the facing it started from, so
   * a facing lerp draws nothing at all. With a spin the body really turns, and
   * the leg's end facing is still the truth about where it stops.
   */
  spin?: AngleExpr;
}

/** A leg of one dancer's path, resolved to numbers. */
interface Leg {
  from: Spot;
  to: Spot;
  start: Beat;
  end: Beat;
  bow: number;
  pass?: Side;
  drop: number;
  /** Ride a circle about this point, sweeping this many degrees (M7). */
  around?: { centre: Vec2; turn: number };
  /** Turn the body this much over the leg instead of lerping its facing (M7). */
  spin?: number;
}

/** The environment a path's expressions are read in. */
const envFor = (input: ShapeInput, self: FigureRole, t: Beat): ExprEnv => ({
  ctx: input.ctx,
  params: input.params,
  beats: input.beats,
  self,
  t,
  order: input.roles,
  anchor: input.anchor.centre,
  ...(input.slots === undefined ? {} : { slots: input.slots }),
});

/** Which track a role dances: its own name, its contra role, or the wildcard. */
function trackFor(shape: WaypointShape, input: ShapeInput, role: FigureRole): readonly PathStep[] {
  const tracks = shape.tracks as Readonly<Record<string, readonly PathStep[]>>;
  const byName = tracks[role];
  if (byName) return byName;
  const byRole = tracks[input.ctx.role(role)];
  if (byRole) return byRole;
  const wild = tracks["*"];
  if (wild) return wild;
  throw new Error(`waypoints: no track for "${role}" (have: ${Object.keys(tracks).join(", ")})`);
}

/** Every dancer's legs, in order, ending where the figure leaves them. */
function legsOf(shape: WaypointShape, input: ShapeInput): Map<FigureRole, Leg[]> {
  const out = new Map<FigureRole, Leg[]>();
  for (const role of input.roles) {
    const steps = trackFor(shape, input, role);
    if (steps.length === 0) throw new Error(`path: "${role}" has an empty track`);
    const legs: Leg[] = [];
    let from = input.ctx.spot(role);
    let start: Beat = 0;
    for (const step of steps) {
      const env = envFor(input, role, start);
      const end = evalMoment(step.at, env);
      const to: Spot = { p: evalPoint(step.pose.p, env), facing: evalAngle(step.pose.facing, env) };
      legs.push({
        from,
        to,
        start,
        end,
        bow: step.bow === undefined ? 0 : evalNumber(step.bow, env),
        ...(step.pass === undefined ? {} : { pass: evalSide(step.pass, env) }),
        drop: step.drop === undefined ? 0 : evalNumber(step.drop, env),
        ...(step.around === undefined
          ? {}
          : {
              around: {
                centre: evalPoint(step.around.centre, env),
                turn: evalAngle(step.around.turn, env),
              },
            }),
        ...(step.spin === undefined ? {} : { spin: evalAngle(step.spin, env) }),
      });
      from = to;
      start = end;
    }
    out.set(role, legs);
  }
  return out;
}

/** How close two points have to be to count as the same place, px. */
const SAME_PLACE_PX = 0.5;

/**
 * Who each dancer swaps places with on each leg: the pass partner.
 *
 * Geometric on purpose — see the module note. Two dancers pass when each ends
 * the leg where the other began it, which is exactly the shape of a pull-by and
 * of every hand of a grand right and left.
 */
function passPartners(
  legs: Map<FigureRole, Leg[]>,
): Map<FigureRole, Array<FigureRole | undefined>> {
  const roles = [...legs.keys()];
  const out = new Map<FigureRole, Array<FigureRole | undefined>>();
  for (const role of roles) {
    const mine = legs.get(role)!;
    out.set(
      role,
      mine.map((leg, i) => {
        if (leg.pass === undefined) return undefined;
        for (const other of roles) {
          if (other === role) continue;
          const theirs = legs.get(other)?.[i];
          if (!theirs) continue;
          if (
            dist(theirs.from.p, leg.to.p) < SAME_PLACE_PX &&
            dist(theirs.to.p, leg.from.p) < SAME_PLACE_PX
          ) {
            return other;
          }
        }
        return undefined;
      }),
    );
  }
  return out;
}

/** The leg a beat falls in, and how far along it. */
function atBeat(legs: readonly Leg[], t: Beat): { leg: Leg; k: number; index: number } {
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    if (t <= leg.end || i === legs.length - 1) {
      return { leg, k: ramp(t, leg.start, leg.end), index: i };
    }
  }
  const last = legs[legs.length - 1]!;
  return { leg: last, k: 1, index: legs.length - 1 };
}

/** Where a dancer is part way along a leg, bowed to their own left. */
function place(leg: Leg, k: number): Spot {
  const facing =
    leg.spin === undefined
      ? angleLerp(leg.from.facing, leg.to.facing, k)
      : leg.from.facing + leg.spin * k;
  if (leg.around) {
    // Ride the circle, then ease on to the written end: at `k = 1` the two
    // agree wherever the definition meant them to, and where they do not the
    // dancer arrives at the end the definition wrote rather than at the arc's.
    const { centre, turn } = leg.around;
    const r = dist(centre, leg.from.p);
    const from = bearing(centre, leg.from.p);
    const onArc = addScaled(centre, dirOf(from + turn * k), r);
    const lands = addScaled(centre, dirOf(from + turn), r);
    // The arc keeps its shape and the gap to the written end is spent along the
    // way, so a cast that settles on to the formation's own place still goes
    // round the pivot rather than cutting the corner.
    const gap: Vec2 = [leg.to.p[0] - lands[0], leg.to.p[1] - lands[1]];
    return { p: [onArc[0] + gap[0] * k * k, onArc[1] + gap[1] * k * k], facing };
  }
  const p = lerp(leg.from.p, leg.to.p, k);
  if (leg.bow === 0) return { p, facing };
  // A half-sine, so the bow is nothing at both ends and widest half way: the
  // dancers come apart, go past each other and come back on to the line.
  const along = bearing(leg.from.p, leg.to.p);
  const out: Angle = along - 90;
  return { p: addScaled(p, dirOf(out), leg.bow * Math.sin(Math.PI * k)), facing };
}

/** **M6's `path`**: every dancer walks their own written route. */
export function planWaypoints(
  shape: WaypointShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  if (holds.length > 0) {
    throw new Error(
      `path: a hold belongs on the waypoint that passes it, not on the definition (M6)`,
    );
  }
  const legs = legsOf(shape, input);
  const partners = passPartners(legs);

  const natural: Spots = {};
  for (const role of input.roles) {
    const mine = legs.get(role)!;
    natural[role] = mine[mine.length - 1]!.to;
  }
  const ends = settleEnds(input, natural);

  const spotAt = (role: FigureRole, t: Beat): Spot => {
    const found = atBeat(legs.get(role)!, t);
    // The last leg is taken to the figure's honest ends, which `ends: "home"`
    // may have moved on to the formation's own places.
    const last = found.index === legs.get(role)!.length - 1;
    const leg = last ? { ...found.leg, to: ends[role] ?? found.leg.to } : found.leg;
    return place(leg, found.k);
  };

  const joinsAt = (t: Beat): HandJoin[] => {
    const out: HandJoin[] = [];
    for (const role of input.roles) {
      const found = atBeat(legs.get(role)!, t);
      const side = found.leg.pass;
      const other = partners.get(role)?.[found.index];
      if (side === undefined || other === undefined) continue;
      if (role > other) continue;
      out.push({ a: role, aSide: side, b: other, bSide: side });
    }
    return out;
  };

  return {
    ends,
    joinsAt,
    at(role, t) {
      const self = spotAt(role, t);
      const hands: { L: LocalHand; R: LocalHand } = { L: "down", R: "down" };
      const found = atBeat(legs.get(role)!, t);
      const side = found.leg.pass;
      const other = partners.get(role)?.[found.index];
      if (side !== undefined && other !== undefined) {
        const hand = passingHand(input, role, other, self, spotAt(other, t), found.leg.drop);
        hands[side] = hand;
      }
      const moving = found.k > 0 && found.k < 1;
      return {
        p: self.p,
        facing: self.facing,
        hands,
        stepRate: moving ? 1 : 0,
        amp: moving ? 1 : 0,
      };
    },
  };
}

/** The one shared floor point two passing dancers put their joined hands on. */
function passingHand(
  input: ShapeInput,
  role: FigureRole,
  other: FigureRole,
  self: Spot,
  theirs: Spot,
  drop: number,
): Hand {
  const point: Vec2 = midpoint(self.p, theirs.p);
  const both = joinedHands(input.ctx, role, other, point, drop, 0);
  const mine = both[role];
  if (!mine) throw new Error(`path: no joined hand for "${role}"`);
  return mine;
}
