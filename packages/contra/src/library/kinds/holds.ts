import type { Beat, Hand } from "@caller/core";
import { addScaled, dirOf, dist, norm, ramp, sub } from "@caller/core";
import type { Side } from "@caller/choreo";
import type { HandJoin, HoldWindow, LocalHand, Spot } from "../../figures/ContraFigure.js";
import {
  bearing,
  holdWindow,
  isHeld,
  joinPoint,
  joinedHands,
  midpoint,
  polar,
} from "../../figures/ContraFigure.js";
import { handDown } from "../../pair/PairFrame.js";
import type {
  HoldSpec,
  IdleHands,
  MateHold,
  PairHold,
  ParamGuard,
  RingHold,
  SideRule,
  SoloHold,
} from "../FigureDefinition.js";
import type { ExprEnv, Moment, NumberExpr } from "../expr.js";
import { evalMoment, evalNumber, evalRole, evalSide, evalSpot } from "../expr.js";
import { joinKey, type ShapeInput } from "../interpret.js";

/**
 * **Holds as data**: which hands a figure joins, where the one shared floor
 * point sits, and over which of its beats.
 *
 * A definition writes its holds down instead of a shape carrying code for
 * them, which is what makes `carried` bookkeeping rather than a per-seam
 * negotiation: the interpreter can answer "is this hand already joined when
 * the figure starts" without asking the shape.
 *
 * Two things a hold needs that a plain list would not give it. A `when` guard,
 * so a balance can declare its two-hand hold, its one-hand hold and its ring in
 * the same list and the call's own `hold` parameter picks (the shape never sees
 * the parameter). And three window kinds, because the library really does take
 * hands three ways: a balance's is `holdWindow`'s take-and-drop, an allemande's
 * is two explicit ramps, and a swing's is the orbit's own stepping in and
 * opening out.
 */

/** One hold the call's parameters actually asked for. */
export type ActiveHold = ActivePairHold | ActiveRingHold | ActiveSoloHold | ActiveMateHold;

/**
 * One hand on a point of its own: the star's wrist, long lines' outward hand.
 *
 * Which **hand** is not resolved here, because a {@link SideRule} is a question
 * about the dancer ("the one away from my line mate") and is answered per role.
 */
export interface ActiveSoloHold {
  kind: "solo";
  spec: SoloHold;
  window: HoldWindow;
  reported: HoldWindow;
}

/** One hand joined to whoever the shape paired you with. Resolved per role. */
export interface ActiveMateHold {
  kind: "mate";
  spec: MateHold;
  window: HoldWindow;
  reported: HoldWindow;
}

/** One pair of hands, resolved: who holds whom, and when. */
export interface ActivePairHold {
  kind: "pair";
  spec: PairHold;
  join: HandJoin;
  /** The join, as the key `carried` and a sequence's seam are compared by. */
  key: string;
  /** When the hand moves: the take dropped if carried in, the release if carried out. */
  window: HoldWindow;
  /**
   * When the figure **reports** the hold as joined.
   *
   * The same window, except for a `"holdWindow"` hold, which reports the hold
   * it takes rather than the one it inherited — a balance says it is holding
   * hands from the beat it would have taken them, whether or not the figure
   * before handed them over, while a swing reports what it is actually
   * holding. That is exactly what the two coded figures do, and the difference
   * is only visible while a carried hold is still inside the take.
   */
  reported: HoldWindow;
}

/** Everybody's hands round the ring, joined to the dancer on each side. */
export interface ActiveRingHold {
  kind: "ring";
  spec: RingHold;
  window: HoldWindow;
  reported: HoldWindow;
}

/** The orbit's own stepping in and opening out, for a `"orbit"` window. */
export interface OrbitWindow {
  inBeats: Beat;
  outBeats: Beat;
}

/** The holds a call's parameters asked for, in the order the definition wrote them. */
export function activeHolds(
  holds: readonly HoldSpec[],
  input: ShapeInput,
  env: ExprEnv,
  orbit?: OrbitWindow,
): ActiveHold[] {
  const out: ActiveHold[] = [];
  for (const spec of holds) {
    if (!guardPasses(spec.when, env)) continue;
    if (spec.kind === "ring") {
      const window = windowOf(spec.window, input, env, false, false, orbit);
      out.push({ kind: "ring", spec, window, reported: window });
      continue;
    }
    if (spec.kind === "solo") {
      const window = windowOf(spec.window, input, env, false, false, orbit);
      out.push({ kind: "solo", spec, window, reported: window });
      continue;
    }
    if (spec.kind === "mate") {
      const window = windowOf(spec.window, input, env, false, false, orbit);
      out.push({ kind: "mate", spec, window, reported: window });
      continue;
    }
    const join: HandJoin = {
      a: spec.a,
      aSide: evalSide(spec.aSide, env),
      b: spec.b,
      bSide: evalSide(spec.bSide, env),
    };
    const key = joinKey(join.a, join.aSide, join.b, join.bSide);
    const carriedIn = input.joinedIn.has(key);
    const carriedOut = input.joinedOut.has(key);
    out.push({
      kind: "pair",
      spec,
      join,
      key,
      window: windowOf(spec.window, input, env, carriedIn, carriedOut, orbit),
      reported:
        spec.window.kind === "holdWindow"
          ? windowOf(spec.window, input, env, false, false, orbit)
          : windowOf(spec.window, input, env, carriedIn, carriedOut, orbit),
    });
  }
  return out;
}

/** Whether a hold's `when` guard lets it through. */
function guardPasses(guard: ParamGuard | undefined, env: ExprEnv): boolean {
  if (!guard) return true;
  if (!(guard.param in env.params)) {
    throw new Error(
      `a hold is guarded on "${guard.param}", which is not a parameter ` +
        `(have: ${Object.keys(env.params).join(", ")})`,
    );
  }
  const value = env.params[guard.param];
  return guard.is.some((want) => want === value);
}

/**
 * A hold's window, with the take dropped when it is carried in and the release
 * dropped when it is carried out.
 *
 * That is `joinWindowFor`'s rule, stated once for every kind of window rather
 * than once per figure: a hand nobody let go of is not taken again, and the
 * seam is what moves it from where the figure before held it to here.
 */
function windowOf(
  window: HoldSpec["window"],
  input: ShapeInput,
  env: ExprEnv,
  carriedIn: boolean,
  carriedOut: boolean,
  orbit: OrbitWindow | undefined,
): HoldWindow {
  const beats = input.beats;
  if (window.kind === "orbit") {
    if (!orbit) throw new Error(`an "orbit" hold window only means something inside an orbit`);
    return {
      takeFrom: 0,
      takeTo: carriedIn ? 0 : orbit.inBeats,
      releaseFrom: carriedOut ? beats : beats - orbit.outBeats,
      releaseTo: beats,
    };
  }
  if (window.kind === "holdWindow") {
    return holdWindow(
      beats,
      carriedIn ? 0 : evalNumber(window.take, env),
      carriedOut ? 0 : evalNumber(window.release, env),
    );
  }
  const at = (m: Moment): Beat => evalMoment(m, env, beats);
  return {
    takeFrom: carriedIn ? 0 : at(window.takeFrom),
    takeTo: carriedIn ? 0 : at(window.takeTo),
    releaseFrom: carriedOut ? beats : at(window.releaseFrom),
    releaseTo: carriedOut ? beats : at(window.releaseTo),
  };
}

/** The joins reported as held at `t`, each once, in the definition's own order. */
export function joinsHeldAt(active: readonly ActiveHold[], t: Beat): HandJoin[] {
  const out: HandJoin[] = [];
  const seen = new Set<string>();
  for (const hold of active) {
    if (hold.kind !== "pair") continue;
    if (!isHeld(hold.reported, t)) continue;
    if (seen.has(hold.key)) continue;
    seen.add(hold.key);
    out.push(hold.join);
  }
  return out;
}

/**
 * Whether a {@link SoloHold} is this dancer's at all.
 *
 * `"each"` is every role of the instance; a {@link RoleExpr} is the one it
 * names, read for this dancer so that `{ role: "self" }` means everybody and a
 * literal names one.
 */
export function soloIsFor(hold: ActiveSoloHold, role: string, env: ExprEnv): boolean {
  if (hold.spec.role === "each") return true;
  return evalRole(hold.spec.role, env) === role;
}

/**
 * One {@link SoloHold}'s hand, at this beat — the third pass, so it reads where
 * the other dancers **are now** and not where they started.
 *
 * `live` is the shape's own "where is this role at `t`", which is exactly the
 * live cross-reference the calculus exists for: the star's giving hand is a
 * forearm out from the middle toward the dancer ahead of her *as he moves*, and
 * long lines' outward hand is half a line pitch past her along the line she is
 * standing in *as it walks in and out*.
 */
export function soloHandAt(
  hold: ActiveSoloHold,
  role: string,
  env: ExprEnv,
  live: (role: string) => Spot,
): { side: Side; hand: Hand } | undefined {
  if (!soloIsFor(hold, role, env)) return undefined;
  const spec = hold.spec;
  const side = resolveSide(spec.side, env);
  const drop = evalNumber(spec.drop, env) + stackFor(spec.stackPx, role, env);
  const point = spec.point;
  if (point.kind === "anchor") return { side, hand: { p: env.anchor, drop } };
  if (point.kind === "wristOf") {
    const ahead = live(evalRole(point.of, env));
    return {
      side,
      hand: {
        p: polar(env.anchor, bearing(env.anchor, ahead.p), evalNumber(point.radius, env)),
        drop,
      },
    };
  }
  const self = live(role);
  const other = live(evalRole(point.of, env));
  const away = norm(sub(self.p, other.p));
  return { side, hand: { p: addScaled(self.p, away, dist(self.p, other.p) / 2), drop } };
}

/**
 * **Which of a dancer's hands a hold uses**, for this dancer.
 *
 * Named outright, or the geometric rule: the hand nearest another dancer, or
 * the one away from them. Which **facing** the rule is read against is part of
 * it — long lines takes hands along a line everybody has turned to face along,
 * so its rule reads the end facing, while a roll away takes them where the
 * couple already stands and reads the start.
 */
export function resolveSide(rule: SideRule, env: ExprEnv): Side {
  if (typeof rule === "string" || "param" in rule) return evalSide(rule, env);
  const nearest = "nearest" in rule;
  const other = evalRole(nearest ? rule.nearest : rule.furthest, env);
  const facing = evalSpot(rule.facing, env.self, env).facing;
  const toOther = sub(env.ctx.spot(other).p, env.ctx.spot(env.self).p);
  const left = dirOf(facing - 90);
  const near: Side = left[0] * toOther[0] + left[1] * toOther[1] > 0 ? "L" : "R";
  return nearest ? near : near === "L" ? "R" : "L";
}

/**
 * How much higher or lower than a hold's own drop this dancer's hand sits: the
 * role set's top role a half stack above and everybody else a half below.
 *
 * By the dancer's **own** role rather than by the pair, which is what lets a
 * star stack the whole ring without any pair of the same role having to
 * arbitrate. Negative is higher, because a drop is measured downward.
 */
function stackFor(stackPx: NumberExpr | undefined, role: string, env: ExprEnv): number {
  if (stackPx === undefined) return 0;
  const stack = evalNumber(stackPx, env);
  return env.ctx.role(role) === env.ctx.roleSet.top ? -stack / 2 : stack / 2;
}

/**
 * One {@link MateHold}'s hand, at this beat: the **one shared floor point** the
 * two of them meet at, and this dancer's own hand on it.
 *
 * Both ends evaluate the same {@link SideRule} for themselves, so the point is
 * computed once from the two of them and read by both — one point rather than
 * two that agree to a tolerance, which is AC2's own rule.
 */
export function mateHandAt(
  hold: ActiveMateHold,
  role: string,
  mate: string,
  env: ExprEnv,
  mateEnv: ExprEnv,
  live: (role: string) => Spot,
): { side: Side; hand: Hand } {
  const mySide = resolveSide(hold.spec.side, env);
  const theirSide = resolveSide(hold.spec.side, mateEnv);
  // Two dancers facing *each other* have no inside hands — both would give the
  // same one — and a figure for a couple side by side cannot be danced by them.
  // Saying so is better than a hand placed where an arm cannot reach it.
  if (mySide === theirSide && typeof hold.spec.side === "object" && !("param" in hold.spec.side)) {
    throw new Error(
      `"${role}" and "${mate}" are not standing side by side, so they have no inside hands`,
    );
  }
  const self = live(role);
  const other = live(mate);
  const point =
    hold.spec.point.kind === "midpoint"
      ? midpoint(self.p, other.p)
      : joinPoint(self, mySide, other, theirSide);
  const stack = hold.spec.stackPx === undefined ? 0 : evalNumber(hold.spec.stackPx, env);
  const joined = joinedHands(env.ctx, role, mate, point, evalNumber(hold.spec.drop, env), stack);
  const mine = joined[role];
  if (!mine) throw new Error(`no joined hand for "${role}"`);
  return { side: mySide, hand: mine };
}

/** The joins a figure's {@link MateHold}s report as shared, each once. */
export function mateJoinsAt(
  active: readonly ActiveHold[],
  input: ShapeInput,
  t: Beat,
  mateOf: (role: string) => string | undefined,
  envFor: (role: string, t: Beat) => ExprEnv,
): HandJoin[] {
  const out: HandJoin[] = [];
  const seen = new Set<string>();
  for (const hold of active) {
    if (hold.kind !== "mate") continue;
    if (!isHeld(hold.reported, t)) continue;
    for (const role of input.roles) {
      const mate = mateOf(role);
      if (mate === undefined) continue;
      const side = resolveSide(hold.spec.side, envFor(role, t));
      const theirSide = resolveSide(hold.spec.side, envFor(mate, t));
      const key = joinKey(role, side, mate, theirSide);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: role, aSide: side, b: mate, bSide: theirSide });
    }
  }
  return out;
}

/** The joins a figure's {@link SoloHold}s report as shared, each once. */
export function soloJoinsAt(
  active: readonly ActiveHold[],
  input: ShapeInput,
  t: Beat,
  envFor: (role: string, t: Beat) => ExprEnv,
): HandJoin[] {
  const out: HandJoin[] = [];
  const seen = new Set<string>();
  for (const hold of active) {
    const joins = hold.kind === "solo" ? hold.spec.joins : undefined;
    if (hold.kind !== "solo" || !joins) continue;
    if (!isHeld(hold.reported, t)) continue;
    for (const role of input.roles) {
      const env = envFor(role, t);
      if (!soloIsFor(hold, role, env)) continue;
      const other = evalRole(joins.with, env);
      if (other === role) continue;
      const side = resolveSide(hold.spec.side, env);
      const otherSide = evalSide(joins.side, env);
      const key = joinKey(role, side, other, otherSide);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: role, aSide: side, b: other, bSide: otherSide });
    }
  }
  return out;
}

/**
 * What a hand no hold covers is doing: nothing at all, or hanging at the
 * dancer's own side and swinging with the step.
 *
 * The two really are different poses and the difference is visible: a pass
 * through's hands are `"down"`, which the renderer hangs its own way, while a
 * petronella's are placed at the side with no swing and a do-si-do's swing,
 * fading in over the first beats and out over the last so that a seam never
 * jumps.
 */
export function idleHandAt(
  idle: IdleHands,
  self: Spot,
  side: Side,
  t: Beat,
  env: ExprEnv,
): LocalHand {
  if (idle.kind === "down") return "down";
  const beats = env.beats;
  const fadeIn = idle.fadeIn === undefined ? undefined : evalNumber(idle.fadeIn, env);
  const fadeOut = idle.fadeOut === undefined ? undefined : evalNumber(idle.fadeOut, env);
  const swing =
    evalNumber(idle.swing, env) *
    (fadeIn === undefined ? 1 : ramp(t, 0, fadeIn)) *
    (fadeOut === undefined ? 1 : 1 - ramp(t, beats - fadeOut, beats));
  return handDown(self.p, self.facing, side, t, swing);
}

/** The other end of a hold from `role`, and which of this dancer's hands it is. */
export function endsOfHold(
  hold: ActivePairHold,
  role: string,
): { mine: Side; other: string; theirs: Side } | undefined {
  if (hold.join.a === role) {
    return { mine: hold.join.aSide, other: hold.join.b, theirs: hold.join.bSide };
  }
  if (hold.join.b === role) {
    return { mine: hold.join.bSide, other: hold.join.a, theirs: hold.join.aSide };
  }
  return undefined;
}
