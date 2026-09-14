import type { Angle, Beat, Side, Vec2 } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { PlanContext, Spot, Spots } from "../ContraFigure.js";
import { bearing, joinPoint, midpoint, polar } from "../ContraFigure.js";
import type { Ring } from "../ring.js";
import { ringShift } from "../ring.js";

/**
 * A number a figure spec asks for: a literal, a parameter, a choice made by a
 * string parameter, or a product.
 *
 * Every node is a plain object with no functions in it, so a whole figure spec
 * survives `JSON.parse(JSON.stringify(...))` the way a `Dance` already does.
 *
 * `select` is how a figure turns a word into a number — `direction: "left"`
 * into `+1` — without the spec carrying a closure. `mul` folds left to right,
 * so `{ of: [sign, places] }` is `sign * places` and not `places * sign`:
 * float multiplication is commutative but the plan's point is that a compiled
 * figure matches a coded one bit for bit, and writing the fold order down is
 * cheaper than arguing about when it does not matter.
 */
export type NumberExpr =
  | number
  | { param: string }
  | { number: "select"; on: string; cases: Record<string, NumberExpr> }
  | { number: "mul"; of: readonly NumberExpr[] };

/** An angle a figure spec asks for, in frame-local degrees. */
export type AngleExpr =
  | number
  | { param: string }
  | { angle: "bearing"; from: PointExpr; to: PointExpr }
  | { angle: "facingOf"; station: StationExpr; at: "live" | "start" | "end" };

/**
 * Which dancer an expression is about: a station named outright, the dancer
 * the expression is being evaluated for, or their neighbour so many places
 * round the ring.
 *
 * `ringShift` is what makes one hand track serve a whole ring: "my left hand
 * joins the dancer one place round" is the same sentence for all four of them.
 */
export type StationExpr =
  StationId | { station: "self" } | { station: "ringShift"; places: NumberExpr };

/**
 * A floor point a figure spec asks for, in frame-local px.
 *
 * `{ point: "live" }` is the node the language exists for. Hand joins round a
 * ring are computed from **the other dancer's currently-animating position at
 * this same beat**, not from their start or end pose (`ringHands(ctx, ring,
 * (id) => placeAt(id, t), …)`), so a flat, order-independent record of numbers
 * cannot express a figure the library already ships. It forces the interpreter
 * to run in passes — ends, then every station's place at `t`, then hands
 * against that — rather than to substitute a template.
 *
 * `joinPoint` reads both dancers **live** for the same reason: a joined hand is
 * by definition the shared floor point of two moving bodies.
 */
export type PointExpr =
  | { point: "start" | "end" | "live"; station: StationExpr }
  | { point: "ringCentre" }
  | { point: "midpoint"; a: PointExpr; b: PointExpr }
  | { point: "polar"; centre: PointExpr; angle: AngleExpr; radius: NumberExpr }
  | { point: "offset"; from: PointExpr; along: AngleExpr; distance: NumberExpr }
  | { point: "joinPoint"; a: StationExpr; aSide: Side; b: StationExpr; bSide: Side };

/**
 * What an expression is evaluated against: the group, the figure's parameters,
 * the beat, and whichever of the interpreter's passes have already run.
 *
 * `ends` and `live` are filled in as the passes complete. Reading one before
 * its pass has run is a bug in a spec, not a missing value, so it throws.
 */
export interface ExprEnv {
  ctx: PlanContext;
  /** The figure's parameters, defaults already filled in. */
  params: Readonly<Record<string, unknown>>;
  /** How long this instance of the figure lasts. */
  beats: Beat;
  /** The dancer the expression is about when it says `self`. */
  self: StationId;
  /** The beat `{ point: "live" }` is read at. */
  t: Beat;
  /** The ring this figure's dancers make. */
  ring: Ring;
  /** Where the figure leaves everybody; unset until the ends pass has run. */
  ends?: Spots;
  /** Every station's place at {@link ExprEnv.t}; unset until the position pass has run. */
  live?: (station: StationId) => Spot;
}

/** A pose written as expressions: where a dancer stands and which way they face. */
export interface PoseExpr {
  p: PointExpr;
  facing: AngleExpr;
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
  if (expr.of.length === 0) throw new Error(`"mul" needs at least one term`);
  let product = evalNumber(expr.of[0]!, env);
  for (let i = 1; i < expr.of.length; i++) product *= evalNumber(expr.of[i]!, env);
  return product;
}

/** An angle from an {@link AngleExpr}, in frame-local degrees. */
export function evalAngle(expr: AngleExpr, env: ExprEnv): Angle {
  if (typeof expr === "number") return expr;
  if ("param" in expr) return evalNumber(expr, env);
  if (expr.angle === "bearing") {
    return bearing(evalPoint(expr.from, env), evalPoint(expr.to, env));
  }
  return evalSpot(expr.at, evalStation(expr.station, env), env).facing;
}

/** Which station a {@link StationExpr} names. */
export function evalStation(expr: StationExpr, env: ExprEnv): StationId {
  if (typeof expr === "string") return expr;
  if (expr.station === "self") return env.self;
  return ringShift(env.ring, env.self, evalNumber(expr.places, env));
}

/**
 * Where a station's dancer is, in one of the three senses a figure can mean:
 * where they started, where the figure leaves them, or where they are right
 * now, mid figure, at {@link ExprEnv.t}.
 */
export function evalSpot(at: "start" | "end" | "live", station: StationId, env: ExprEnv): Spot {
  if (at === "start") return env.ctx.spot(station);
  if (at === "end") {
    if (!env.ends) throw new Error(`"end" is not known yet: the ends pass has not run`);
    const spot = env.ends[station];
    if (!spot) throw new Error(`no end for station "${station}"`);
    return spot;
  }
  if (!env.live) throw new Error(`"live" is not known yet: the position pass has not run`);
  return env.live(station);
}

/** A floor point from a {@link PointExpr}, in frame-local px. */
export function evalPoint(expr: PointExpr, env: ExprEnv): Vec2 {
  switch (expr.point) {
    case "start":
    case "end":
    case "live":
      return evalSpot(expr.point, evalStation(expr.station, env), env).p;
    case "ringCentre":
      return env.ring.centre;
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
        evalSpot("live", evalStation(expr.a, env), env),
        expr.aSide,
        evalSpot("live", evalStation(expr.b, env), env),
        expr.bSide,
      );
  }
}
