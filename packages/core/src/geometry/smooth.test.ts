import { describe, expect, it } from "vitest";
import { clamp01, mix, ramp, smooth } from "./smooth.js";

describe("smooth", () => {
  it("is smoothstep, clamped", () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(1)).toBe(1);
    expect(smooth(-3)).toBe(0);
    expect(smooth(7)).toBe(1);
    expect(smooth(0.25)).toBeCloseTo(0.15625, 12);
  });

  it("is monotone on [0,1]", () => {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      const v = smooth(k);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("has zero slope at both ends", () => {
    const e = 1e-6;
    expect((smooth(e) - smooth(0)) / e).toBeCloseTo(0, 5);
    expect((smooth(1) - smooth(1 - e)) / e).toBeCloseTo(0, 5);
  });
});

describe("clamp01 / mix / ramp", () => {
  it("clamps", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(2)).toBe(1);
  });

  it("mixes", () => {
    expect(mix(2, 6, 0.25)).toBe(3);
    expect(mix(2, 6, 0)).toBe(2);
    expect(mix(2, 6, 1)).toBe(6);
  });

  it("ramps over a window", () => {
    expect(ramp(0, 2, 3)).toBe(0);
    expect(ramp(2, 2, 3)).toBe(0);
    expect(ramp(2.5, 2, 3)).toBe(0.5);
    expect(ramp(3, 2, 3)).toBe(1);
    expect(ramp(99, 2, 3)).toBe(1);
  });

  it("makes a window of no length a step, never NaN", () => {
    // F3a's finding: `balance` asks for a zero-length release and this was
    // `smooth(0 / 0)`, so both of its hands were NaN at its last beat and both
    // arms were drawn as nothing for the 0.4 beats after every balance.
    for (const t of [-1, 0, 3, 3.9999]) expect(ramp(t, 4, 4)).toBe(0);
    expect(ramp(4, 4, 4)).toBe(0);
    expect(ramp(4.0001, 4, 4)).toBe(1);
    expect(ramp(99, 4, 4)).toBe(1);
    for (const t of [0, 2, 4, 8]) expect(Number.isNaN(ramp(t, 4, 4))).toBe(false);
  });
});
