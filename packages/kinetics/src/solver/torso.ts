import { angleDiff, angleOf } from "@caller/core";
import { ANGULAR_CAPS } from "../units/caps.js";
import { degPerBeat, type Tempo } from "../units/Tempo.js";
import type { Vec3 } from "../motion/Vec3.js";

/**
 * The torso's yaw, sample by sample: the facing the executor planned, plus the
 * one comfort rule this bite has, and then rate-limited.
 *
 * The comfort rule (DA11): **the torso comes round to the hands it is
 * holding**. Each held hand pulls the shoulders toward the bearing from the
 * hips to where that hand has to be, in proportion to how much of the take has
 * ramped in, and the sum of the pulls is capped at
 * {@link COMFORT_YAW_DEG} — a dancer squares up to an allemande, they do not
 * wring themselves out.
 *
 * The limiter is first-order and its job is to **tell on the executor**: a
 * torso that cannot turn as fast as it has been asked to is the executor
 * asking for something a body cannot do, so every sample the limiter has to
 * act on comes back in `limited` and becomes a violation.
 */
export const solveTorso = (input: TorsoInput): TorsoSolution => {
  const { tempo, facing, hips, pulls } = input;
  const capPerSample = degPerBeat(tempo, ANGULAR_CAPS.yawDegPerS) / tempo.samplesPerBeat;
  const yawDeg: number[] = new Array(facing.length);
  const limited: LimitedSample[] = [];

  // What the torso wants, sample by sample: the planned facing plus the pull
  // of the hands it is holding. The comfort term follows a hand target that
  // can kink (a take while spiralling), and a kink in the yaw lands on the
  // shoulders as acceleration; so the wish is smoothed first — a zero-phase
  // low-pass over `COMFORT_SMOOTHING_SAMPLES`, forward then back so it does
  // not lag — and only then rate-limited.
  const comfortRaw: number[] = new Array(facing.length);
  for (let i = 0; i < facing.length; i++) {
    comfortRaw[i] = comfortYawDeg(facing[i]!, hips[i]!, pulls[i] ?? []);
  }
  // Only the comfort term is smoothed: the planned facing is the executor's
  // and already continuous, and passes through untouched.
  const comfort = smoothTriangular(comfortRaw, COMFORT_SMOOTHING_SAMPLES);
  const want = facing.map((f, i) => f + comfort[i]!);

  for (let i = 0; i < facing.length; i++) {
    if (i === 0) {
      yawDeg[0] = want[0]!;
      continue;
    }
    const step = angleDiff(yawDeg[i - 1]!, want[i]!);
    if (Math.abs(step) > capPerSample + 1e-9) {
      limited.push({ sample: i, value: Math.abs(step), cap: capPerSample });
      yawDeg[i] = yawDeg[i - 1]! + Math.sign(step) * capPerSample;
    } else {
      yawDeg[i] = yawDeg[i - 1]! + step;
    }
  }

  return { yawDeg, limited };
};

/** The torso's wish is smoothed over this many samples (a quarter beat at 16 per beat) before it is followed. */
export const COMFORT_SMOOTHING_SAMPLES = 4;

/**
 * A symmetric triangular moving average of half-width `samples`, edges
 * clamped: zero phase, so the smoothed wish neither leads nor lags the raw one.
 */
const smoothTriangular = (values: readonly number[], samples: number): number[] => {
  const n = values.length;
  if (n === 0 || samples <= 0) return [...values];
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let weight = 0;
    for (let j = -samples; j <= samples; j++) {
      const w = samples + 1 - Math.abs(j);
      const k = Math.min(n - 1, Math.max(0, i + j));
      sum += w * values[k]!;
      weight += w;
    }
    out[i] = sum / weight;
  }
  return out;
};

export interface TorsoInput {
  tempo: Tempo;
  /** The facing the executor planned, degrees. */
  facing: readonly number[];
  hips: readonly Vec3[];
  /** The hands pulling the torso round at each sample — one entry per held hand. */
  pulls: readonly (readonly HandPull[])[];
}

/** One held hand: where it has to be, and how much of its take has ramped in. */
export interface HandPull {
  target: Vec3;
  /** The hold's `holdWeight` channel, 0 (free) to 1 (fully taken). */
  weight: number;
}

/** The solved yaw, and every sample the rate limiter had to act on. */
export interface TorsoSolution {
  yawDeg: readonly number[];
  limited: readonly LimitedSample[];
}

/** One sample a rate limiter had to act on: what was asked, and what was allowed. */
export interface LimitedSample {
  sample: number;
  value: number;
  cap: number;
}

/** How far off the planned facing the comfort rule may turn the shoulders, degrees. */
export const COMFORT_YAW_DEG = 30;

/**
 * How far the held hands turn the shoulders off `facingDeg`, degrees.
 *
 * The divisor is `max(1, Σ weight)` rather than `Σ weight`: a take that is
 * half ramped in should turn the torso half way, not all the way, and two
 * hands pulling in different directions should average rather than add.
 */
export const comfortYawDeg = (facingDeg: number, hip: Vec3, pulls: readonly HandPull[]): number => {
  let sum = 0;
  let weight = 0;
  for (const pull of pulls) {
    if (pull.weight <= 0) continue;
    const dx = pull.target.x - hip.x;
    const dy = pull.target.y - hip.y;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    const bearing = angleOf(dx, dy);
    sum += pull.weight * angleDiff(facingDeg, bearing);
    weight += pull.weight;
  }
  if (weight <= 0) return 0;
  const yaw = sum / Math.max(1, weight);
  return Math.min(Math.max(yaw, -COMFORT_YAW_DEG), COMFORT_YAW_DEG);
};
