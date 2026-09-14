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
 * Every assertion in `figureChecks()` that fails today.
 *
 * Measured 2026-09-14 by F3a, against `main` at `8da9d72`, and shortened the
 * same day by F3c: the two `balance` rows and the `balance → swing` row are
 * gone, because the zero-length release that made both of a balance's hands
 * `NaN` is fixed and the hold now crosses the seam instead of being let go of.
 */
export const KNOWN_WRONG: readonly KnownWrong[] = [
  {
    key: "hey",
    label: "1R and 1L pass L shoulders around beat 4.0",
    measured: "at the closest point 1L is on 1R's R, not their L (10.000 px at beat 4.250)",
    why: "the user: \"the hey is just totally wrong. that's a weaving figure.\" A hey alternates shoulders — right in the centre, left on the sides — and this one never alternates: all four dancers walk one closed lane in the same direction, so every pass in the figure is by the same shoulder. The four passes in the *centre* are right and correct (they pass at 10.0 px, within 3.5 px of the set's centre, at beats 3.0, 5.5, 10.5 and 13.0); it is the three side passes that are on the wrong shoulder.",
  },
  {
    key: "hey",
    label: "1R and 2L pass L shoulders around beat 8.0",
    measured: "at the closest point 2L is on 1R's R, not their L (10.000 px at beat 8.000)",
    why: "the same single lane as the pass at beat 4.",
  },
  {
    key: "hey",
    label: "2R and 2L pass L shoulders around beat 12.0",
    measured: "at the closest point 2L is on 2R's R, not their L (10.000 px at beat 11.750)",
    why: "the same single lane as the pass at beat 4.",
  },
  {
    key: "robins-chain",
    label: "1L walks backward from beat 6.3 to 7.4",
    measured: "he does not walk anywhere: 0.000 px over the whole window",
    why: 'the user: "robins pull by in the center, then the larks scoop them and walk backwards or they twirl them." The lark stands rooted on his place through the courtesy turn and only turns his head.',
  },
  {
    key: "robins-chain",
    label: "2L walks backward from beat 6.3 to 7.4",
    measured: "he does not walk anywhere: 0.000 px over the whole window",
    why: "the same as 1L.",
  },
  {
    key: "robins-chain",
    label: "1L's L stays joined to 2R's L from beat 6.3 to 7.4",
    measured: "the two hands are 42.723 px apart",
    why: "the chain courtesy-turns each robin with the wrong lark. It picks the lark *nearest* where she lands, and in this formation the nearest lark is 20 px up the same line while the lark she is a couple with there is 32 px away across the set. The line offset being larger than the place pitch is what makes the heuristic pick wrong, so this is a bug in the chain and not a tuning number.",
  },
  {
    key: "robins-chain",
    label: "2L's L stays joined to 1R's L from beat 6.3 to 7.4",
    measured: "the two hands are 42.723 px apart",
    why: "the same as 1L and 2R.",
  },
  {
    key: "do-si-do",
    label: "1L and 2R pass R shoulders around beat 1.8",
    measured: "they never come closer than 20.21 px, and a pass is 14 px",
    why: "the two of them orbit their common centre at a constant radius and never approach each other. A do-si-do is a pass: you walk forward past a right shoulder, go back to back, and walk backward past a left one, and you are beside each other for most of it.",
  },
  {
    key: "right-and-left-through",
    label: "1L and 2R pass R shoulders around beat 2.0",
    measured: "they never come closer than 20.00 px, and a pass is 14 px",
    why: "each dancer crosses the set diagonally to the far corner rather than passing the dancer directly opposite. In duple improper the ones face the twos along the line, so 1L's pass is with 2R, 20 px straight ahead of him; the figure sends him to 2L's place instead, and the two of them never meet.",
  },
  {
    key: "right-and-left-through",
    label: "1L walks backward from beat 4.5 to 7",
    measured: "only 0.000 px of the 29.518 px he travels is behind him",
    why: "the courtesy turn is drawn as a sideways slide: he travels 29.5 px, all of it across his own facing and none of it backward. Same defect as the chain's, differently shaped.",
  },
  {
    key: "right-and-left-through",
    label: "2L walks backward from beat 4.5 to 7",
    measured: "only 0.000 px of the 29.518 px he travels is behind him",
    why: "the same as 1L.",
  },
];

/** Whether this assertion of this figure is a known defect. */
export const isKnownWrong = (key: string, label: string): boolean =>
  KNOWN_WRONG.some((row) => row.key === key && row.label === label);

/** Every known defect of one figure or seam. */
export const knownWrongFor = (key: string): readonly KnownWrong[] =>
  KNOWN_WRONG.filter((row) => row.key === key);
