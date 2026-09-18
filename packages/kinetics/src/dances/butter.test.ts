import { describe, expect, it } from "vitest";
import { proveMotion } from "../motion/prove.js";
import { BUTTER_BEATS_PER_TIME } from "./butter.js";
import { runNamed } from "./load.js";

/**
 * Butter, whole, from `packages/lang/dances/butter.dance`: the seven times
 * through, the first time without the shift, the progression, and the ends.
 *
 * The bounds here are **re-pinned** (risk R2) each time the stack under them
 * changes, with the old number, the new one and the why written down rather
 * than smoothed over. Two things stand behind every number:
 *
 * 1. **`becket.dance` lays its minor sets 1.6 m apart with every one seated**,
 *    so a progression moves a couple a whole couple-width (40 px) and the
 *    shift is asked to walk it in two beats. It cannot: `StepTooLong` says
 *    "shift walks 160 cm to its seat in 2 beats", the circle after it gets a
 *    squeezed body and long strides, the drift check says the dancers end up
 *    as much as 60 px from the seat the commit gave them, and the clearance
 *    check finds the couple the shift could not move standing on the couple
 *    coming in at the top. The floor a becket really has is half that pitch
 *    with alternate minor sets occupied (the kinetics plan's DA9); saying so
 *    in the language needs the couple coming in to land on the right parity,
 *    which is a G1/D9 question (E1 in the director's log) and not M1's or
 *    M2's. Its share is attributed below so the next re-pin can subtract it.
 * 2. **The chain and the hey are figures since M2**, danced on that floor:
 *    on the clean middle set of a three-set hall they schedule with no
 *    complaint (`figures/butter.test.ts`), but in Butter whole they start
 *    from wherever the shift's failure left everyone, and their lane frames
 *    are skewed with it — which the pivot cap and the clearance check say.
 *
 * Numbers, measured at 112 bpm, seven times through, at 1 / 2 / 3 sets:
 *
 * | pin | M1 (chain and hey stands) | M2 (figures) | why it moved |
 * |---|---|---|---|
 * | schedule errors | 116 / 215 / 308, ≤ 320 | **139 / 259 / 372, ≤ 380** | see the shares |
 * | kinds | {StepTooLong, TimingViolation, RateTooHigh} | + **PivotTooLarge** | the chain's and hey's turns on a skewed floor |
 * | hip worst | 3.67 / 3.92 / 3.87, < 4 | **4.34 / 4.61 / 4.61, < 5** | the B2 swing now starts from the hey's real end and its spiral into the 40 px shift is sharper; the loosening is at that one seam (beat 64k − 0.06) |
 * | drift | 132 at 3 sets, shift and swing | **72 / 141 / 234**: shift 42 / 57 / 66, swing 10 / 45 / 106, chain 20 / 39 / 62 | the chain's is the language's seating (below) |
 *
 * The 372 at three sets by share: **the shift's own 66** (`shift walks 160
 * cm`), **the circle after it 164 + 18 + 9** (`StepTooLong`, `TimingViolation`,
 * `RateTooHigh`), the balance 29 + 16, the swing 12, and **the chain's and
 * the hey's `PivotTooLarge`, 16 + 42** — turns at the ninety-degree stepping
 * cap that go a few degrees over when the couple is not square to the set.
 * Subtracting the shift's own and the circle's leaves 115.
 *
 * **M3 re-pinned three of these**, for three scheduler changes Robins on a
 * Wire needed, each of which is a correction Butter also gets:
 *
 * 1. **A swing's post reads the left-hand dancer's home.** M2's read each
 *    dancer's own, and a neighbour swing — whose two homes face opposite
 *    ways — put the robin on the lark's **left**. Now she is on his right,
 *    on his partner's seat, so Butter's chain to partner is the diagonal
 *    crossing through the centre a chain is, and ends her on her own seat:
 *    **the chain's drift is 0** (it was 20 / 39 / 62 and blamed on the
 *    language's seating; the seating was right). The clearance count fell
 *    with it, 765 → 177 at three sets.
 * 2. **A swing with nothing of its own cast to spiral into ends on its own
 *    post** (`exit: "post"`): the A1 swing lands in the line facing home and
 *    long lines walks from there. The landing is a stop the walk sets off
 *    from — hip vjump ×6.05 at that seam (beat 16k − 0.06), was ×4.61.
 * 3. **The entry planner budgets the pivot** as it does the step: a turn the
 *    cruise ramp would load on to one step gets another beat. The hey ends
 *    the larks facing out, so the balance's entry is two beats now and its
 *    body one short (`TimingViolation`, 6 at three sets) where before the
 *    one-beat entry turned over the cap.
 *
 * | pin | M2 | **M3** |
 * |---|---|---|
 * | schedule errors | 139 / 259 / 372, ≤ 380 | **162 / 300 / 438, ≤ 450** |
 * | hip worst | 4.34 / 4.61 / 4.61, < 5 | **6.05, < 6.5** (the swing's landing, above) |
 * | drift | 72 / 141 / 234 | **62 / 100 / 138**: shift 48 / 72 / 96, swing 14 / 28 / 42, chain **0** |
 * | clearance | ≤ 800 (230 / 453 / 765) | **≤ 200 (87 / 132 / 177)** |
 *
 * The 438 at three sets by share: the shift's own 96, the circle after it
 * 144 + 3 + 18, the swing 36, the balance's pivots and timing 42 + 60, the
 * chain's pivots 42.
 *
 * `CAPS` has not moved and must not.
 */
const MAX_SCHEDULE_ERRORS = 450;
const MAX_HIP_RATIO = 6.5;
const KINDS = ["StepTooLong", "PivotTooLarge", "TimingViolation", "RateTooHigh"];
/** Clearance stretches at 1 / 2 / 3 sets: 87 / 132 / 177 (M2: 230 / 453 / 765), all on the shift's floor (below). */
const MAX_CLEARANCE = 200;

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

      // Every move Butter says has a figure (M2: the chain and the hey).
      expect(result.errors.filter((e) => e.kind === "NoFigure")).toEqual([]);
      expect(result.errors.filter((e) => e.stage === "compile")).toEqual([]);

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

      // The chain to partner ends every robin on her own seat: after the
      // neighbour swing she stands on the neighbour lark's right, on his
      // partner's seat, and the chain crosses her back. M2 saw 20 / 39 / 62
      // drifts here and read them as the language never reseating after a
      // chain; the swing's post had her on the wrong side. Zero, since M3.
      const chainDrift = result.warnings.filter(
        (w) => w.kind === "Drift" && w.message.startsWith("chain"),
      );
      expect(chainDrift).toEqual([]);

      // Two bodies through one point (K304): measured 87 / 132 / 177 (M2:
      // 230 / 453 / 765), and the closest of them is 0.00 px — the couple
      // the shift could not move out of the top set standing on the couple
      // coming in. The shift's floor again; the figures alone keep everybody
      // clear.
      const clearance = result.clearance ?? [];
      expect(clearance.length).toBeLessThanOrEqual(MAX_CLEARANCE);
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
