import type { Vec2 } from "@caller/core";
import { angleDiff } from "@caller/core";
import { HEIGHTS } from "../body/Body.js";
import type { Vec3 } from "../motion/Vec3.js";
import type { Tempo } from "../units/Tempo.js";

/**
 * The hip and the facing, from one per-beat target each to a continuous
 * sampled path (DA10).
 *
 * A **cubic Hermite** through the targets with natural-spline tangents (C2): the
 * hip is exactly on its target at every beat, and its velocity is continuous
 * across every beat boundary, so the seam between two figures is not a place
 * the motion can jump. The tangents are zero at the two ends and at any beat
 * the dancer stands still on both sides of — a stop is a stop, not a coast
 * through.
 *
 * Everywhere else the tangent is Catmull-Rom's `(P[i+1] − P[i−1]) / 2`, which
 * is deliberately **not** zero at the beat a walk starts on: the hip drifts a
 * fraction of a pixel into the step over the beat before it, which is both
 * what a dancer does and, by a factor of nearly two, the lower-acceleration
 * way to start moving. See `hipPath.test.ts` for the arithmetic and for what
 * the hip's acceleration cap does and does not allow.
 *
 * The hip's z is the contract's hip height, flat: no vertical bounce, ever.
 */
export const hipPath = (targets: readonly BeatPose[], tempo: Tempo): HipPath => {
  if (targets.length === 0) return { hip: [], facing: [], length: 0 };
  const xs = targets.map((t) => t.p[0]);
  const ys = targets.map((t) => t.p[1]);
  const fs = unwrap(targets.map((t) => t.facing));

  const stillHere = still(targets.map((t) => t.p));
  const stillTurn = stillScalar(fs);

  const mx = tangents(xs, stillHere);
  const my = tangents(ys, stillHere);
  const mf = tangents(fs, stillTurn);

  const beats = targets.length - 1;
  const length = beats * tempo.samplesPerBeat + 1;
  const hip: Vec3[] = new Array(length);
  const facing: number[] = new Array(length);
  for (let i = 0; i < length; i++) {
    const beat = i / tempo.samplesPerBeat;
    const k = Math.min(Math.floor(beat), Math.max(beats - 1, 0));
    const t = beat - k;
    hip[i] = {
      x: hermite(xs[k]!, xs[k + 1] ?? xs[k]!, mx[k]!, mx[k + 1] ?? 0, t),
      y: hermite(ys[k]!, ys[k + 1] ?? ys[k]!, my[k]!, my[k + 1] ?? 0, t),
      z: HEIGHTS.hipPx,
    };
    facing[i] = hermite(fs[k]!, fs[k + 1] ?? fs[k]!, mf[k]!, mf[k + 1] ?? 0, t);
  }
  return { hip, facing, length };
};

/** Where a dancer is and which way they point at one beat. */
export interface BeatPose {
  p: Vec2;
  /** Degrees, 0 = +x, increasing toward +y. Unwrapped by {@link hipPath}. */
  facing: number;
}

/** The sampled hip and facing, one entry per sample. */
export interface HipPath {
  hip: readonly Vec3[];
  /** Unwrapped degrees: a dancer who turns twice ends 720° from where they began. */
  facing: readonly number[];
  length: number;
}

/** Below this a beat-to-beat move is a standstill, px or degrees. */
const STILL_EPS = 1e-6;

/** One cubic Hermite segment, `t` in `[0, 1]`. */
export const hermite = (p0: number, p1: number, m0: number, m1: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1
  );
};

/**
 * Catmull-Rom tangents, zeroed at the two ends and wherever `frozen` says the
 * dancer is standing still on both sides of a beat.
 */
/**
 * The tangents of the **natural cubic spline** through the values: the C2
 * curve with zero second derivative at the ends, found by the tridiagonal
 * solve `m[i-1] + 4 m[i] + m[i+1] = 3 (y[i+1] − y[i-1])`. It replaced
 * Catmull-Rom's `(P[i+1] − P[i−1]) / 2` (C1 only) because the corners the
 * scheduler cannot avoid — an entry walk turning into an orbit, a spiral
 * landing and the next figure setting off the other way — overshot the hip's
 * acceleration cap by a third under Catmull-Rom; the natural spline spreads
 * the turn over the neighbouring beats instead. A beat the dancer stands
 * still on both sides of keeps a zero tangent: a stop is a stop.
 */
const tangents = (values: readonly number[], frozen: readonly boolean[]): number[] => {
  const n = values.length;
  const out: number[] = new Array(n).fill(0);
  if (n < 2) return out;
  if (n === 2) {
    const m = values[1]! - values[0]!;
    return [m, m];
  }
  // Thomas algorithm on the natural-spline system.
  const a: number[] = new Array(n).fill(1);
  const b: number[] = new Array(n).fill(4);
  const c: number[] = new Array(n).fill(1);
  const r: number[] = new Array(n).fill(0);
  b[0] = 2;
  b[n - 1] = 2;
  r[0] = 3 * (values[1]! - values[0]!);
  r[n - 1] = 3 * (values[n - 1]! - values[n - 2]!);
  for (let i = 1; i < n - 1; i++) r[i] = 3 * (values[i + 1]! - values[i - 1]!);
  for (let i = 1; i < n; i++) {
    const w = a[i]! / b[i - 1]!;
    b[i] = b[i]! - w * c[i - 1]!;
    r[i] = r[i]! - w * r[i - 1]!;
  }
  out[n - 1] = r[n - 1]! / b[n - 1]!;
  for (let i = n - 2; i >= 0; i--) out[i] = (r[i]! - c[i]! * out[i + 1]!) / b[i]!;
  for (let i = 0; i < n; i++) if (frozen[i]) out[i] = 0;
  return out;
};

/** Beats the dancer neither arrives at nor leaves: a genuine standstill. */
/**
 * Beats the dancer is standing on: no movement on **either** side. A beat a
 * walk arrives at or leaves is included, so the curve into a stop ends with
 * zero velocity and the standing span is flat — under a C2 spline a stop
 * knot with a free tangent would let the hip drift past and come back.
 */
const still = (ps: readonly Vec2[]): boolean[] =>
  ps.map((p, i) => {
    const before = ps[i - 1];
    const after = ps[i + 1];
    const stillBefore =
      before === undefined || Math.hypot(p[0] - before[0], p[1] - before[1]) < STILL_EPS;
    const stillAfter =
      after === undefined || Math.hypot(after[0] - p[0], after[1] - p[1]) < STILL_EPS;
    return stillBefore || stillAfter;
  });

const stillScalar = (vs: readonly number[]): boolean[] =>
  vs.map((v, i) => {
    const before = vs[i - 1];
    const after = vs[i + 1];
    const stillBefore = before === undefined || Math.abs(v - before) < STILL_EPS;
    const stillAfter = after === undefined || Math.abs(after - v) < STILL_EPS;
    return stillBefore || stillAfter;
  });

/**
 * Facings made continuous: each one moved to within ±180° of the one before,
 * so a dancer who turns through 360° reads as 360 rather than snapping back
 * to 0 and interpolating the long way round.
 */
export const unwrap = (degrees: readonly number[]): number[] => {
  const out: number[] = [];
  let previous = degrees[0] ?? 0;
  for (const d of degrees) {
    previous = previous + angleDiff(previous, d);
    out.push(previous);
  }
  return out;
};
