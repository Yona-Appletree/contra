import { describe, expect, it } from "vitest";
import { contraDialect } from "../dialect/contra/Contra.js";
import { execute } from "../executor/execute.js";
import { FIGURES } from "../figures/registry.js";
import { compile } from "../lang/compile.js";
import { parse } from "../lang/parse.js";
import { proveMotion } from "../motion/prove.js";
import { schedule } from "../schedule/schedule.js";
import { tempo } from "../units/Tempo.js";
import { BUTTER_BEATS_PER_TIME } from "./butter.js";

const T = tempo(112);

/**
 * Butter's loop with the figures that exist so far: the seven times through,
 * the first-time elision, the progression, and the ends. The chain and the
 * hey are stood in for by long lines and a second swing until they land,
 * keeping the sixty-four beats.
 */
const PARTIAL = `// Butter — Gene Hubert, becket
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
    swing(partner, 24)
    balance(partner)
    swing(partner, 12)
  } else {
    wait-out(partner, 64)
  }
}
`;

describe("Butter, the loop", () => {
  for (const couples of [2, 4, 6]) {
    it(`${couples} couples: seven times through, first time without the shift, and the seams pinned`, () => {
      const d = contraDialect({ formation: "becket", couples });
      const { sequence, errors } = compile(parse(PARTIAL), FIGURES, d);
      expect(errors).toEqual([]);
      const calls = sequence.perDancer["1L"]!;
      // First time: no shift, and the circle takes the eight beats (D8).
      const first = calls[0]!;
      expect(["circle", "wait-out"]).toContain(first.figure.id);
      if (first.figure.id === "circle") expect(first.beats).toBe(8);
      // Every later time through starts with the shift, unless the couple is waiting out.
      const starts = calls.filter((c) => c.start % BUTTER_BEATS_PER_TIME === 0);
      expect(starts.length).toBe(7);
      expect(calls[calls.length - 1]!.end).toBe(7 * BUTTER_BEATS_PER_TIME);
      const s = schedule(sequence, d, T);
      // Pinned, not hidden: a handful of seams over the whole evening are still
      // over a step's length — a swing opening out to the line from where its
      // hands were taken across the set, a couple's shift to a seat forty
      // pixels off after an end. The fix is the swing's entry bringing the
      // couple to the lark's line before it turns, not a longer step.
      const kinds = [...new Set(s.errors.map((e) => e.kind))];
      expect(
        kinds.every((k) => k === "StepTooLong" || k === "PivotTooLarge" || k === "TimingViolation"),
        kinds.join(","),
      ).toBe(true);
      expect(s.errors.length, s.errors.map((e) => e.message).join("\n")).toBeLessThanOrEqual(40);
      const executed = execute(s, d, T);
      for (const id of d.dancers) {
        const violations = proveMotion(executed.trajectories[id]!);
        const worst = Math.max(0, ...violations.map((v) => v.value / v.cap));
        // Pinned: the hip's worst seam over the whole evening is a swing
        // opening out to the line from a swing taken across the set — four
        // times its acceleration cap. The scheduler's entries need to bring a
        // couple to the line before the turn; a bigger cap is not the fix.
        expect(worst, `${id} worst ×${worst.toFixed(2)}`).toBeLessThan(5);
      }
    });
  }

  it("ends: a couple that runs off the end crosses over, waits one time through, and comes back in", () => {
    const d = contraDialect({ formation: "becket", couples: 4 });
    const { sequence, errors } = compile(parse(PARTIAL), FIGURES, d);
    expect(errors).toEqual([]);
    // Somewhere in seven times through, every dancer stands a whole time through, and dances again after.
    for (const id of d.dancers) {
      const calls = sequence.perDancer[id]!;
      const byTime = Array.from({ length: 7 }, (_, t) =>
        calls.filter((c) => Math.floor(c.start / BUTTER_BEATS_PER_TIME) === t),
      );
      const waiting = byTime.map((cs) => cs.length === 1 && cs[0]!.figure.id === "wait-out");
      expect(waiting.some(Boolean), `${id} never waits out`).toBe(true);
      const firstWait = waiting.indexOf(true);
      expect(
        waiting.slice(firstWait).some((w) => !w),
        `${id} never comes back`,
      ).toBe(true);
    }
  });
});
