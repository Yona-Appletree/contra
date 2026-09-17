import type { Beat, Hand, Vec2 } from "@caller/core";
import { addScaled, dirOf, dist, handDown, norm, ramp, shouldersAt, sub } from "@caller/core";
import type { Side } from "@caller/choreo";
import type { HandJoin, HoldWindow, LocalHand, Spot } from "../../figures/ContraFigure.js";
import {
  bearing,
  holdWindow,
  isHeld,
  joinPoint,
  joinedHands,
  midpoint,
} from "../../figures/ContraFigure.js";

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
        p: wristPoint(
          env.anchor,
          live(role).p,
          shouldersAt(ahead.p, ahead.facing)[side],
          ahead.p,
          evalNumber(point.along, env),
        ),
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
  if (typeof rule === "string" || "param" in rule || "select" in rule) return evalSide(rule, env);
  if ("ifRole" in rule) {
    const want = env.params[rule.ifRole];
    if (!(rule.ifRole in env.params)) {
      throw new Error(
        `a hold's hand is chosen by "${rule.ifRole}", which is not a parameter ` +
          `(have: ${Object.keys(env.params).join(", ")})`,
      );
    }
    return evalSide(env.ctx.role(env.self) === want ? rule.then : rule.else, env);
  }
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
): { side: Side; hand: Hand } | undefined {
  if (noInsideHands(hold, env, mateEnv)) return undefined;
  const mySide = resolveSide(hold.spec.side, env);
  const theirSide = resolveSide(hold.spec.side, mateEnv);
  const self = live(role);
  const other = live(mate);
  const point = matePoint(hold, role, self, mySide, other, theirSide, env, live);
  const stack = hold.spec.stackPx === undefined ? 0 : evalNumber(hold.spec.stackPx, env);
  const joined = joinedHands(env.ctx, role, mate, point, evalNumber(hold.spec.drop, env), stack);
  const mine = joined[role];
  if (!mine) throw new Error(`no joined hand for "${role}"`);
  return { side: mySide, hand: mine };
}

/**
 * The one shared floor point a {@link MateHold} names, for this pair.
 *
 * `"over"` is the california twirl's arch and the reason the kind exists: the
 * raiser holds the joined hand **over the head of the dancer walking under it**,
 * `back` px along the line toward himself, rather than half way between the two
 * of them. Both ends compute it from the same two live positions, so it is still
 * one point read twice and not two that agree.
 */
function matePoint(
  hold: ActiveMateHold,
  role: string,
  self: Spot,
  mySide: Side,
  other: Spot,
  theirSide: Side,
  env: ExprEnv,
  live: (role: string) => Spot,
): Vec2 {
  const point = hold.spec.point;
  if (point.kind === "midpoint") return midpoint(self.p, other.p);
  if (point.kind === "over") {
    const underRole = evalRole(point.role, env);
    const under = live(underRole).p;
    const raiser = underRole === role ? other.p : self.p;
    if (dist(under, raiser) === 0) return under;
    return addScaled(under, norm(sub(raiser, under)), evalNumber(point.back, env));
  }
  return joinPoint(self, mySide, other, theirSide);
}

/**
 * Whether these two have no inside hands to give each other, because both ends
 * of an `"inside"`-shaped rule resolve to the same side.
 *
 * Two dancers facing *each other* have no inside hands — both would give the
 * same one — and neither has a figure for a couple side by side. Until M8b this
 * **threw**, on the principle that saying so is better than a hand placed where
 * an arm cannot reach it; **it now leaves the hand alone** (M8b), on the
 * stronger principle the rest of this layer already follows: a dancer standing
 * somewhere a figure did not expect is a *measurement*, not an exception.
 *
 * The case that forced it is Are You 'Most Done?, whose A1 allemande carries
 * the two larks across the set and whose time through does not put them back:
 * by the second time through two dancers of a couple are on one floor point, so
 * long lines' own line mate is a dancer standing exactly where you are. That is
 * a real fault of the dance and one the oracles are built to report —
 * `collision 0.000 px`, `closure 60.0000 px` — where a throw reported nothing at
 * all and stopped the lab measuring the dance at eight of its nine line
 * lengths. No hand is invented: the two of them simply do not take that hand,
 * and `mateJoinsAt` stops reporting the join so nothing downstream believes in
 * a hold that was never made.
 *
 * `california-twirl.ts` keeps its own throw, and should: a twirl is *called* for
 * a named couple, so a pair who cannot twirl is a fault in the call.
 */
function noInsideHands(hold: ActiveMateHold, env: ExprEnv, mateEnv: ExprEnv): boolean {
  if (typeof hold.spec.side !== "object" || "param" in hold.spec.side) return false;
  return resolveSide(hold.spec.side, env) === resolveSide(hold.spec.side, mateEnv);
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
      // A hand that {@link noInsideHands} stops being placed is not a join.
      if (noInsideHands(hold, envFor(role, t), envFor(mate, t))) continue;
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

/**
 * **How far down the arm of the dancer ahead the grip sits**, as a fraction of
 * it: `0` is their giving shoulder and `1` is their own hand.
 *
 * The user, on the Moves page (FR-A1):
 *
 * > "almost right, but you put your hand on the wrist, not the shoulder, of the
 * > person in front of you."
 *
 * They were reading the picture exactly right. The old point was a fixed
 * `FOREARM_PX` — 7.5 px — out from the ring's centre along the bearing of the
 * dancer ahead, and a four-person star's ring is 12 px across, which puts every
 * dancer's giving shoulder **6.51 px** from that same centre on that same
 * bearing. The hand landed 0.99 px outside the next dancer's shoulder: on it.
 *
 * {@link wristPoint} replaces the radius with a fraction of their arm, which is
 * what the sentence actually says, and the fraction is the one dial the figure
 * has. **It cannot be taken all the way to the wrist, and the reason is
 * measured rather than argued.** Solve the chain — my hand `t` of the way from
 * their shoulder to their hand, their hand `t` of the way to the next one's,
 * all the way round a ring of `n` — and the hands land on a ring of radius
 * `s(1−t)/|1 − t·e^{iφ}|`, which for a four-star (`s = 6.51`, `φ = 90°`) is
 * 4.4 px at `t = 0.3`, 2.9 px at `t = 0.5` and **1.0 px at `t = 0.8`**, where a
 * wrist really is. A true wrist chain in a 12 px ring *is* the pile in the
 * middle the user calls awkward — the two sentences cannot both hold while the
 * ring is that tight, and the ring's radius is `ringOf`'s footprint clamp,
 * which is the circle's and not this figure's.
 *
 * So `0.5` — half way down their forearm, as near the wrist as the star's own
 * ring allows without collapsing the four hands into one point. It puts the
 * grip 2.91 px from the centre, 4.1 px from the next dancer's shoulder and 4.1
 * px from their hand, with the giver's own arm at 48% of its reach: bent, as
 * the user asks, and nowhere near their shoulder.
 */
export const WRIST_ALONG = 0.5;

/**
 * **The wrist of the dancer ahead**: {@link WRIST_ALONG} of the way from their
 * giving shoulder to their own hand, solved in closed form.
 *
 * Their hand is not known when this runs — it is this same point, one place
 * round — so the chain is solved rather than sampled. Writing the grip as a
 * complex number `z` about the ring's centre, and the next dancer's hand as the
 * same `z` turned by the angle `φ` between two places:
 *
 * ```
 * z = (1 − t)·S + t·z·e^{iφ}   ⟹   z = (1 − t)·S / (1 − t·e^{iφ})
 * ```
 *
 * where `S` is their giving shoulder relative to the centre. At `t = 0` that is
 * their shoulder exactly and at `t → 1` it is the centre, so the fraction is a
 * dial from "on their shoulder" to "in a pile in the middle" and every value
 * between is a real point on a real arm.
 */
export function wristPoint(
  centre: Vec2,
  me: Vec2,
  aheadShoulder: Vec2,
  ahead: Vec2,
  along: number,
): Vec2 {
  const phi = ((bearing(centre, ahead) - bearing(centre, me)) * Math.PI) / 180;
  const nx = (1 - along) * (aheadShoulder[0] - centre[0]);
  const ny = (1 - along) * (aheadShoulder[1] - centre[1]);
  const dx = 1 - along * Math.cos(phi);
  const dy = -along * Math.sin(phi);
  const den = dx * dx + dy * dy;
  if (den === 0) return centre;
  return [centre[0] + (nx * dx + ny * dy) / den, centre[1] + (ny * dx - nx * dy) / den];
}
