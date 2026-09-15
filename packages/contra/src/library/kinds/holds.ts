import type { Beat } from "@caller/core";
import type { Side } from "@caller/choreo";
import type { HandJoin, HoldWindow } from "../../figures/ContraFigure.js";
import { holdWindow, isHeld } from "../../figures/ContraFigure.js";
import type { HoldSpec, PairHold, ParamGuard, RingHold } from "../FigureDefinition.js";
import type { ExprEnv, Moment } from "../expr.js";
import { evalMoment, evalNumber, evalSide } from "../expr.js";
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
export type ActiveHold = ActivePairHold | ActiveRingHold;

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
