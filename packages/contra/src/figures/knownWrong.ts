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
 * It was empty from then until F7, which put the chain's pull by on it. F13
 * fixed that row's own cause (the rigid turn) by making the lark's orbit
 * (F10's candidate 5) the default, and immediately found a different failure
 * of the same assertion underneath it — see the row below — so the table's
 * length did not change, but why it is not empty did. The contract
 * `figureChecks.test.ts` holds is that everything not on this list passes
 * **and everything on it still fails**, so a row has to be deleted by whoever
 * fixes it rather than quietly going stale.
 */
export const KNOWN_WRONG: readonly KnownWrong[] = [
  {
    key: "robins-chain",
    label: "1R and 2R pass R shoulders around beat 2.0",
    measured:
      "they never come closer than 17.773 px, and a pass is 14 px — the closest they come is 17.773 px apart at beat 2.5",
    why: "F13 makes the lark's orbit (F10's candidate 5) the chain's default, whose pull by is a solved point reflection through the set's own centre: the two robins' clearance there is exactly twice how near one of them comes to it. `figureChecks.ts` dances every figure alone from the duple-improper stations, where the two lines stand a full 32 px apart — and no demo dance ever calls the chain from that arrangement; all seven that call it hand it a becket-shaped minor set instead, where this same pull by comes together at 8.500 px on the right, exactly as designed (see F10's own report). `orbitTurn` (F10's ruling, unchanged by F13) already knows this: it only bends the two robins' paths through the dip when their plain, undipped walk already brings them within a hold spacing of each other, because forcing the dip where it does not would send them further apart on their own two sides rather than together — measured and then removed by F10, an AC6 failure at 3.99 px. In duple improper alone their plain walk does not come that close, so there genuinely is no pull by to have there, which is the honest 16.247 px this assertion measures. This is not the rigid turn's defect recurring; it is a different figure hitting the same synthetic formation, and F10's report named it (deviation 5) rather than fixing an assertion nothing in the library actually dances. **M10c** moves the whole pull by from two beats to four on the user's ruling, so the label's beat and the measured px both move with it — 16.247 px at beat 1.5 becomes 17.773 px at beat 2.5. Neither the row nor its reason changes: the two robins still have no pull by to make in a formation no dance calls the chain from.",
  },
];

/** Whether this assertion of this figure is a known defect. */
export const isKnownWrong = (key: string, label: string): boolean =>
  KNOWN_WRONG.some((row) => row.key === key && row.label === label);

/** Every known defect of one figure or seam. */
export const knownWrongFor = (key: string): readonly KnownWrong[] =>
  KNOWN_WRONG.filter((row) => row.key === key);
