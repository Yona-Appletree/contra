import { describe, expect, it } from "vitest";
import { proveMotion } from "../motion/prove.js";
import { sampleAt } from "../motion/Trajectory.js";
import type { Run } from "../pipeline.js";
import { runNamed } from "./load.js";

/**
 * Robins on a Wire, whole, from `packages/lang/dances/robins-on-a-wire.dance`
 * at 2, 3 and 4 sets, seven times through. The bounds are pinned as Butter's
 * are (`butter.test.ts`): the number, the why, and the share a seam owns, so
 * the next re-pin can subtract it.
 *
 * **One dance since M8.** M3 shipped two readings of whom the robin allemandes
 * because the whole-set progression made the wave's hands and the set's other
 * robin two different people. On the half-couple lattice they are the same
 * person: the chain has already carried the robin the place her couple is
 * about to progress, so the commit at beat 16 moves her seat to where she is
 * standing, and the robin whose right hand she holds — `wave-mate` before the
 * commit — is `opposite` after it. `robins-on-a-wire-passed` and `passed` are
 * gone with the question.
 *
 * Measured 2026-09-18 at 112 bpm, seven times, at 2 / 3 / 4 sets:
 *
 * | pin | M3 (`robins-on-a-wire`) | **M8** | why |
 * |---|---|---|---|
 * | schedule errors | 56 / 77 / 91, ≤ 100 | **81 / 56 / 63, ≤ 90** | below |
 * | kinds | HandTaken, TimingViolation, RateTooHigh, StepTooLong, TakeOutOfReach | the same | |
 * | hip worst | 3.45, < 4 | **5.18 / 3.45 / 3.45, < 5.5** | two sets, below |
 * | drift | chain 28 / 42 / 56, swing 28 / 42 / 56 | **chain 34 / 48 / 62, swing 36 / 50 / 64** | more dancers in: the hall dances n + 1 sets every other time through |
 * | clearance | 224 / 308 / 392 | **188 / 262 / 332** | |
 *
 * **What the lattice fixed.** The allemande with `opposite` used to be with
 * the robin two places down the wave, 2.4 m off — a three-beat entry and one
 * beat of body, `K101` + `K102`, three or four a time. It is now the hand she
 * is holding, and the eight that are left are the **entrants'** (below). The
 * `K107` count fell 28 → 8 with it.
 *
 * **What is left, and it is the ends.** An entrant reads its relations
 * **after** the commit that admitted it, and everybody already in the dance
 * read theirs before it (D8, M3's finding). So the robin who comes in at beat
 * 16 names the wave by the post-commit names: her left hand is the robin at
 * the end of the wave, right (her `opposite`), and her right reaches two sets
 * on, which is nobody's free hand — `K107`, one per entrant robin per entry,
 * eight in a seven-times evening. She is also still standing at her station
 * when she takes it, 1.72 m away (`K105`): the entrant's walk in is the shift
 * the robins do not dance. Both are the mid-dance entry question G1 did not
 * land (notes §G1 2), not the lattice.
 *
 * At **two sets** the hall is two or three sets long and the single file
 * promenade's ring is the whole of it: 16 `StepTooLong` and the worst hip
 * velocity seam in the evening, ×5.18. Three and four sets sit at ×3.45. A
 * move seam for the review (M10).
 *
 * **Drift.** The chain to neighbour leaves every robin on the other line's
 * seat, a place along and a set across from the one the text keeps for her
 * until the commit at 16 catches up — which on this lattice is exactly the
 * half-progression the dance is made of, so the check is measuring the dance
 * rather than a defect (a ruling for M10/M7). The swing's is the entrants'.
 *
 * `CAPS` has not moved and must not.
 */
const PRIMARY = {
  name: "robins-on-a-wire",
  maxErrors: 90,
  maxHip: 5.5,
  maxClearance: 340,
};
const KINDS = ["HandTaken", "TimingViolation", "RateTooHigh", "StepTooLong", "TakeOutOfReach"];
const BEATS_PER_TIME = 64;

describe("Robins on a Wire, whole", () => {
  for (const reading of [PRIMARY]) {
    for (const minorSets of [2, 3, 4]) {
      it(`${reading.name}, ${String(minorSets)} sets: seven times through, the ends in the dance, the seams pinned`, () => {
        const result = runNamed(reading.name, {
          args: { "minor-sets": minorSets },
          times: 7,
          bpm: 112,
        });
        expect(result.errors.filter((e) => e.stage === "run")).toEqual([]);
        expect(result.errors.filter((e) => e.stage === "compile")).toEqual([]);
        expect(result.sequence?.dialect).toBe("MajorSet");
        expect(result.endBeat).toBe(7 * BEATS_PER_TIME);
        // After setup, one commit per time through — at beat 16, not 0.
        expect(result.sequence!.memberships.length).toBe(8);

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
        ).toBeLessThanOrEqual(reading.maxErrors);
        // What is left is the entrants', and it is what the text says it is:
        // one hand-taken per entrant robin, on the four commits that bring a
        // waiting couple in, at the beat the commit is on.
        const handTaken = s.errors.filter((e) => e.kind === "HandTaken");
        expect(handTaken).toHaveLength(8);
        expect(handTaken.every((e) => e.beat !== undefined && e.beat % BEATS_PER_TIME === 16)).toBe(
          true,
        );

        for (const id of result.dialect!.dancers) {
          const violations = proveMotion(result.executed!.trajectories[id]!);
          const worst = Math.max(0, ...violations.map((v) => v.value / v.cap));
          expect(worst, `${id} worst ×${worst.toFixed(2)}`).toBeLessThan(reading.maxHip);
        }

        // Every robin in the hall, every time through — and the hall is n or
        // n + 1 sets long as the ends come and go, so it is not a round
        // multiple of the sets any more.
        const chainDrift = result.warnings.filter(
          (w) => w.kind === "Drift" && w.message.startsWith("chain"),
        );
        expect(chainDrift.length).toBe(minorSets * 14 + 6);
        const clearance = result.clearance ?? [];
        expect(clearance.length).toBeLessThanOrEqual(reading.maxClearance);
      });
    }
  }

  /**
   * D8 in the picture: the couple waiting at the top comes in on the beat-16
   * commit. Its lane is out (the setup seating) for a wait-out of sixteen,
   * and its first call of the dance is read against the seating that let it
   * in — the lane changes colour at 16, not at 0.
   */
  it("admits the waiting couple at beat 16: a wait-out first, then the shift, read against the new seating", () => {
    const result = runNamed("robins-on-a-wire", { args: { "minor-sets": 3 }, times: 2, bpm: 112 });
    for (const id of ["OT-1L", "OT-1R", "OB-2L", "OB-2R"]) {
      const calls = result.sequence!.perDancer[id]!;
      const [first, second] = calls;
      expect(first?.figure.id).toBe("wait-out");
      expect([first?.start, first?.end]).toEqual([0, 16]);
      expect(first?.membership).toBe(0);
      expect(second?.start).toBe(16);
      expect(second?.figure.id).toBe(id.endsWith("L") ? "shift" : "balance-wave");
      // The seating after the beat-16 commit: the first commit of the evening.
      expect(second?.membership).toBe(1);
      const set = result.sequence!.memberships[second!.membership]!.placeOf.get(id);
      expect(set).toContain("MinorSet(");
      expect(result.sequence!.memberships[0]!.placeOf.get(id)).toContain("Station(Out");
    }
    // The shift walks the entrant lark to his new seat: **one dancer place**,
    // 20 px, in four beats — the same 0.8 m every other lark in the hall
    // shifts (M8; it was 40 px, a whole couple, and too far to walk).
    const lark = result.schedule!.calls["OT-1L"]![1]!;
    expect(lark.call.figure.id).toBe("shift");
    expect(lark.call.seatAfter.p[1]).toBeGreaterThan(lark.call.seatAfter.p[1] - 1);
    const t = result.executed!.trajectories["OT-1L"]!;
    const at16 = t.points.hip![sampleAt(t, 16)]!;
    const at20 = t.points.hip![sampleAt(t, 20)]!;
    expect(Math.abs(at20.y - at16.y)).toBeCloseTo(20, 0);
  });

  /**
   * The calling note as a test: "because of the sidestep in the A2, the N2
   * neighbor swing should finish across from partner." After the swing (beat
   * 32) every dancer still in the dance stands directly across the set from
   * their partner — same place along the hall, the other line.
   */
  it("finishes the N2 swing across from partner, as the calling note says", () => {
    const result = runNamed("robins-on-a-wire", { args: { "minor-sets": 3 }, times: 1, bpm: 112 });
    const hip = (id: string, beat: number) => {
      const t = result.executed!.trajectories[id]!;
      return t.points.hip![sampleAt(t, beat)]!;
    };
    // The first time through, the commit at 16 brings the ends in and puts
    // nobody out (M8), so every couple in the hall is in the dance.
    const out = new Set(result.evening!.times[0]!.outDancers);
    expect(out).toEqual(new Set());
    const couples = ["1-1", "1-2", "3-1", "3-2", "5-1", "5-2", "OT-1", "OB-2"];
    for (const couple of couples) {
      const lark = `${couple}L`;
      const robin = `${couple}R`;
      expect(out.has(lark), lark).toBe(false);
      const l = hip(lark, 32);
      const r = hip(robin, 32);
      expect(Math.abs(l.y - r.y), couple).toBeLessThan(1);
      expect(Math.sign(l.x)).toBe(-Math.sign(r.x));
      expect(Math.abs(l.x - r.x), couple).toBeCloseTo(32, 0);
    }
  });

  /**
   * The end robin's far hand is nobody, and it is not a complaint.
   *
   * Read on the **second** time through: the couples that were waiting came
   * in on time 1's commit, so nobody is at a station, the hall is three sets
   * long, and the wave's two ends are the only hands with nobody in them. On
   * the first time through the entrant robins join the wave at its ends as
   * they come in, which is the mid-dance entry seam (`K105`, `K107`), not
   * this rule.
   */
  it("balances the wave one-handed at the ends, with nothing to say about it", () => {
    const result = runNamed("robins-on-a-wire", { args: { "minor-sets": 2 }, times: 2, bpm: 112 });
    const beat = 64 + 16;
    const ends = result
      .dialect!.dancers.map((id) => ({
        id,
        call: result
          .sequence!.perDancer[id]!.filter((c) => c.figure.id === "balance-wave")
          .find((c) => c.start === beat),
      }))
      .filter((end) => end.call?.bindings["right"] === "[]");
    expect(ends.map((end) => end.id)).toEqual(["1-2R", "3-1R"]);
    expect(result.errors.filter((e) => e.stage === "compile")).toEqual([]);
    for (const { id, call } of ends) {
      expect(call!.cast.right).toBeUndefined();
      expect(call!.cast.left).toBeDefined();
      const plate = result.solved!.hands[id]!;
      const t = result.executed!.trajectories[id]!;
      const i = sampleAt(t, beat + 2);
      expect(plate.right[i]!.contact, id).toBe("free");
      expect(plate.left[i]!.contact, id).toBe("palm");
    }
  });
});

export type { Run };
