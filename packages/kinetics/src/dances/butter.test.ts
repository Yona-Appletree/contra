import { describe, expect, it } from "vitest";
import { treeDialect } from "../dialect/tree/TreeDialect.js";
import { execute } from "../executor/execute.js";
import { proveMotion } from "../motion/prove.js";
import { schedule } from "../schedule/schedule.js";
import { tempo } from "../units/Tempo.js";
import { BUTTER_BEATS_PER_TIME } from "./butter.js";
import { compileDance, readDance, standardFloor } from "./load.js";

const T = tempo(112);
const BUTTER = readDance("butter.dance");

/**
 * Butter's loop with the figures that exist so far: the seven times through,
 * the first-time elision, the progression, and the ends. The chain and the
 * hey are stood in for by a second swing until they land, keeping the
 * sixty-four beats.
 */
describe("Butter, the loop", () => {
  for (const minorSets of [1, 2, 3]) {
    const couples = minorSets * 2;
    it(`${String(couples)} couples: seven times through, first time without the shift, and the seams pinned`, () => {
      const floor = standardFloor("becket", { "minor-sets": minorSets });
      const d = treeDialect(floor);
      const { sequence, errors } = compileDance(BUTTER, floor);
      expect(errors).toEqual([]);
      expect(sequence.title).toBe("Butter");
      const calls = sequence.perDancer["1L"]!;
      // First time: no shift, and the circle takes the eight beats (D8).
      const first = calls[0]!;
      expect(["circle", "wait-out"]).toContain(first.figure.id);
      if (first.figure.id === "circle") expect(first.beats).toBe(8);
      // Every later time through starts with the shift, unless the couple is waiting out.
      const starts = calls.filter((c) => c.start % BUTTER_BEATS_PER_TIME === 0);
      expect(starts.length).toBe(7);
      expect(calls[calls.length - 1]!.end).toBe(7 * BUTTER_BEATS_PER_TIME);
      expect(sequence.memberships.length).toBe(7);
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
    const floor = standardFloor("becket", { "minor-sets": 2 });
    const d = treeDialect(floor);
    const { sequence, errors } = compileDance(BUTTER, floor);
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
