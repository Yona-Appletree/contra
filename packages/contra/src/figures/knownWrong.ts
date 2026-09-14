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
 * Every assertion in `figureChecks()` that fails today. **One row.**
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
 * It was empty from then until F7, which put the chain's pull by on it. The
 * contract `figureChecks.test.ts` holds is that everything not on this list
 * passes **and everything on it still fails**, so the row below has to be
 * deleted by whoever fixes it rather than quietly going stale.
 */
export const KNOWN_WRONG: readonly KnownWrong[] = [
  {
    key: "robins-chain",
    label: "1R and 2R pass R shoulders around beat 2.5",
    measured:
      "they come 13.497 px apart at beat 2.719, 6.75 px from the middle of the set — a pass, and in the middle — but 2R is on 1R's LEFT by 13.16 px",
    why: "F7's ruling makes the courtesy turn a rigid pivot, and a rigid pivot's take is the finish reflected through the point between them: each robin stops a hold short of her couple's centre, on the near side of it. Two robins who both stop short of the middle are on each other's left however they walk — their straight paths come no nearer than 19.36 px, and the bow that closes that gap cannot change which side of it they are on. Getting them on to right shoulders needs each of them past the middle before the hands close, and that needs her lark a further 11.5 px past it — 27.5 px of a 32 px set — which puts four dancers in the middle at once and breaks AC6 (measured best: 6.78 px against 8). Ruling wanted: the two cannot both be had at this set width.",
  },
];

/** Whether this assertion of this figure is a known defect. */
export const isKnownWrong = (key: string, label: string): boolean =>
  KNOWN_WRONG.some((row) => row.key === key && row.label === label);

/** Every known defect of one figure or seam. */
export const knownWrongFor = (key: string): readonly KnownWrong[] =>
  KNOWN_WRONG.filter((row) => row.key === key);
