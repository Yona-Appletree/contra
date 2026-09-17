import type { DancerId } from "../dialect/Dialect.js";
import type { Hand, HoldId } from "../ir/Hold.js";
import type { Trajectory } from "../motion/Trajectory.js";
import type { Tempo } from "../units/Tempo.js";

/**
 * What the body solver is given: one dancer's planned effectors, the holds in
 * force over them, and where they are looking.
 *
 * **P5's executor produces this.** The executor is the only producer of
 * trajectories (DA10) and the solver is downstream of it: nothing here is
 * planned or re-timed by the solver, which only adds the joints the effectors
 * imply. The interface lives in its own file so the two phases meet at a data
 * shape rather than at a function signature.
 */
export interface SolveInput {
  tempo: Tempo;
  /**
   * Each dancer's role. The dialect is the only thing that knows a role name
   * (D16), so it is passed in as a record rather than imported.
   */
  dialectRoles: Record<DancerId, "lark" | "robin">;
  dancers: Record<DancerId, SolveDancer>;
}

/** One dancer's planned motion, over the same sample range as everyone else's. */
export interface SolveDancer {
  /**
   * `hip`, `footL`, `footR`, `handL`, `handR`, with the channels `facing`,
   * `lean`, `holdWeightL` and `holdWeightR`. The joints are absent: they are
   * what the solver adds.
   */
  effectors: Trajectory;
  /** Every hold this dancer is in over the range, with the samples it spans. */
  holds: readonly SolveHold[];
  /** What this dancer is looking at, per sample. */
  look: readonly LookAt[];
}

/**
 * One hold, from this dancer's side. `fromSample` and `toSample` are the
 * samples the hold is in force between, inclusive of the first and exclusive
 * of the last; the ramps in and out live in the `holdWeight` channel, not
 * here.
 */
export interface SolveHold {
  hand: Hand;
  hold: HoldId;
  with: DancerId;
  fromSample: number;
  toSample: number;
}

/**
 * Who or what a dancer is looking at: another dancer (their head at that
 * sample, which the user's ruling takes for their eyes), a bare direction in
 * degrees (where they are going), or nothing at all.
 */
export type LookAt = DancerId | { deg: number } | undefined;
