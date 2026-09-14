import { describe, expect, it } from "vitest";
import { DEFAULT_BPM, createClock } from "./Clock.js";

/** A time source the test moves by hand. */
function fakeNow(start = 0) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v), advance: (d: number) => (t += d) };
}

describe("createClock", () => {
  it("starts at beat 0 at the current time", () => {
    const c = fakeNow(100);
    const clock = createClock(c.now);
    expect(clock.beat()).toBe(0);
    expect(clock.tempo()).toBe(DEFAULT_BPM);
  });

  it("after rebase(now=10, beat=64, bpm=120), beat() at now=11 is 66", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(10, 64, 120);
    c.set(11);
    expect(clock.beat()).toBe(66);
  });

  it("is linear in now() between rebases", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(10, 64, 120);
    for (const [t, beat] of [
      [10, 64],
      [10.5, 65],
      [12, 68],
      [9, 62],
      [40, 124],
    ] as const) {
      c.set(t);
      expect(clock.beat()).toBeCloseTo(beat, 12);
    }
  });

  it("pause freezes the beat", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(0, 0, 120);
    c.set(3);
    clock.pause();
    expect(clock.isPaused()).toBe(true);
    expect(clock.beat()).toBe(6);
    c.set(60);
    expect(clock.beat()).toBe(6);
  });

  it("resume continues without a jump", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(0, 0, 120);
    c.set(3);
    clock.pause();
    c.set(60);
    clock.resume();
    expect(clock.beat()).toBe(6);
    c.advance(2);
    expect(clock.beat()).toBe(10);
  });

  it("pause and resume are idempotent", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(0, 0, 120);
    clock.resume();
    c.set(1);
    expect(clock.beat()).toBe(2);
    clock.pause();
    clock.pause();
    c.set(50);
    expect(clock.beat()).toBe(2);
    clock.resume();
    clock.resume();
    c.advance(1);
    expect(clock.beat()).toBe(4);
  });

  it("setTempo keeps the current beat", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(0, 0, 120);
    c.set(4);
    expect(clock.beat()).toBe(8);
    clock.setTempo(60);
    expect(clock.beat()).toBe(8);
    expect(clock.tempo()).toBe(60);
    c.advance(4);
    expect(clock.beat()).toBe(12);
  });

  it("setTempo while paused keeps the frozen beat", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(0, 0, 120);
    c.set(4);
    clock.pause();
    clock.setTempo(240);
    expect(clock.beat()).toBe(8);
    c.set(100);
    expect(clock.beat()).toBe(8);
    clock.resume();
    c.advance(1);
    expect(clock.beat()).toBe(12);
  });

  it("setBeat jumps without changing tempo", () => {
    const c = fakeNow(0);
    const clock = createClock(c.now);
    clock.rebase(0, 0, 120);
    c.set(4);
    clock.setBeat(0);
    expect(clock.beat()).toBe(0);
    c.advance(1);
    expect(clock.beat()).toBe(2);
  });

  it("rebasing onto a different time source is seamless", () => {
    // What happens when audio starts: the same clock, rebased onto
    // AudioContext.currentTime at the beat it is already showing.
    const wall = fakeNow(1000);
    let audioTime = 0;
    let usingAudio = false;
    const clock = createClock(() => (usingAudio ? audioTime : wall.now()));
    clock.rebase(wall.now(), 0, 120);
    wall.advance(2);
    const handover = clock.beat();
    expect(handover).toBe(4);
    usingAudio = true;
    audioTime = 0.25;
    clock.rebase(audioTime, handover, 120);
    expect(clock.beat()).toBe(4);
    audioTime = 1.25;
    expect(clock.beat()).toBe(6);
  });
});
