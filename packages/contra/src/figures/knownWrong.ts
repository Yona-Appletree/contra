/**
 * What is wrong with the library today, written down rather than skipped.
 *
 * The rule this table exists to enforce: **everything not on it passes, and
 * everything on it still fails.** A figure that gets fixed makes its own row
 * fail the second half of that, so the fix has to delete the row — which is
 * how the list gets shorter without anyone remembering to look at it. Nothing
 * here is `skip`ped and no assertion was loosened to accommodate it.
 *
 * `figureChecks.test.ts` is the test. `reportMotion.ts` prints the table into
 * `docs/motion-report.md`, so the list is also the thing the director and the
 * user read.
 */

/** One thing that is wrong, and how we know. */
export interface KnownWrong {
  /** The figure id or seam key, exactly as `figureChecks()` reports it. */
  key: string;
  /** The `label` of the assertion that fails, exactly as it reports it. */
  label: string;
  /** What the assertion measured when this row was written. */
  measured: string;
  /** Why, in one line. The user's own words where they apply. */
  why: string;
}

/**
 * Every assertion in `figureChecks()` that fails today. **The list is empty.**
 *
 * It was written by F3a on 2026-09-14 against `main` at `8da9d72` with fourteen
 * rows, and emptied over the same day:
 *
 * - F3c took the two `balance` rows and the `balance → swing` row: the
 *   zero-length release that made both of a balance's hands `NaN` is fixed and
 *   the hold crosses the seam now instead of being let go of.
 * - F4 took the other eleven — three `hey`, four `robins-chain`, three
 *   `right-and-left-through`, one `do-si-do` — by re-choreographing the four
 *   figures they were about: the hey weaves, the chain's larks scoop and walk
 *   backward, right and left through passes the dancer it is facing, and a
 *   do-si-do passes instead of orbiting.
 *
 * An empty list is the interesting state, not the end of the table: the
 * contract `figureChecks.test.ts` holds is that everything not on this list
 * passes, so with nothing on it every assertion in the library passes. The next
 * defect anybody measures gets a row here rather than a `skip`.
 */
export const KNOWN_WRONG: readonly KnownWrong[] = [];

/** Whether this assertion of this figure is a known defect. */
export const isKnownWrong = (key: string, label: string): boolean =>
  KNOWN_WRONG.some((row) => row.key === key && row.label === label);

/** Every known defect of one figure or seam. */
export const knownWrongFor = (key: string): readonly KnownWrong[] =>
  KNOWN_WRONG.filter((row) => row.key === key);
