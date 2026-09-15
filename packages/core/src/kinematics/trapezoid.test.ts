import { describe, expect, it } from "vitest";
import { trapezoid, trapezoidSpeed } from "./trapezoid.js";

// The profile a figure that takes a beat to get going, cruises, and is still
// again a little before its last beat walks on.
const A0 = 0;
const A1 = 1.2;
const B0 = 6.4;
const B1 = 7.6;
const at = (t: number) => trapezoid(t, A0, A1, B0, B1);
const speed = (t: number) => trapezoidSpeed(t, A0, A1, B0, B1);

describe("trapezoid", () => {
  it("travels nothing at a0 and the whole way by b1", () => {
    expect(at(A0)).toBe(0);
    expect(at(B1)).toBe(1);
  });

  it("never goes backwards, and never overshoots", () => {
    let last = 0;
    for (let n = 0; n <= 160; n++) {
      const f = at((n / 160) * B1);
      expect(f).toBeGreaterThanOrEqual(last - 1e-12);
      expect(f).toBeLessThanOrEqual(1 + 1e-12);
      last = f;
    }
  });

  it("holds at 1 past the end, so a figure sampled late stays put", () => {
    expect(at(B1 + 3)).toBe(1);
  });

  it("is symmetric about its middle when the two ramps are the same length", () => {
    const mid = (A0 + B1) / 2;
    for (const d of [0.2, 0.9, 2.5, 3.6]) {
      expect(at(mid + d) + at(mid - d)).toBeCloseTo(1, 12);
    }
  });
});

describe("trapezoidSpeed", () => {
  it("is still at both ends and full speed on the cruise", () => {
    expect(speed(A0)).toBe(0);
    expect(speed(B1)).toBe(0);
    expect(speed(A1)).toBe(1);
    expect(speed(B0)).toBe(1);
    expect(speed((A1 + B0) / 2)).toBe(1);
  });

  it("ramps linearly up and down", () => {
    expect(speed(A0 + (A1 - A0) / 4)).toBeCloseTo(0.25, 12);
    expect(speed(A0 + (A1 - A0) / 2)).toBeCloseTo(0.5, 12);
    expect(speed(B1 - (B1 - B0) / 4)).toBeCloseTo(0.25, 12);
  });

  it("is the derivative of the distance, up to the profile's own scale", () => {
    // `trapezoid` is normalised and `trapezoidSpeed` is not, so they agree only
    // up to the total distance the profile covers — which is what makes the two
    // usable together: a turn fraction and the flare that goes with it.
    const total = (B1 - A0 + (B0 - A1)) / 2;
    const dt = 1e-5;
    for (const t of [0.5, 1.5, 3, 6, 7]) {
      const d = (at(t + dt) - at(t - dt)) / (2 * dt);
      expect(d * total).toBeCloseTo(speed(t), 6);
    }
  });
});
