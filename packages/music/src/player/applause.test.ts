import { describe, expect, it } from "vitest";
import { APPLAUSE_DEFAULTS, renderApplause } from "./applause.js";

/**
 * The applause, measured rather than heard.
 *
 * Nothing here can tell you it sounds like a hall clapping — no test can, and
 * this worktree has no speakers — but it can say that it is the right length,
 * that it never clips, that it swells and dies away, that it is made of many
 * short bursts rather than one long noise, and that two renders of the same
 * seed are the same buffer.
 */

const RATE = 48000;

/** The loudest sample in `[from, to)` seconds. */
const peakOver = (buffer: Float32Array, from: number, to: number): number => {
  let loudest = 0;
  for (let i = Math.round(from * RATE); i < Math.min(buffer.length, Math.round(to * RATE)); i++) {
    loudest = Math.max(loudest, Math.abs(buffer[i]!));
  }
  return loudest;
};

/** Root mean square over `[from, to)` seconds: how loud it is on average. */
const rmsOver = (buffer: Float32Array, from: number, to: number): number => {
  const a = Math.round(from * RATE);
  const b = Math.min(buffer.length, Math.round(to * RATE));
  let sum = 0;
  for (let i = a; i < b; i++) sum += buffer[i]! * buffer[i]!;
  return Math.sqrt(sum / Math.max(1, b - a));
};

describe("the applause is the right shape", () => {
  const applause = renderApplause(RATE);

  it("lasts the seconds it says it does", () => {
    expect(applause.length).toBe(Math.round(RATE * APPLAUSE_DEFAULTS.seconds));
    // Two or three seconds, as the brief asks for.
    expect(APPLAUSE_DEFAULTS.seconds).toBeGreaterThanOrEqual(2);
    expect(APPLAUSE_DEFAULTS.seconds).toBeLessThanOrEqual(3.5);
  });

  it("never clips: the loudest sample is exactly the peak asked for", () => {
    expect(peakOver(applause, 0, APPLAUSE_DEFAULTS.seconds)).toBeCloseTo(APPLAUSE_DEFAULTS.peak, 5);
    for (const s of applause) expect(Math.abs(s)).toBeLessThanOrEqual(1);
  });

  it("swells in and dies away rather than starting and stopping flat", () => {
    const start = rmsOver(applause, 0, 0.05);
    const middle = rmsOver(applause, 1, 1.5);
    const end = rmsOver(applause, APPLAUSE_DEFAULTS.seconds - 0.05, APPLAUSE_DEFAULTS.seconds);
    expect(start).toBeLessThan(middle);
    expect(end).toBeLessThan(middle);
  });

  it("is a dozen-odd people clapping, not one long hiss", () => {
    // A clap is a burst that decays in a few hundredths of a second, so the
    // loudest sample of a 50 ms window should be several times its average.
    // A steady noise would have a crest factor near 3; this is much peakier.
    const crest = peakOver(applause, 1, 1.05) / rmsOver(applause, 1, 1.05);
    expect(crest).toBeGreaterThan(4);
  });

  it("has claps all the way through, not only at the start", () => {
    for (let t = 0.3; t < APPLAUSE_DEFAULTS.seconds - 1.2; t += 0.25) {
      expect(rmsOver(applause, t, t + 0.25), `at ${t.toFixed(2)} s`).toBeGreaterThan(0.005);
    }
  });
});

describe("the applause is reproducible", () => {
  it("renders the same buffer from the same seed", () => {
    expect([...renderApplause(8000)]).toEqual([...renderApplause(8000)]);
  });

  it("renders a different one from another seed", () => {
    const a = renderApplause(8000);
    const b = renderApplause(8000, { seed: 7 });
    expect([...a]).not.toEqual([...b]);
    expect(a.length).toBe(b.length);
  });

  it("works at any sample rate a browser might hand it", () => {
    for (const rate of [8000, 22050, 44100, 48000]) {
      const buffer = renderApplause(rate, { seconds: 0.5 });
      expect(buffer.length).toBe(Math.round(rate * 0.5));
      expect(buffer.some((s) => s !== 0)).toBe(true);
    }
  });

  it("does not fall over when asked for nothing", () => {
    expect(renderApplause(RATE, { seconds: 0 }).length).toBe(1);
    expect(renderApplause(RATE, { clappers: 0, seconds: 0.1 }).every((s) => s === 0)).toBe(true);
  });
});
