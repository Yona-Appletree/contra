import type { Beat, Hand, PoseSample, Vec2 } from "@caller/core";
import type { StationId } from "@caller/choreo";

/**
 * **A coded figure, sampled once and committed.**
 *
 * Every migrated `FigureDefinition` was proved against the hand-coded figure it
 * replaced: `compareFigures` danced the two side by side in a real set and
 * asserted they agreed. M11 deletes the coded layer (DD77, the user's ruling:
 * *"yes, you can delete the old code, please do, it'll live on in git"*), which
 * would take the other half of every one of those goldens with it.
 *
 * So the coded half is **recorded** instead. Each figure's predecessor was
 * sampled at the last commit that still held it — every case, both formations,
 * from the stations and displaced, every dancer, at every
 * {@link PROBE_STEP} — and the result committed as JSON beside the test. The
 * test then holds the definition to the file, at the tolerance its own
 * milestone states.
 *
 * This is M5's method, generalised: `figures/heyWeaveGolden.ts` froze the coded
 * hey's weave the same way when `figures/hey.ts` was deleted, and for the same
 * reason. **A golden regenerated from the thing it is checking is not a
 * golden**: these files are written once and are not rewritten without a gate.
 * There is deliberately no code left that can rewrite them — the recorder went
 * with the figures it recorded.
 *
 * **They hold full float precision, unrounded**, and the tolerance the tests
 * assert is 1e-9 px and 1e-9° (DD90). The two are one decision: a recorded
 * golden is compared on a machine other than the one that wrote it, and a CI
 * runner reproduces a pose to some 7e-15 of the committed number rather than to
 * the bit — so the assertion cannot be bit-for-bit, and the file must not add
 * error of its own. Rounding to four decimal places would put 7e-5 in, ten
 * orders of magnitude above the noise, and the tolerance would stop meaning
 * anything.
 */
export interface FigureFixture {
  /** The coded figure's id. */
  figure: string;
  /** The commit the samples were taken at, and the date. */
  sampledAt: string;
  /** The coded figure's own nominal count, in beats. */
  beats: Beat;
  /** The coded figure's call text. */
  call: string;
  /** How many beats early the figure is anticipated. */
  lead: Beat;
  /** The coded figure's tuning defaults, without `from` and `carried`. */
  defaults: Record<string, unknown>;
  /** One entry per (formation, start, case), keyed by {@link fixtureKey}. */
  runs: Record<string, FixtureRun>;
}

/** One case of one formation, from one starting arrangement. */
export interface FixtureRun {
  formation: string;
  from: "stations" | "displaced";
  /** The case's index in the options' own `cases` array. */
  index: number;
  /** How long the figure ran, which may be the call's count rather than the figure's. */
  beats: Beat;
  /** Where the coded figure left each station: `[x, y, facing]`, frame-local. */
  ends: Record<StationId, readonly number[]>;
  /**
   * One row per sample, at t = 0, {@link PROBE_STEP}, … to `beats`, per station.
   *
   * A row is {@link ROW_FIELDS} numbers long; {@link poseOfRow} reads it back.
   * Flat numbers rather than objects because these files are large and a golden
   * is read by a diff at least as often as by a person.
   */
  samples: Record<StationId, readonly (readonly number[])[]>;
}

/** Which run a formation, a start and a case index name. */
export const fixtureKey = (
  formation: string,
  from: "stations" | "displaced",
  index: number,
): string => `${formation}|${from}|${String(index)}`;

/**
 * What one row of {@link FixtureRun.samples} holds, in order.
 *
 * ```text
 *  0  1   x, y                         8   buzz         (0 | 1)
 *  2      facing                       9   feet present (0 | 1)
 *  3      look                        10 … 13  foot L x, y, foot R x, y
 *  4      lean                        14  L hand placed (0 | 1)
 *  5      stepRate                    15 … 17  L hand x, y, drop
 *  6      flare                       18  R hand placed (0 | 1)
 *  7      amp                         19 … 21  R hand x, y, drop
 * ```
 */
export const ROW_FIELDS = 22;

/** A pose read back out of a row. */
export function poseOfRow(row: readonly number[]): PoseSample {
  const at = (i: number): number => row[i] ?? 0;
  const hand = (base: number): Hand | "down" =>
    at(base) === 0 ? "down" : { p: [at(base + 1), at(base + 2)] as Vec2, drop: at(base + 3) };
  const pose: PoseSample = {
    p: [at(0), at(1)],
    facing: at(2),
    look: at(3),
    lean: at(4),
    stepRate: at(5),
    flare: at(6),
    amp: at(7),
    buzz: at(8) === 1,
    hands: { L: hand(14), R: hand(18) },
  };
  if (at(9) === 1) {
    return {
      ...pose,
      feet: { L: [at(10), at(11)], R: [at(12), at(13)] },
    };
  }
  return pose;
}

/** Where the coded figure left a station, read back out of an `ends` row. */
export const endOfRow = (row: readonly number[]): { p: Vec2; facing: number } => ({
  p: [row[0] ?? 0, row[1] ?? 0],
  facing: row[2] ?? 0,
});

/** The run a comparison is checked against, by name, so a missing one says so. */
export function runOf(
  fixture: FigureFixture,
  formation: string,
  from: "stations" | "displaced",
  index: number,
): FixtureRun {
  const key = fixtureKey(formation, from, index);
  const run = fixture.runs[key];
  if (run === undefined) {
    throw new Error(
      `${fixture.figure}: no recorded run "${key}" — the fixture was sampled over different cases than the test now runs, and a golden is not regenerated without a gate`,
    );
  }
  return run;
}
