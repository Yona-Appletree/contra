/**
 * **Butter** (Gene Hubert, becket), as a program in the language: the evening
 * script from the vision with the dance as a definition. `data/dances/butter.json`
 * is the record this is written from; its transcript reads
 * `A1 (2) Shift left (6) Circle left 3/4 (8) Neighbor swing · A2 (8) In long
 * lines, go forward and back (8) Ladies chain to partner · B1 (16) Hey
 * (WR;NL;MR;PL;WR;NL;MR) · B2 (4) Partner balance (12) Partner swing`.
 *
 * The first time through has no shift (D8: *"you just don't slide. you wait.
 * (or circle slower)"*), so the circle takes eight beats; every later time
 * `progress()` moves the seating and the shift walks each couple to its new
 * seat — along the line, or across to the other line's end for a couple that
 * has reached the end, which then waits out (`wait-out`) one time through.
 */
export const BUTTER_PROGRAM = `// Butter — Gene Hubert, becket
partner = select(partner)

repeat(7) { dance() }

dance {
  when (not first-time) { progress() }
  here = select(neighbor)
  if (here) {
    when (first-time) {
      ring = select(hands-four)
      circle(ring, left, 3, 8)
    } else {
      shift(partner, left)
      ring = select(hands-four)
      circle(ring, left, 3, 6)
    }
    swing(here, 8)
    long-lines(here, 8)
    robins-chain(ring, robins, 8)
    hey(ring, robins, "WR;NL;MR;PL;WR;NL;MR", 16)
    balance(partner)
    swing(partner, 12)
  } else {
    wait-out(partner, 64)
  }
}
`;

/** The programme's beat count per time through, from the record's phrases. */
export const BUTTER_BEATS_PER_TIME = 64;

/**
 * Butter as it runs **tonight**: the robins chain and the hey are not written
 * yet, so a partner swing stands in for the two — it keeps the sixty-four
 * beats and, like the chain, brings each couple back together on the lark's
 * side. The debugger's Butter preset runs this; `BUTTER_PROGRAM` is the dance.
 */
export const BUTTER_TONIGHT = BUTTER_PROGRAM.replace(
  '    robins-chain(ring, robins, 8)\n    hey(ring, robins, "WR;NL;MR;PL;WR;NL;MR", 16)\n',
  "    // robins-chain and hey are not written yet: a partner swing stands in\n    swing(partner, 24)\n",
);
