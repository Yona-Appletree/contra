import type { Angle, Beat, Side, Vec2 } from "@caller/core";
import type { PlanContext, Spot, Spots } from "../figures/ContraFigure.js";
import { bearing, joinPoint, midpoint, polar } from "../figures/ContraFigure.js";
import type { FigureRole } from "./FigureDefinition.js";

/**
 * **The expression calculus**, re-targeted on to figure-roles.
 *
 * This is the data layer's own evaluator (`docs/adr/2026-09-14-figure-primitive-language.md`,
 * and `figures/language/expr.ts`, which it grew out of) with its leaves moved
 * off the formation and on to the figure: `{ station: … }` becomes
 * `{ role: … }`, and `ringShift` becomes a **role shift within the instance** —
 * "the part two along from mine", where "along" is the instance's own cast
 * order rather than a ring of stations in a minor set. `{ point: "ringCentre" }`
 * becomes `{ point: "anchor" }`, which is the same idea generalised: the shape's
 * own origin, wherever the definition's anchor rule put it.
 *
 * Everything else is kept exactly, because it is the part that was proved:
 *
 * - Every node is a plain object with no functions in it, so a whole definition
 *   survives `JSON.parse(JSON.stringify(...))`.
 * - **Three passes and live cross-references.** A figure's hand joins read the
 *   other dancer's position *at this same beat*, not their start or their end,
 *   so the interpreter cannot substitute a template. It runs ends, then
 *   positions at `t`, then hands against those positions; reading a pass that
 *   has not run is a bug in a definition and throws.
 * - `mul` folds left to right, and the fold order is written down rather than
 *   argued about, because a compiled figure is held to matching a coded one bit
 *   for bit.
 *
 * `figures/language/` is left standing for now: its only consumer is
 * `circle-data`, which M4 retires along with the whole directory. Re-pointing
 * it at these leaves would have meant rewriting `circleSpec` in M2, which is
 * M4's work.
 */

/**
 * A number a definition asks for: a literal, a parameter, a choice made by a
 * string parameter, or a product.
 *
 * `select` is how a figure turns a word into a number — an allemande's
 * `hand: "L"` into `-1` — without the definition carrying a closure.
 */
export type NumberExpr =
  | number
  | { param: string }
  | { number: "select"; on: string; cases: Record<string, NumberExpr> }
  | { number: "mul"; of: readonly NumberExpr[] }
  | { number: "sum"; of: readonly NumberExpr[] };

/**
 * A beat of the figure, counted from its start or from its end.
 *
 * `{ fromEnd: 1.4 }` is "a beat and two fifths before the last one", which is
 * how every window in the library is actually written — a figure stretches to
 * whatever count the card gives it (D3) and the opening out stays the same
 * length whatever that count is.
 */
export type Moment = NumberExpr | { fromEnd: NumberExpr };

/** A moment as an absolute beat of a figure of `beats`. */
export function evalMoment(expr: Moment, env: ExprEnv, beats: Beat = env.beats): Beat {
  if (typeof expr === "object" && "fromEnd" in expr) return beats - evalNumber(expr.fromEnd, env);
  return evalNumber(expr, env);
}

/**
 * An angle a definition asks for, in frame-local degrees.
 *
 * Every {@link NumberExpr} is one — an angle is a number, and an allemande's
 * inward lean really is `sign × (90 + inward)` — plus the two nodes that are
 * only angles: a bearing between two points, and a dancer's own facing.
 */
export type AngleExpr =
  | NumberExpr
  | { angle: "bearing"; from: PointExpr; to: PointExpr }
  | { angle: "facingOf"; role: RoleExpr; at: "live" | "start" | "end" };

/** A truth a definition asks for: written down, or read off a parameter. */
export type BoolExpr = boolean | { param: string };

/** Which hand: named outright, or read off a parameter (an allemande's). */
export type SideExpr = Side | { param: string };

/**
 * Which part of the figure an expression is about: a role named outright, the
 * role the expression is being evaluated for, or the one so many places along
 * the instance's own cast order.
 *
 * `shift` is what makes one hand rule serve a whole ring: "my left hand joins
 * the part one place along" is the same sentence for all four of them. It is
 * `ringShift` with the ring being the instance rather than the minor set.
 */
export type RoleExpr = FigureRole | { role: "self" } | { role: "shift"; places: NumberExpr };

/**
 * A floor point a definition asks for, in the frame's own local px.
 *
 * `{ point: "live" }` is the node the language exists for: a joined hand is by
 * definition the shared floor point of two *moving* bodies, so it is read from
 * the other dancer's currently-animating position at this same beat.
 */
export type PointExpr =
  | { point: "start" | "end" | "live"; role: RoleExpr }
  | { point: "anchor" }
  | { point: "midpoint"; a: PointExpr; b: PointExpr }
  | { point: "polar"; centre: PointExpr; angle: AngleExpr; radius: NumberExpr }
  | { point: "offset"; from: PointExpr; along: AngleExpr; distance: NumberExpr }
  | { point: "joinPoint"; a: RoleExpr; aSide: Side; b: RoleExpr; bSide: Side };

/** A pose written as expressions: where a dancer stands and which way they face. */
export interface PoseExpr {
  p: PointExpr;
  facing: AngleExpr;
}

/**
 * What an expression is evaluated against: the instance, its parameters, the
 * beat, and whichever of the interpreter's passes have already run.
 *
 * `ends` and `live` are filled in as the passes complete. Reading one before
 * its pass has run is a bug in a definition, not a missing value, so it throws.
 */
export interface ExprEnv {
  /** The instance's plan context. Its stations are the figure-roles. */
  ctx: PlanContext;
  /** The figure's parameters, defaults already filled in. */
  params: Readonly<Record<string, unknown>>;
  /** How long this instance of the figure lasts. */
  beats: Beat;
  /** The role the expression is about when it says `self`. */
  self: FigureRole;
  /** The beat `{ point: "live" }` is read at. */
  t: Beat;
  /** The instance's roles, in cast order: what a role shift shifts through. */
  order: readonly FigureRole[];
  /** Where the shape is anchored, in frame-local px. */
  anchor: Vec2;
  /** Where the figure leaves everybody; unset until the ends pass has run. */
  ends?: Spots;
  /** Every role's place at {@link ExprEnv.t}; unset until the position pass has run. */
  live?: (role: FigureRole) => Spot;
}

/** One of a figure's parameters, or a clear error naming what was there. */
function paramOf(env: ExprEnv, name: string): unknown {
  if (!(name in env.params)) {
    throw new Error(`no parameter "${name}" (have: ${Object.keys(env.params).join(", ")})`);
  }
  return env.params[name];
}

/** A number from a {@link NumberExpr}. */
export function evalNumber(expr: NumberExpr, env: ExprEnv): number {
  if (typeof expr === "number") return expr;
  if ("param" in expr) {
    const value = paramOf(env, expr.param);
    if (typeof value !== "number") {
      throw new Error(`parameter "${expr.param}" is ${JSON.stringify(value)}, not a number`);
    }
    return value;
  }
  if (expr.number === "select") {
    const value = paramOf(env, expr.on);
    const key = String(value);
    const chosen = expr.cases[key];
    if (chosen === undefined) {
      throw new Error(
        `parameter "${expr.on}" is "${key}", which is not one of [${Object.keys(expr.cases).join(", ")}]`,
      );
    }
    return evalNumber(chosen, env);
  }
  if (expr.of.length === 0) throw new Error(`"${expr.number}" needs at least one term`);
  let total = evalNumber(expr.of[0]!, env);
  for (let i = 1; i < expr.of.length; i++) {
    const term = evalNumber(expr.of[i]!, env);
    total = expr.number === "mul" ? total * term : total + term;
  }
  return total;
}

/** A truth from a {@link BoolExpr}. */
export function evalBool(expr: BoolExpr, env: ExprEnv): boolean {
  if (typeof expr === "boolean") return expr;
  const value = paramOf(env, expr.param);
  if (typeof value !== "boolean") {
    throw new Error(`parameter "${expr.param}" is ${JSON.stringify(value)}, not a boolean`);
  }
  return value;
}

/** Which hand a {@link SideExpr} names. */
export function evalSide(expr: SideExpr, env: ExprEnv): Side {
  if (expr === "L" || expr === "R") return expr;
  const value = paramOf(env, expr.param);
  if (value !== "L" && value !== "R") {
    throw new Error(`parameter "${expr.param}" is ${JSON.stringify(value)}, not "L" or "R"`);
  }
  return value;
}

/** An angle from an {@link AngleExpr}, in frame-local degrees. */
export function evalAngle(expr: AngleExpr, env: ExprEnv): Angle {
  if (typeof expr === "number" || "param" in expr || "number" in expr) {
    return evalNumber(expr, env);
  }
  if (expr.angle === "bearing") {
    return bearing(evalPoint(expr.from, env), evalPoint(expr.to, env));
  }
  return evalSpot(expr.at, evalRole(expr.role, env), env).facing;
}

/** Which role a {@link RoleExpr} names. */
export function evalRole(expr: RoleExpr, env: ExprEnv): FigureRole {
  if (typeof expr === "string") return expr;
  if (expr.role === "self") return env.self;
  return roleShift(env.order, env.self, evalNumber(expr.places, env));
}

/**
 * The role `places` along the instance's own cast order from `self`, wrapping.
 *
 * `ringShift`, with the ring being the figure rather than the minor set.
 */
export function roleShift(
  order: readonly FigureRole[],
  self: FigureRole,
  places: number,
): FigureRole {
  const at = order.indexOf(self);
  if (at === -1) {
    throw new Error(`role "${self}" is not in [${order.join(", ")}]`);
  }
  const n = order.length;
  return order[(((at + places) % n) + n) % n]!;
}

/**
 * Where a role's dancer is, in one of the three senses a figure can mean:
 * where they started, where the figure leaves them, or where they are right
 * now, mid figure, at {@link ExprEnv.t}.
 */
export function evalSpot(at: "start" | "end" | "live", role: FigureRole, env: ExprEnv): Spot {
  if (at === "start") return env.ctx.spot(role);
  if (at === "end") {
    if (!env.ends) throw new Error(`"end" is not known yet: the ends pass has not run`);
    const spot = env.ends[role];
    if (!spot) throw new Error(`no end for role "${role}"`);
    return spot;
  }
  if (!env.live) throw new Error(`"live" is not known yet: the position pass has not run`);
  return env.live(role);
}

/** A floor point from a {@link PointExpr}, in frame-local px. */
export function evalPoint(expr: PointExpr, env: ExprEnv): Vec2 {
  switch (expr.point) {
    case "start":
    case "end":
    case "live":
      return evalSpot(expr.point, evalRole(expr.role, env), env).p;
    case "anchor":
      return env.anchor;
    case "midpoint":
      return midpoint(evalPoint(expr.a, env), evalPoint(expr.b, env));
    case "polar":
      return polar(
        evalPoint(expr.centre, env),
        evalAngle(expr.angle, env),
        evalNumber(expr.radius, env),
      );
    case "offset":
      return polar(
        evalPoint(expr.from, env),
        evalAngle(expr.along, env),
        evalNumber(expr.distance, env),
      );
    case "joinPoint":
      return joinPoint(
        evalSpot("live", evalRole(expr.a, env), env),
        expr.aSide,
        evalSpot("live", evalRole(expr.b, env), env),
        expr.bSide,
      );
  }
}
