import { describe, expect, it } from "vitest";
import type { MotionProfile } from "./motionProfile.js";
import {
  CRUISE_RAMP_BEATS,
  cruiseRamp,
  peakOverAverage,
  profileProgress,
  profileSpeed,
} from "./motionProfile.js";

const PROFILES: readonly MotionProfile[] = ["smooth", "cruise"];
const LEGS = [1, 2, 4, 6, 8, 16];
const STEP = 1 / 64;

describe("motionProfile: the ramp rule", () => {
  it("is a quarter of the leg, capped at one beat", () => {
    expect(cruiseRamp(1)).toBeCloseTo(0.25, 12);
    expect(cruiseRamp(2)).toBeCloseTo(0.5, 12);
    expect(cruiseRamp(4)).toBeCloseTo(1, 12);
    expect(cruiseRamp(8)).toBeCloseTo(1, 12);
    expect(cruiseRamp(16)).toBeCloseTo(CRUISE_RAMP_BEATS, 12);
  });
});

describe("motionProfile: exact ends", () => {
  for (const profile of PROFILES) {
    it(`${profile} is 0 at or before 0 and 1 at or after the end`, () => {
      for (const beats of LEGS) {
        expect(profileProgress(profile, -1, beats)).toBe(0);
        expect(profileProgress(profile, 0, beats)).toBe(0);
        expect(profileProgress(profile, beats, beats)).toBe(1);
        expect(profileProgress(profile, beats + 1, beats)).toBe(1);
      }
    });
  }

  it("treats a leg of no length as a left-continuous step, like `ramp`", () => {
    for (const profile of PROFILES) {
      expect(profileProgress(profile, 0, 0)).toBe(0);
      expect(profileProgress(profile, 1e-9, 0)).toBe(1);
      expect(profileSpeed(profile, 0.5, 0)).toBe(0);
    }
  });
});

describe("motionProfile: monotone and symmetric", () => {
  for (const profile of PROFILES) {
    it(`${profile} never goes backwards`, () => {
      for (const beats of LEGS) {
        let last = 0;
        for (let t = 0; t <= beats + STEP; t += STEP) {
          const k = profileProgress(profile, t, beats);
          expect(k).toBeGreaterThanOrEqual(last - 1e-12);
          last = k;
        }
      }
    });

    it(`${profile} is symmetric about the leg's midpoint`, () => {
      for (const beats of LEGS) {
        for (let t = 0; t <= beats; t += STEP) {
          const here = profileProgress(profile, t, beats);
          const there = profileProgress(profile, beats - t, beats);
          expect(here + there).toBeCloseTo(1, 12);
        }
      }
    });
  }
});

describe("motionProfile: the speed is the progress's own derivative", () => {
  for (const profile of PROFILES) {
    it(`${profile} matches a central difference`, () => {
      const h = 1e-6;
      for (const beats of LEGS) {
        // Away from the corners of the trapezoid, where the derivative has a
        // kink and a central difference is legitimately wrong.
        const corners = [0, cruiseRamp(beats), beats - cruiseRamp(beats), beats];
        for (let t = h * 10; t < beats; t += STEP) {
          if (corners.some((c) => Math.abs(t - c) < 1e-3)) continue;
          const numeric =
            (profileProgress(profile, t + h, beats) - profileProgress(profile, t - h, beats)) /
            (2 * h);
          expect(profileSpeed(profile, t, beats)).toBeCloseTo(numeric, 6);
        }
      }
    });
  }
});

describe("motionProfile: peak over average", () => {
  it("is 3/2 for the smoothstep at every length", () => {
    for (const beats of LEGS) expect(peakOverAverage("smooth", beats)).toBeCloseTo(1.5, 12);
  });

  it("is 4/3 on a four-beat cruise and 8/7 on an eight", () => {
    expect(peakOverAverage("cruise", 4)).toBeCloseTo(4 / 3, 12);
    expect(peakOverAverage("cruise", 8)).toBeCloseTo(8 / 7, 12);
  });

  it("is never above 3/2 on a cruise, at any leg length", () => {
    for (let beats = 0.5; beats <= 32; beats += 0.25) {
      expect(peakOverAverage("cruise", beats)).toBeLessThanOrEqual(4 / 3 + 1e-12);
    }
  });

  it("is what the sampled speed actually does", () => {
    for (const profile of PROFILES) {
      for (const beats of LEGS) {
        let peak = 0;
        for (let t = 0; t <= beats; t += STEP) {
          peak = Math.max(peak, profileSpeed(profile, t, beats));
        }
        // The average rate over the leg is 1 / beats: it covers the whole of it.
        expect(peak * beats).toBeCloseTo(peakOverAverage(profile, beats), 3);
      }
    }
  });
});
