import { describe, expect, it } from "vitest";
import { danceBeats } from "@caller/choreo";
import { ALL_DANCES } from "./index.js";
import { LAB_RUN } from "./danceLab.js";
import { danceAlone, linesFor } from "./oracle.js";

/**
 * **Every figure event starts on an even absolute beat** (M10, Q5 revised).
 *
 * The planted gait alternates feet at every whole beat and lands the **right**
 * foot on the even ones, which is count 1 of a phrase. Parity is carried by the
 * *absolute* beat rather than by each figure's own `t`, so a figure of odd
 * length simply hands the alternation on to the next one rather than restarting
 * it, and nothing in the gait depends on this test passing.
 *
 * So this is a **descriptive oracle**, not a constraint: it says what is
 * actually true of the dances that ship, so that a record which introduces an
 * odd start is a thing somebody chose rather than a thing that happened. The
 * list below is the allowed exceptions, and the test fails **both ways** — an
 * unlisted odd start is a failure, and a listed one that no longer occurs is
 * also a failure, so the list cannot quietly go stale.
 *
 * Through the real decider at every line length, two times through, because a
 * figure's start depends on the resolution: a waiting couple's `wait-out` and
 * the sweeps a `"line"` selector makes are events no card writes down.
 */

/** One figure a dance is allowed to start on an odd beat, and why. */
interface OddStart {
  dance: string;
  figure: string;
  why: string;
}

/**
 * The odd starts that really happen, all four of them, and every one is a card
 * that writes an **odd count** — which is a caller's prerogative and not a
 * defect. M10's plan expected this list to be empty for the programme; it is
 * not, and On the Prowl is why: its mad robin really is three beats.
 *
 * Nothing breaks. The gait's parity is absolute, so the figure after an odd one
 * simply carries on with whichever foot is next: the dancer's left lands on
 * count 1 of that figure instead of their right, which is what a real dancer
 * does after an odd-count figure too.
 */
const ODD_STARTS_ALLOWED: readonly OddStart[] = [
  {
    dance: "on-the-prowl",
    figure: "single-file-promenade",
    why: "the A1 and A2 open with a **three**-beat mad robin, so everything after it in the phrase lands odd",
  },
  {
    dance: "on-the-prowl",
    figure: "shoulder-round",
    why: "the same three-beat mad robin, plus a two-beat promenade: the shoulder round starts on beat 5 of its phrase",
  },
  {
    dance: "contrablend",
    figure: "turn-alone",
    why: "the B2 opens with a **three**-beat circle (lab dance)",
  },
  {
    dance: "annas-reel",
    figure: "hey",
    why: "the A2 opens with a **seven**-beat allemande (lab dance)",
  },
];

/** How many times through each dance is run: enough to see the wrap. */
const TIMES_THROUGH = 2;

describe("every figure event starts on an even absolute beat (M10)", () => {
  const seen = new Set<string>();

  for (const dance of ALL_DANCES) {
    it(`${dance.slug}: at every line length, two times through`, () => {
      const odd: string[] = [];
      for (const couples of linesFor(dance)) {
        const until = danceBeats(dance) * TIMES_THROUGH;
        const decider = danceAlone(dance, couples, until, {}, LAB_RUN);
        for (const event of decider.timeline().figures()) {
          if (event.start > until) continue;
          if (Number.isInteger(event.start) && event.start % 2 === 0) continue;
          const key = `${dance.slug}/${event.figure}`;
          const allowed = ODD_STARTS_ALLOWED.find(
            (entry) => entry.dance === dance.slug && entry.figure === event.figure,
          );
          if (allowed) {
            seen.add(key);
            continue;
          }
          odd.push(`${event.figure} at beat ${String(event.start)} (${String(couples)} couples)`);
        }
      }
      expect([...new Set(odd)]).toEqual([]);
    });
  }

  it("has no stale entries: every allowed odd start still happens", () => {
    const stale = ODD_STARTS_ALLOWED.filter(
      (entry) => !seen.has(`${entry.dance}/${entry.figure}`),
    ).map((entry) => `${entry.dance}/${entry.figure}`);
    expect(stale).toEqual([]);
  });
});
