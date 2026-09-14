import { dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { armShortfall } from "./armShortfall.js";
import { poseGap } from "./poseGap.js";
import type { PairRole } from "./PairFrame.js";
import { PAIR_ROLES } from "./PairFrame.js";
import { DEMO_PAIR_SEQUENCE } from "./PairSequence.js";

const sequence = DEMO_PAIR_SEQUENCE;

describe("DEMO_PAIR_SEQUENCE", () => {
  it("is the spike's 64 beats in the spike's order", () => {
    expect(sequence.beats).toBe(64);
    expect(sequence.calls.map((c) => c.id)).toEqual([
      "walk-in",
      "balance",
      "swing",
      "allemande",
      "do-si-do",
      "balance",
      "swing",
      "allemande",
      "fall-back",
    ]);
    expect(sequence.starts).toEqual([0, 4, 8, 16, 24, 32, 36, 48, 56]);
  });

  it("finds the figure running at a beat, wrapping round the loop", () => {
    expect(sequence.indexAt(0)).toBe(0);
    expect(sequence.indexAt(12)).toBe(2);
    expect(sequence.indexAt(63.9)).toBe(8);
    expect(sequence.indexAt(64)).toBe(0);
    expect(sequence.indexAt(-1)).toBe(8);
  });

  it("closes: every figure's end pose is the next figure's start pose", () => {
    for (let i = 0; i < sequence.calls.length; i++) {
      const here = sequence.calls[i];
      const next = sequence.calls[(i + 1) % sequence.calls.length];
      if (here === undefined || next === undefined) throw new Error("unreachable");
      for (const role of PAIR_ROLES) {
        const gap = poseGap(here.sample(role, here.beats), next.sample(role, 0));
        expect(gap.worst, `${here.id} -> ${next.id}, ${role}: ${JSON.stringify(gap)}`).toBeLessThan(
          0.01,
        );
      }
    }
  });

  it("closes the loop: beat 64 is beat 0", () => {
    for (const role of PAIR_ROLES) {
      expect(poseGap(sequence.poseAt(0, role), sequence.poseAt(64, role)).worst).toBeLessThan(0.01);
    }
  });

  it("never puts a hand out of reach, at any eighth of a beat (AC1)", () => {
    for (let n = 0; n < 64 * 8; n++) {
      const beat = n / 8;
      const sample = sequence.sampleAt(beat);
      for (const role of PAIR_ROLES) {
        const dancer = sample[role];
        const check = armShortfall(dancer.pose, beat, dancer.velocity);
        expect(check.L, `beat ${beat}, ${role} left`).toBe(0);
        expect(check.R, `beat ${beat}, ${role} right`).toBe(0);
      }
    }
  });

  it("joined hands are one floor point, drop and all", () => {
    // The pairs that ever join are the lark's left with the robin's right, and
    // the lark's right with the robin's left.
    const pairs: Array<[PairRole, "L" | "R", PairRole, "L" | "R"]> = [
      ["lark", "L", "robin", "R"],
      ["lark", "R", "robin", "L"],
    ];
    // The beats in which a take or a release has the two hands in flight.
    const takeOrRelease: Array<[number, number]> = [
      [2, 3.2], // the walk-in's take
      [14.6, 16.4], // the first swing opening out and the allemande letting go
      [32, 32.9], // the second balance taking hands
      [46.6, 48.4], // the second swing opening out and the allemande letting go
      [55, 57], // the last allemande's release into the fall back
    ];
    let joinedSamples = 0;
    for (let n = 0; n < 64 * 8; n++) {
      const beat = n / 8;
      const sample = sequence.sampleAt(beat);
      for (const [roleA, sideA, roleB, sideB] of pairs) {
        const a = sample[roleA].pose.hands[sideA];
        const b = sample[roleB].pose.hands[sideB];
        if (a === "down" || b === "down") continue;
        const gap = dist(a.p, b.p);
        if (gap > 0.1) continue;
        joinedSamples++;
        // Within the renderer's JOIN_EPSILON_PX the two hands are the same
        // hand, so they must agree on their height as well as their point.
        // The only samples inside that band that are not a hold are the frames
        // in which a take or a release crosses it.
        const taking = takeOrRelease.some(([from, to]) => beat > from && beat < to);
        if (taking) continue;
        expect(gap, `beat ${beat}`).toBe(0);
        expect(a.drop, `beat ${beat}`).toBe(b.drop);
      }
    }
    // Sanity: they are joined for a good part of the dance, not never.
    expect(joinedSamples).toBeGreaterThan(200);
  });

  it("hands one dancer at a time and the other stays put", () => {
    const a = sequence.sampleAt(6);
    const b = sequence.sampleAt(6);
    expect(a.lark.pose).toEqual(b.lark.pose);
    expect(a.call.id).toBe("balance");
  });

  it("gives the renderer a floor velocity in px per beat", () => {
    const walking = sequence.sampleAt(1);
    const speed = Math.hypot(walking.lark.velocity[0], walking.lark.velocity[1]);
    expect(speed).toBeGreaterThan(1);
    expect(speed).toBeLessThan(20);
  });
});
