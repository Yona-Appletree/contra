import { describe, expect, it } from "vitest";
import { createClock } from "./Clock.js";

/** A fake `now` the test controls directly. */
function fakeNow(start = 0) {
  let t = start;
  return {
    now: () => t,
    set(v: number) {
      t = v;
    },
  };
}

describe("createClock", () => {
  it("is linear in now() between rebases: bpm/60 beats per second", () => {
    const clk = fakeNow(0);
    const clock = createClock(clk.now);
    clock.rebase(10, 64, 120);
    clk.set(11);
    expect(clock.beat()).toBeCloseTo(66, 10);
    clk.set(13);
    expect(clock.beat()).toBeCloseTo(70, 10);
  });

  it("advances exactly bpm/60 per second of now(), for varied bpm", () => {
    const clk = fakeNow(0);
    const clock = createClock(clk.now);
    clock.rebase(0, 0, 150);
    for (const dt of [0.1, 0.37, 1, 2.5]) {
      clk.set(dt);
      expect(clock.beat()).toBeCloseTo((dt * 150) / 60, 10);
    }
  });

  it("a loop-boundary rebase produces no jump", () => {
    const clk = fakeNow(0);
    const clock = createClock(clk.now);
    const bpm = 128;
    clock.rebase(0, 0, bpm);
    // Advance to exactly the 64-beat loop boundary.
    const secondsPerCycle = (64 * 60) / bpm;
    clk.set(secondsPerCycle);
    const beatAtBoundary = clock.beat();
    expect(beatAtBoundary).toBeCloseTo(64, 6);
    // Rebase at that same instant, restarting the cycle count at the same beat.
    clock.rebase(secondsPerCycle, 64, bpm);
    expect(clock.beat()).toBeCloseTo(beatAtBoundary, 10);
    // And it keeps advancing linearly afterward, no jump.
    clk.set(secondsPerCycle + 0.5);
    expect(clock.beat()).toBeCloseTo(64 + 0.5 * (bpm / 60), 10);
  });

  it("pause freezes the beat", () => {
    const clk = fakeNow(0);
    const clock = createClock(clk.now);
    clock.rebase(0, 10, 120);
    clk.set(1);
    expect(clock.beat()).toBeCloseTo(12, 10);
    clock.pause();
    clk.set(5);
    expect(clock.beat()).toBeCloseTo(12, 10);
    clk.set(9);
    expect(clock.beat()).toBeCloseTo(12, 10);
  });

  it("resume continues without a jump", () => {
    const clk = fakeNow(0);
    const clock = createClock(clk.now);
    clock.rebase(0, 10, 120);
    clk.set(1);
    clock.pause();
    const frozen = clock.beat();
    clk.set(100); // time passes a lot while paused
    clock.resume();
    expect(clock.beat()).toBeCloseTo(frozen, 10);
    clk.set(101);
    expect(clock.beat()).toBeCloseTo(frozen + 2, 10);
  });

  it("setTempo keeps the current beat, no jump", () => {
    const clk = fakeNow(0);
    const clock = createClock(clk.now);
    clock.rebase(0, 0, 120);
    clk.set(2);
    const before = clock.beat();
    expect(before).toBeCloseTo(4, 10);
    clock.setTempo(180);
    expect(clock.beat()).toBeCloseTo(before, 10);
    clk.set(3);
    expect(clock.beat()).toBeCloseTo(before + 1 * (180 / 60), 10);
  });
});
