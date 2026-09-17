import type { Channel, PointName } from "../body/Body.js";
import type { Tempo } from "../units/Tempo.js";
import type { Vec3 } from "./Vec3.js";

/**
 * A sampled trajectory: every point and channel present, sampled at
 * `tempo.samplesPerBeat` per beat, starting at `beat0`. A point or channel
 * absent from `points`/`channels` was never planned for this trajectory.
 */
export interface Trajectory {
  tempo: Tempo;
  /** Beat of sample 0. */
  beat0: number;
  /** Number of samples; sample i is at beat0 + i / tempo.samplesPerBeat. */
  length: number;
  points: Partial<Record<PointName, readonly Vec3[]>>;
  channels: Partial<Record<Channel, readonly number[]>>;
}

/** The beat sample `i` of `t` falls on. */
export const beatOf = (t: Trajectory, i: number): number => t.beat0 + i / t.tempo.samplesPerBeat;

/** The index of the sample nearest `beat`, clamped to `[0, t.length - 1]`. */
export const sampleAt = (t: Trajectory, beat: number): number => {
  const raw = Math.round((beat - t.beat0) * t.tempo.samplesPerBeat);
  return Math.min(Math.max(raw, 0), t.length - 1);
};
