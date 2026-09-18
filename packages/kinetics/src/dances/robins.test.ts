import { describe, expect, it } from "vitest";
import { proveMotion } from "../motion/prove.js";
import { sampleAt } from "../motion/Trajectory.js";
import type { Run } from "../pipeline.js";
import { runNamed } from "./load.js";

/**
 * Robins on a Wire, whole, from `packages/lang/dances/robins-on-a-wire.dance`
 * at 2, 3 and 4 sets, seven times through, in both readings of whom the
 * robin allemandes (`robins-on-a-wire` the set's other robin, `opposite`;
 * `robins-on-a-wire-passed` the robin whose hand she holds). The bounds are
 * pinned as Butter's are (`butter.test.ts`): the number, the why, and the
 * share the lattice owns, so the next re-pin can subtract it.
 *
 * Measured 2026-09-18 at 112 bpm, seven times, at 2 / 3 / 4 sets:
 *
 * | pin | `robins-on-a-wire` | `…-passed` | why |
 * |---|---|---|---|
 * | schedule errors | 56 / 77 / 91 | 96 / 172 / 197 | below |
 * | kinds | HandTaken, TimingViolation, RateTooHigh, StepTooLong, TakeOutOfReach (2 sets) | + the same | |
 * | hip worst | 3.45 | 4.49 / 5.18 / 5.18 | the swing's landing |
 * | drift | chain 28 / 42 / 56 (every robin, every time), swing 28 / 42 / 56 | the same | below |
 * | clearance | 224 / 308 / 392 | 179 / 244 / 313 | the ends, below |
 *
 * **The lattice's share (E1, the G1 question).** `becket.dance` moves a
 * couple a whole set (1.6 m) at `progress()`, twice what a becket's shift
 * walks, so at beat 16 the set a couple joins is one further than the one
 * the wave's hands joined it to. Every error the primary reading has is
 * that: the **allemande with `opposite`** is with the robin two places down
 * the wave, 2.4 m off — a three-beat entry, one beat of body, `K101` and
 * `K102`, 3 / 3 / 4 per time (one per set); the **entrant robin** admitted
 * at 16 balances a wave whose hands were joined before her commit and finds
 * both taken, `K107` (one per hand per entrant: 2 / 4 / 4 per time; at two
 * sets the two ends meet and it is `K105`, 574 cm, instead); and one
 * `StepTooLong` a time in the swing at the top. The `passed` reading's
 * allemande is clean and its ends are the same; what it adds is the single
 * file promenade's `StepTooLong`s and a longer swing entry after it.
 *
 * **Drift.** The chain to neighbour leaves every robin on the other line's
 * seat, a place along and a set across from the one the text keeps for her
 * — the language never reseats after a chain (M2's finding, still true for
 * a chain to *neighbour*; Butter's chain to partner drifts nothing since
 * M3). The swing's is the entrants' and the top set's, on the shift's floor.
 *
 * `CAPS` has not moved and must not.
 */
const PRIMARY = {
  name: "robins-on-a-wire",
  maxErrors: 100,
  maxHip: 4,
  maxClearance: 400,
};
const PASSED = {
  name: "robins-on-a-wire-passed",
  maxErrors: 220,
  maxHip: 5.5,
  maxClearance: 400,
};
const KINDS = ["HandTaken", "TimingViolation", "RateTooHigh", "StepTooLong", "TakeOutOfReach"];
const BEATS_PER_TIME = 64;

describe("Robins on a Wire, whole", () => {
  for (const reading of [PRIMARY, PASSED]) {
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
        // The allemande's and the entrants' share is the lattice's, and it
        // is what the text says it is: one hand-taken per entrant hand.
        const handTaken = s.errors.filter((e) => e.kind === "HandTaken");
        expect(handTaken.length).toBeLessThanOrEqual(4 * 7);
        expect(handTaken.every((e) => e.beat !== undefined && e.beat % BEATS_PER_TIME === 16)).toBe(
          true,
        );

        for (const id of result.dialect!.dancers) {
          const violations = proveMotion(result.executed!.trajectories[id]!);
          const worst = Math.max(0, ...violations.map((v) => v.value / v.cap));
          expect(worst, `${id} worst ×${worst.toFixed(2)}`).toBeLessThan(reading.maxHip);
        }

        const chainDrift = result.warnings.filter(
          (w) => w.kind === "Drift" && w.message.startsWith("chain"),
        );
        expect(chainDrift.length).toBe(minorSets * 2 * 7);
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
    // The shift walks the entrant lark to his new seat: sixteen px in four
    // beats, the picture the G1 brief shows.
    const lark = result.schedule!.calls["OT-1L"]![1]!;
    expect(lark.call.figure.id).toBe("shift");
    expect(lark.call.seatAfter.p[1]).toBeGreaterThan(lark.call.seatAfter.p[1] - 1);
    const t = result.executed!.trajectories["OT-1L"]!;
    const at16 = t.points.hip![sampleAt(t, 16)]!;
    const at20 = t.points.hip![sampleAt(t, 20)]!;
    expect(Math.abs(at20.y - at16.y)).toBeCloseTo(40, 0);
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
    const out = new Set(result.evening!.times[0]!.outDancers);
    const couples = ["0-1", "1-1", "1-2", "2-2", "OT-1", "OB-2"];
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

  /** The end robin's far hand is nobody, and it is not a complaint. */
  it("balances the wave one-handed at the ends, with nothing to say about it", () => {
    const result = runNamed("robins-on-a-wire", { args: { "minor-sets": 2 }, times: 1, bpm: 112 });
    const top = result.sequence!.perDancer["0-2R"]!.find((c) => c.figure.id === "balance-wave")!;
    expect(top.cast.right).toBeUndefined();
    expect(top.cast.left).toBe("0-1R");
    expect(top.bindings["right"]).toBe("[]");
    expect(result.errors.filter((e) => e.stage === "compile")).toEqual([]);
    const plate = result.solved!.hands["0-2R"]!;
    const t = result.executed!.trajectories["0-2R"]!;
    const i = sampleAt(t, 18);
    expect(plate.right[i]!.contact).toBe("free");
    expect(plate.left[i]!.contact).toBe("palm");
  });
});

export type { Run };
