import { describe, expect, it } from "vitest";
import { dirOf } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";
import type { PoseSample, Style } from "./PoseSample.js";
import { NEUTRAL_STYLE } from "./PoseSample.js";
import { FOOT_SWING_PX, TORSO_SWAY_DEG } from "./RenderingContract.js";
import type { BodyPath } from "./plantedGait.js";
import { plantedGait } from "./plantedGait.js";
import {
  BUZZ_STEPS_PER_BEAT,
  BUZZ_TRAILING_FOOT,
  FOOT_REST_FORWARD_PX,
  FOOT_REST_LATERAL_PX,
  FULL_AMPLITUDE_SPEED,
  quietMotion,
} from "./quietMotion.js";

/** Seeded PRNG so a failing case can be reproduced from the printed seed. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 500;

const pose = (over: Partial<PoseSample> = {}): PoseSample => ({
  p: [0, 0],
  facing: 0,
  look: 0,
  lean: 0,
  hands: { L: "down", R: "down" },
  stepRate: 1,
  buzz: false,
  flare: 0,
  amp: 1,
  ...over,
});

/** Displacement of a foot from its rest position. */
const offset = (foot: Vec2, rest: Vec2): number => Math.hypot(foot[0] - rest[0], foot[1] - rest[1]);

const REST_L: Vec2 = [FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX];
const REST_R: Vec2 = [FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX];

describe("quietMotion: amplitude (property, 500 cases)", () => {
  it("never swings a foot more than 2.6 px or sways more than 1.5 degrees", () => {
    const seed = 0x9c1e7;
    const rng = mulberry32(seed);
    for (let i = 0; i < CASES; i++) {
      const facing = rng() * 720 - 360;
      const speed = rng() * 40;
      const heading = rng() * 360;
      const d = dirOf(heading);
      const velocity: Vec2 = [d[0] * speed, d[1] * speed];
      const beat = rng() * 128;
      const sample = pose({
        facing,
        stepRate: rng() < 0.5 ? 1 : 2,
        amp: rng(),
      });
      const style: Style = { bounce: rng() * 3, lead: 0, swingTightness: 1 };
      const m = quietMotion(sample, beat, velocity, style);
      const why = `seed=${seed} case=${i} speed=${speed} beat=${beat} bounce=${style.bounce}`;

      expect(offset(m.feet.L, REST_L), why).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
      expect(offset(m.feet.R, REST_R), why).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
      expect(Math.abs(m.sway), why).toBeLessThanOrEqual(TORSO_SWAY_DEG + 1e-9);
    }
  });
});

describe("the gait: the same amplitude invariant (property, 500 cases)", () => {
  it("never puts a planted foot more than 2.6 px from its rest position", () => {
    // The invariant `quietMotion` used to be the sole keeper of. Since M10 the
    // feet are the timeline's, so the bound is asserted against the thing that
    // now places them, over the same random speeds and headings.
    const seed = 0x9c1e7;
    const rng = mulberry32(seed);
    for (let i = 0; i < CASES; i++) {
      const facing = rng() * 720 - 360;
      const speed = rng() * 16;
      const heading = rng() * 360;
      const d = dirOf(heading);
      const body: BodyPath = (t) => ({
        p: [d[0] * speed * t, d[1] * speed * t],
        facing,
      });
      const beat = rng() * 128;
      const feet = plantedGait(body, beat, { rightOnEven: rng() < 0.5 });
      const why = `seed=${seed} case=${i} speed=${speed} beat=${beat}`;
      expect(offset(feet.L, REST_L), why).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
      expect(offset(feet.R, REST_R), why).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
    }
  });
});

describe("quietMotion: standing still", () => {
  it("plants the feet and stops the sway at zero velocity", () => {
    for (const beat of [0, 0.25, 0.5, 1.75, 9.1]) {
      const m = quietMotion(pose(), beat, [0, 0], NEUTRAL_STYLE);
      expect(m.feet.L).toEqual(REST_L);
      expect(m.feet.R).toEqual(REST_R);
      expect(Math.abs(m.sway)).toBe(0);
    }
  });

  it("stops the motion when amp is 0, however fast the dancer moves", () => {
    const m = quietMotion(pose({ amp: 0 }), 0.25, [8, 0], NEUTRAL_STYLE);
    expect(m.feet.L).toEqual(REST_L);
    expect(Math.abs(m.sway)).toBe(0);
  });

  it("stops the motion when the style has no bounce", () => {
    const still: Style = { bounce: 0, lead: 0, swingTightness: 1 };
    const m = quietMotion(pose(), 0.25, [8, 0], still);
    expect(m.feet.L).toEqual(REST_L);
    expect(Math.abs(m.sway)).toBe(0);
  });
});

describe("quietMotion: the beat peak", () => {
  it("reaches exactly 1.5 degrees of sway at the peak, and leaves the feet at rest", () => {
    // sin(2*pi*beat*stepRate) = 1 at beat 0.25 with stepRate 1, and the
    // amplitude saturates at 4 px per beat.
    const m = quietMotion(pose(), 0.25, [FULL_AMPLITUDE_SPEED, 0], NEUTRAL_STYLE);
    expect(m.sway).toBeCloseTo(TORSO_SWAY_DEG, 12);
    // M10: the walking swing is gone from here. A sample with nothing to say
    // about its feet gets the rest position; the gait is the timeline's.
    expect(m.feet.L).toEqual(REST_L);
    expect(m.feet.R).toEqual(REST_R);
  });

  it("sways the other way half a beat later", () => {
    const m = quietMotion(pose(), 0.75, [FULL_AMPLITUDE_SPEED, 0], NEUTRAL_STYLE);
    expect(m.sway).toBeCloseTo(-TORSO_SWAY_DEG, 12);
    expect(m.feet.L).toEqual(REST_L);
  });

  it("crosses zero on the beat, so the dancer is square on 1", () => {
    for (const beat of [0, 0.5, 1, 2, 7]) {
      const m = quietMotion(pose(), beat, [FULL_AMPLITUDE_SPEED, 0], NEUTRAL_STYLE);
      expect(m.sway).toBeCloseTo(0, 9);
    }
  });

  it("steps twice as often at stepRate 2", () => {
    const walk = quietMotion(pose(), 0.125, [8, 0], NEUTRAL_STYLE);
    const run = quietMotion(pose({ stepRate: 2 }), 0.125, [8, 0], NEUTRAL_STYLE);
    expect(run.sway).toBeCloseTo(TORSO_SWAY_DEG, 12);
    expect(walk.sway).toBeCloseTo(TORSO_SWAY_DEG * Math.SQRT1_2, 12);
  });
});

describe("quietMotion: direction of travel", () => {
  it("no longer moves the feet with it (M10): only the sway reads the speed", () => {
    // Facing +x, moving +y: the travel is entirely to the dancer's right, and
    // before M10 the feet swung sideways with it.
    const m = quietMotion(pose(), 0.25, [0, FULL_AMPLITUDE_SPEED], NEUTRAL_STYLE);
    expect(m.feet.L).toEqual(REST_L);
    expect(m.feet.R).toEqual(REST_R);
    expect(m.sway).toBeCloseTo(TORSO_SWAY_DEG, 12);
  });
});

describe("quietMotion: vertical bounce", () => {
  it("returns nothing vertical at all", () => {
    const m = quietMotion(pose(), 0.25, [FULL_AMPLITUDE_SPEED, 0], NEUTRAL_STYLE);
    expect(Object.keys(m).sort()).toEqual(["feet", "sway"]);
    expect(m.feet.L).toHaveLength(2);
    expect(m.feet.R).toHaveLength(2);
  });
});

describe("quietMotion: buzz step", () => {
  it("stops the torso sway and pivots on one foot", () => {
    const m = quietMotion(pose({ buzz: true, stepRate: 2 }), 0.3, [4, 0], NEUTRAL_STYLE);
    expect(Math.abs(m.sway)).toBe(0);
    expect(m.feet.R).toEqual(BUZZ_TRAILING_FOOT);
  });

  it("buzzes twice a beat", () => {
    const at = (beat: number) =>
      quietMotion(pose({ buzz: true, stepRate: 2 }), beat, [4, 0], NEUTRAL_STYLE).feet.L[0];
    expect(BUZZ_STEPS_PER_BEAT).toBe(2);
    // sin(2*pi*2*beat) peaks at beat 0.125 and 0.625, zero at 0 / 0.25 / 0.5.
    const peak = at(0.125);
    expect(at(0.625)).toBeCloseTo(peak, 12);
    expect(at(0)).toBeCloseTo(at(0.25), 12);
    expect(at(0)).toBeLessThan(peak);
  });
});

describe("quietMotion: explicit feet", () => {
  it("keeps feet the figure placed, and still reports the sway", () => {
    const feet = { L: [9, 9] as Vec2, R: [-9, -9] as Vec2 };
    const m = quietMotion(pose({ feet }), 0.25, [FULL_AMPLITUDE_SPEED, 0], NEUTRAL_STYLE);
    expect(m.feet).toBe(feet);
    expect(m.sway).toBeCloseTo(TORSO_SWAY_DEG, 12);
  });
});
