import { describe, expect, it } from "vitest";
import { dirOf } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";
import { FOOT_SWING_PX } from "./RenderingContract.js";
import { profileProgress } from "./motionProfile.js";
import type { BodyPath, BodyPose } from "./plantedGait.js";
import {
  PLANT_BAND_PX,
  PLANT_HOLD_BEATS,
  PLANT_SWING_BEATS,
  STRIDE_CAP_PX,
  footRest,
  memoPlants,
  plantAt,
  plantSide,
  plantedGait,
} from "./plantedGait.js";
import { FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX } from "./quietMotion.js";

const STEP = 1 / 64;
const REST: Record<"L" | "R", Vec2> = {
  L: [FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX],
  R: [FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX],
};

/** A straight leg travelled at `pxPerBeat` average, on the cruise profile. */
const straight = (pxPerBeat: number, beats = 16, facing = 0): BodyPath => {
  const d = dirOf(facing);
  const distance = pxPerBeat * beats;
  return (t) => {
    const k = profileProgress("cruise", t, beats);
    return { p: [d[0] * distance * k, d[1] * distance * k], facing };
  };
};

/** A circle of `radius` px turned `turn` degrees over `beats`, body tangential. */
const circle = (radius: number, turn: number, beats: number): BodyPath => {
  return (t) => {
    const a = turn * profileProgress("cruise", t, beats);
    const rad = (a * Math.PI) / 180;
    return { p: [radius * Math.cos(rad), radius * Math.sin(rad)], facing: a + 90 };
  };
};

/** Walks for four beats and then stands still for ever. */
const stops = (pxPerBeat: number): BodyPath => {
  const leg = straight(pxPerBeat, 4);
  return (t) => leg(Math.min(t, 4));
};

const PATHS: { name: string; body: BodyPath; speed: number }[] = [
  { name: "standing still", body: straight(0), speed: 0 },
  { name: "long lines, 3 px/beat", body: straight(3), speed: 3 },
  { name: "the hey, 8 px/beat", body: straight(8), speed: 8 },
  { name: "slide left, 13 px/beat", body: straight(13), speed: 13 },
  { name: "as fast as anything walks, 16 px/beat", body: straight(16), speed: 16 },
  { name: "a diagonal at 10 px/beat", body: straight(10, 16, 37), speed: 10 },
  { name: "a 270-degree circle of 12 px in 5 beats", body: circle(12, 270, 5), speed: 0 },
  { name: "a walk that stops after four beats", body: stops(8), speed: 8 },
];

const offset = (foot: Vec2, side: "L" | "R"): number =>
  Math.hypot(foot[0] - REST[side][0], foot[1] - REST[side][1]);

describe("plantedGait: the band (AC2, the contract's own invariant)", () => {
  for (const { name, body } of PATHS) {
    for (const rightOnEven of [true, false]) {
      it(`keeps both feet inside 2.6 px of rest — ${name}, rightOnEven=${rightOnEven}`, () => {
        for (let t = 0; t <= 16; t += STEP) {
          const feet = plantedGait(body, t, { rightOnEven });
          expect(offset(feet.L, "L"), `L at beat ${t}`).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
          expect(offset(feet.R, "R"), `R at beat ${t}`).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
        }
      });
    }
  }
});

describe("plantedGait: the plant is on the floor", () => {
  it("holds a foot at one world point for the whole hold at walking pace", () => {
    const body = straight(3);
    const plants = memoPlants(body);
    // The right foot lands at beat 6 and is inside the band for its whole hold.
    const plant = plants(6);
    expect(plant.side).toBe("R");
    for (let u = 0; u < PLANT_HOLD_BEATS; u += STEP) {
      const world = worldFoot(body, 6 + u, "R");
      expect(Math.hypot(world[0] - plant.p[0], world[1] - plant.p[1])).toBeLessThan(1e-9);
    }
  });

  it("drags at the band's edge once the body has carried the foot that far", () => {
    const body = straight(8);
    const plants = memoPlants(body);
    const plant = plants(6);
    // At 8 px/beat the cruise's plateau carries the foot out of the band after
    // about 0.65 beat; before that it is nailed down, after it, at the edge.
    let planted = 0;
    let dragged = 0;
    for (let u = 0; u < PLANT_HOLD_BEATS; u += STEP) {
      const world = worldFoot(body, 6 + u, "R");
      const still = Math.hypot(world[0] - plant.p[0], world[1] - plant.p[1]) < 1e-9;
      if (still) planted = u;
      else {
        dragged += 1;
        expect(offset(plantedGait(body, 6 + u).R, "R")).toBeCloseTo(PLANT_BAND_PX, 9);
      }
    }
    expect(planted).toBeGreaterThan(0.55);
    expect(planted).toBeLessThan(0.75);
    expect(dragged).toBeGreaterThan(0);
  });
});

describe("plantedGait: the landing", () => {
  it("lands the right foot on even beats and the left on odd", () => {
    for (let k = -4; k <= 12; k++) {
      expect(plantSide(k, true)).toBe(k % 2 === 0 ? "R" : "L");
      expect(plantSide(k, false)).toBe(k % 2 === 0 ? "L" : "R");
      expect(plantAt(straight(8), k).side).toBe(plantSide(k, true));
    }
  });

  it("leads with the right foot, forward, on a forward path from beat 0", () => {
    const body = straight(8);
    const feet = plantedGait(body, 0.01);
    expect(feet.R[0]).toBeGreaterThan(FOOT_REST_FORWARD_PX);
    expect(feet.R[0]).toBeGreaterThan(feet.L[0]);
  });

  it("never leads further than the stride cap", () => {
    for (const { body } of PATHS) {
      for (let k = 0; k <= 12; k++) {
        const plant = plantAt(body, k);
        const rest = footRest(body(k), plant.side);
        const lead = Math.hypot(plant.p[0] - rest[0], plant.p[1] - rest[1]);
        expect(lead).toBeLessThanOrEqual(STRIDE_CAP_PX + 1e-9);
      }
    }
  });

  it("puts the next plant on the rest position when the body has stopped", () => {
    const body = stops(8);
    for (let k = 6; k <= 10; k++) {
      const plant = plantAt(body, k);
      const rest = footRest(body(k), plant.side);
      expect(Math.hypot(plant.p[0] - rest[0], plant.p[1] - rest[1])).toBeLessThan(1e-9);
    }
  });

  it("brings both feet back to rest within two beats of a stop, and keeps them there", () => {
    const body = stops(8);
    for (let t = 6; t <= 12; t += STEP) {
      const feet = plantedGait(body, t);
      expect(offset(feet.L, "L"), `L at ${t}`).toBeLessThan(1e-9);
      expect(offset(feet.R, "R"), `R at ${t}`).toBeLessThan(1e-9);
    }
  });
});

describe("plantedGait: continuity", () => {
  /** The furthest either foot moves between two samples `h` beats apart. */
  const worstStep = (body: BodyPath, h: number): number => {
    let worst = 0;
    let before = plantedGait(body, 0);
    for (let i = 1; i * h <= 16; i++) {
      const now = plantedGait(body, i * h);
      for (const side of ["L", "R"] as const) {
        worst = Math.max(
          worst,
          Math.hypot(now[side][0] - before[side][0], now[side][1] - before[side][1]),
        );
      }
      before = now;
    }
    return worst;
  };

  it("has no jump in it: a finer sample step gives a proportionally smaller one", () => {
    // The discriminating test, rather than a magic bound: a continuous path's
    // worst inter-sample motion falls with the step, and a jump's does not.
    for (const { name, body } of PATHS) {
      const coarse = worstStep(body, 1 / 64);
      const fine = worstStep(body, 1 / 256);
      if (coarse < 1e-9) continue;
      expect(fine / coarse, `${name}`).toBeLessThanOrEqual(0.4);
    }
  });

  it("moves a foot no faster than the swing can carry it", () => {
    // Band to band over the swing, plus the body's own travel under it, with
    // the smoothstep's 1.5× peak on top. 16 px/beat is the fastest path here.
    const bound = (1.5 * (2 * PLANT_BAND_PX + 16 * PLANT_SWING_BEATS)) / PLANT_SWING_BEATS;
    for (const { name, body } of PATHS) {
      expect(worstStep(body, 1 / 64) / (1 / 64), name).toBeLessThanOrEqual(bound);
    }
  });
});

describe("plantedGait: purity", () => {
  it("gives the same answer twice, memo or no memo", () => {
    const body = straight(10);
    for (const t of [0, 0.5, 1.75, 2, 6.375, 11.9]) {
      const a = plantedGait(body, t);
      const b = plantedGait(body, t);
      const c = plantedGait(body, t, { plants: memoPlants(body) });
      expect(a).toEqual(b);
      expect(a).toEqual(c);
    }
  });
});

/** One foot's world position, recovered from the body-local pair the gait returns. */
function worldFoot(body: BodyPath, t: number, side: "L" | "R"): Vec2 {
  const here: BodyPose = body(t);
  const feet = plantedGait(body, t);
  const local = feet[side];
  const d = dirOf(here.facing);
  const r: Vec2 = [-d[1], d[0]];
  return [
    here.p[0] + d[0] * local[0] + r[0] * local[1],
    here.p[1] + d[1] * local[0] + r[1] * local[1],
  ];
}
