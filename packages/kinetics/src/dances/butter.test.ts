import { describe, expect, it } from "vitest";
import { proveMotion } from "../motion/prove.js";
import { BUTTER_BEATS_PER_TIME } from "./butter.js";
import { runNamed } from "./load.js";

/**
 * Butter, whole, from `packages/lang/dances/butter.dance`: the seven times
 * through, the first time without the shift, the progression, and the ends.
 *
 * The bounds here are **re-pinned for the joined stack** (risk R2) and every
 * one of them moved, for two reasons that are both written down rather than
 * smoothed over:
 *
 * 1. **The chain and the hey are stands** (D5) — no figure answers to their
 *    `ir` yet, so twenty-four of the sixty-four beats are a dancer standing
 *    still, and the balance that follows the hey has to take hands from
 *    wherever the stand left them. M2 makes them figures and re-pins again.
 * 2. **`becket.dance` lays its minor sets 1.6 m apart with every one seated**,
 *    so a progression moves a couple a whole couple-width (40 px) and the
 *    shift is asked to walk it in two beats. It cannot: `StepTooLong` says
 *    "shift walks 160 cm to its seat in 2 beats" two hundred and fifty-six
 *    times, and the drift check says the dancers end up as much as 60 px from
 *    the seat the commit gave them. The floor a becket really has is half
 *    that pitch with alternate minor sets occupied (the kinetics plan's DA9);
 *    saying so in the language needs the couple coming in to land on the
 *    right parity, which is a G1/D9 question and not this milestone's.
 *
 * Old numbers, from round 1's text on round 1's becket with a partner swing
 * standing in for the chain and the hey: **≤ 40 schedule errors**, kinds ⊆
 * {StepTooLong, PivotTooLarge, TimingViolation}, **hip worst < 5×**.
 *
 * New numbers, measured 2026-09-18 at 112 bpm, seven times through:
 * **116 / 215 / 308** schedule errors at 1 / 2 / 3 minor sets, kinds ⊆
 * {StepTooLong, TimingViolation, RateTooHigh} — `PivotTooLarge` has gone and
 * `RateTooHigh` has arrived, both because the circle now gets a squeezed body
 * after paying for a shift it could not finish — and the hip's worst ratio is
 * **3.67 / 3.92 / 3.87×**, so that pin **tightens** from 5 to 4 rather than
 * loosening. `CAPS` has not moved and must not.
 */
const MAX_SCHEDULE_ERRORS = 320;
const MAX_HIP_RATIO = 4;
const KINDS = ["StepTooLong", "PivotTooLarge", "TimingViolation", "RateTooHigh"];

describe("Butter, the loop", () => {
  for (const minorSets of [1, 2, 3]) {
    const couples = minorSets * 2;
    it(`${String(couples)} couples: seven times through, first time without the shift, and the seams pinned`, () => {
      const result = runNamed("butter", {
        args: { "minor-sets": minorSets },
        times: 7,
        bpm: 112,
      });
      expect(result.errors.filter((e) => e.stage === "run")).toEqual([]);
      expect(result.sequence?.title).toBe("Butter");
      expect(result.sequence?.dialect).toBe("MajorSet");

      // The chain and the hey, once each, however many dancers say them (D5).
      const noFigure = result.errors.filter((e) => e.kind === "NoFigure");
      expect(noFigure.map((e) => e.message.replace(/ \(\d+ calls\)$/, ""))).toEqual([
        'no figure for "chain": the move stands for 8 beats',
        'no figure for "hey": the move stands for 16 beats',
      ]);
      expect(noFigure.every((e) => e.span?.file === "butter.dance")).toBe(true);

      const calls = result.sequence!.perDancer["0-1L"]!;
      // First time: no shift, and the circle takes the eight beats (D8).
      const first = calls[0]!;
      expect(["circle", "wait-out"]).toContain(first.figure.id);
      if (first.figure.id === "circle") expect(first.beats).toBe(8);
      // Seven times through, each starting on a multiple of sixty-four.
      const starts = calls.filter((c) => c.start % BUTTER_BEATS_PER_TIME === 0);
      expect(starts.length).toBe(7);
      expect(calls[calls.length - 1]!.end).toBe(7 * BUTTER_BEATS_PER_TIME);
      expect(result.endBeat).toBe(7 * BUTTER_BEATS_PER_TIME);
      // After setup, one commit per time through from the second on.
      expect(result.sequence!.memberships.length).toBe(7);

      const s = result.schedule!;
      const kinds = [...new Set(s.errors.map((e) => e.kind))];
      expect(
        kinds.every((k) => KINDS.includes(k)),
        kinds.join(","),
      ).toBe(true);
      expect(
        s.errors.length,
        s.errors
          .map((e) => e.message)
          .slice(0, 8)
          .join("\n"),
      ).toBeLessThanOrEqual(MAX_SCHEDULE_ERRORS);

      for (const id of result.dialect!.dancers) {
        const violations = proveMotion(result.executed!.trajectories[id]!);
        const worst = Math.max(0, ...violations.map((v) => v.value / v.cap));
        expect(worst, `${id} worst ×${worst.toFixed(2)}`).toBeLessThan(MAX_HIP_RATIO);
      }
    });
  }

  it("ends: a couple that runs off the end crosses over, waits one time through, and comes back in", () => {
    const result = runNamed("butter", { args: { "minor-sets": 2 }, times: 7, bpm: 112 });
    // Somewhere in seven times through, every dancer stands a whole time
    // through, and dances again after.
    for (const id of result.dialect!.dancers) {
      const calls = result.sequence!.perDancer[id]!;
      const byTime = Array.from({ length: 7 }, (_, t) =>
        calls.filter((c) => Math.floor(c.start / BUTTER_BEATS_PER_TIME) === t),
      );
      // A couple carried off the end by the beat-0 commit waits the whole
      // sixty-four; one the progression carries out mid-way dances up to the
      // shift and waits out what is left of the time (the language's D4), so
      // a waiting time is one that *contains* a wait-out, not one that is
      // nothing else.
      const waiting = byTime.map((cs) => cs.some((c) => c.figure.id === "wait-out"));
      expect(waiting.some(Boolean), `${id} never waits out`).toBe(true);
      const firstWait = waiting.indexOf(true);
      expect(
        waiting.slice(firstWait).some((w) => !w),
        `${id} never comes back`,
      ).toBe(true);
    }
  });

  /**
   * The finding this milestone animated its way to, kept as a test so it
   * cannot quietly go away: the becket's progression is twice the distance
   * the shift has beats for, and the drift check names it.
   */
  it("says the shift cannot reach the seat the progression gives it", () => {
    const result = runNamed("butter", { args: { "minor-sets": 3 }, times: 7, bpm: 112 });
    const tooLong = result.errors.filter(
      (e) => e.kind === "StepTooLong" && e.message.includes("shift walks 160 cm"),
    );
    expect(tooLong.length).toBeGreaterThan(0);
    const drift = result.warnings.filter((w) => w.kind === "Drift");
    expect(drift.length).toBeGreaterThan(0);
    expect(drift.every((w) => /ends \d+\.\d px from the seat/.test(w.message))).toBe(true);
  });
});
