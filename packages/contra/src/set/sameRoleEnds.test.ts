import { ORACLE_STEP, danceBeats, dist, poseAt } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { LAB_RUN, danceAlone, danceBySlug, linesFor } from "../dances/index.js";

/**
 * **M9f — a same-role pair has no lark and no robin.**
 *
 * A swing opens out with the lark on the left of the way the pair faces and the
 * robin on its right, and `orbitPair`'s `settle` read that off the *dancers'*
 * own roles. "Robins balance and swing" is two robins, so both answers were
 * `robin` and the test fell through to "the first of the pair" — a coin toss
 * with nothing to do with where the two of them are standing.
 *
 * When the toss lost, the two end places were named the wrong way round, and a
 * swing's bodies are lerped from the orbit straight to their ends: both dancers
 * were dragged across the centre at once and **passed through each other on the
 * way out of their own swing**.
 *
 * Measured on Anna's Reel's B1 (`balance-and-swing`, `pairs: [["1R","2R"]]`,
 * whose two robins stand on a diagonal of the minor set): `collision 3.6187 px`
 * at **beat 47**, at every checked line length, and again at beat 175 in the
 * second half of the dance's two passes. The fix names the ends by **position**
 * — the end of the orbit each dancer actually finishes on, which `round:
 * "open"` fixes at `facing + 90` — and only for a pair whose two dancers share
 * a role, so every mixed pair in the corpus is bit-for-bit what it was.
 *
 * The assertion is AC6's own 8 px, over the pair the call names, across the
 * whole of the two calls: a swing's own two dancers are the closest pair in any
 * dance, so "this pair, never under 8 px" is the strongest form of it.
 */

/** Anna's Reel's two same-role swings: B1's robins and 2B1's larks. */
const SAME_ROLE_SWINGS = [
  { call: "ROBINS BALANCE AND SWING", from: 32, to: 48 },
  { call: "LARKS BALANCE AND SWING", from: 160, to: 176 },
] as const;

/** AC6's bound, quoted here so the fixture says what it is asserting. */
const AC6_PX = 8;

describe("a same-role swing opens out without passing through itself", () => {
  const dance = danceBySlug("annas-reel")!;
  for (const couples of linesFor(dance)) {
    for (const { call, from, to } of SAME_ROLE_SWINGS) {
      it(`${call.toLowerCase()} at ${String(couples)} couples`, () => {
        const timeline = danceAlone(dance, couples, danceBeats(dance) * 2, {}, LAB_RUN).timeline();
        // The pairs this call cast, read back off the timeline rather than
        // guessed: each `balance-and-swing` instance is one pair.
        const pairs = timeline
          .figures()
          .filter((e) => e.figure === "balance-and-swing" && e.start === from && e.end === to)
          .map((e) => Object.values(e.bindings));
        expect(pairs.length).toBeGreaterThan(0);
        for (const pair of pairs) {
          expect(pair).toHaveLength(2);
          const [x, y] = pair as [string, string];
          let closest = Infinity;
          let at = from;
          for (let beat = from; beat <= to + 1e-9; beat += ORACLE_STEP) {
            const gap = dist(poseAt(timeline, x, beat).p, poseAt(timeline, y, beat).p);
            if (gap < closest) {
              closest = gap;
              at = beat;
            }
          }
          expect(
            closest,
            `${x} and ${y} came ${closest.toFixed(4)} px apart at beat ${at.toFixed(3)}`,
          ).toBeGreaterThan(AC6_PX);
        }
      });
    }
  }
});
