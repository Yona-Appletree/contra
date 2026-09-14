import type { Beat, PoseSample, Vec2 } from "@caller/core";
import type { PairFrame, PairRole } from "../pair/PairFrame.js";

/**
 * A parameterised figure: everything needed to sample two dancers doing it,
 * and nothing about where it sits in a dance.
 *
 * `P` is the figure's parameter object. `defaults` holds the values a call gets
 * when it says nothing; `params` names them, in the order a UI should show
 * them. (The milestone brief typed both fields `P`; two values of the same type
 * cannot be both the defaults and the list of parameters, so the names are the
 * list — see the README.)
 */
export interface FigureDef<P extends object> {
  /** Stable id, kebab-case: `walk-in`, `do-si-do`. */
  readonly id: string;
  /** What the caller says. */
  readonly call: string;
  /** How many beats before the figure starts the call goes out (plan AC9). */
  readonly lead: Beat;
  /** How long the figure lasts. */
  readonly beats: Beat;
  /** The parameter names, in display order. */
  readonly params: readonly (keyof P & string)[];
  /** The value of every parameter when a call does not say. */
  readonly defaults: P;
  /**
   * How long the figure lasts with these parameters, when a parameter decides
   * it (a swing is 8 or 12 beats). Absent means `beats` always.
   */
  beatsOf?(params: P): Beat;
  /**
   * One dancer's pose `t` beats into the figure. `t` runs from 0 to `beats`
   * inclusive; `sample(frame, role, beats, params)` is the end pose, which is
   * the next figure's start pose.
   *
   * Both roles are computed from the same frame in the same call, so a joined
   * hand is literally one floor point rather than two that agree to a
   * tolerance.
   */
  sample(frame: PairFrame, role: PairRole, t: Beat, params: P): PoseSample;
}

/** Fill in whatever a call did not say. */
export const resolveParams = <P extends object>(def: FigureDef<P>, params?: Partial<P>): P => ({
  ...def.defaults,
  ...params,
});

/**
 * A figure with its frame and parameters already chosen — the generic erased,
 * so a sequence can hold figures with different parameter types.
 */
export interface PairCall {
  readonly id: string;
  readonly call: string;
  readonly lead: Beat;
  readonly beats: Beat;
  readonly frame: PairFrame;
  /** The resolved parameters, for a readout. */
  readonly params: Readonly<Record<string, unknown>>;
  sample(role: PairRole, t: Beat): PoseSample;
}

/** Bind a figure to a frame and a set of parameters. */
export function pairCall<P extends object>(
  def: FigureDef<P>,
  frame: PairFrame,
  params?: Partial<P>,
): PairCall {
  const resolved = resolveParams(def, params);
  return {
    id: def.id,
    call: def.call,
    lead: def.lead,
    beats: def.beatsOf === undefined ? def.beats : def.beatsOf(resolved),
    frame,
    params: resolved as Readonly<Record<string, unknown>>,
    sample: (role, t) => def.sample(frame, role, t, resolved),
  };
}

/**
 * The step used to difference a figure for a velocity, in beats. The renderer
 * needs a floor velocity to know which way the feet swing and a single sample
 * cannot supply one, so everything that produces a velocity uses this same
 * forward difference and they agree.
 */
export const SAMPLE_DT: Beat = 0.05;

/** Forward-difference `sample` for a floor velocity in px per beat. */
export function sampleVelocity(
  sampleAt: (t: Beat) => PoseSample,
  t: Beat,
  limit: Beat,
): { pose: PoseSample; velocity: Vec2 } {
  const pose = sampleAt(t);
  const t2 = Math.min(t + SAMPLE_DT, limit);
  const dt = t2 - t;
  if (dt <= 0) return { pose, velocity: [0, 0] };
  const next = sampleAt(t2);
  return {
    pose,
    velocity: [(next.p[0] - pose.p[0]) / dt, (next.p[1] - pose.p[1]) / dt],
  };
}
