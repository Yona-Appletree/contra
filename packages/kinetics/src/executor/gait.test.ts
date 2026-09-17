import { describe, expect, it } from "vitest";
import type { Foot } from "../asm/Instruction.js";
import type { Trajectory } from "../motion/Trajectory.js";
import { proveMotion } from "../motion/prove.js";
import { tempo } from "../units/Tempo.js";
import {
  FOOT_LIFT_PX,
  FOOT_REST_FORWARD_PX,
  FOOT_REST_LATERAL_PX,
  footRestAt,
  gait,
  plantsOf,
  type GaitPlan,
} from "./gait.js";
import type { BeatPose } from "./hipPath.js";

const T = tempo(112);

/** Stand a beat, walk `steps` steps of `px` along +x starting on the right, stand a beat. */
const walking = (steps: number, px: number): GaitPlan => {
  const targets: BeatPose[] = [{ p: [0, 0], facing: 0 }];
  const stepFoot: (Foot | undefined)[] = [undefined];
  for (let i = 1; i <= steps; i++) {
    targets.push({ p: [i * px, 0], facing: 0 });
    stepFoot.push(i % 2 === 1 ? "R" : "L");
  }
  targets.push({ p: [steps * px, 0], facing: 0 });
  return { targets, stepFoot, length: (targets.length - 1) * T.samplesPerBeat + 1 };
};

const asTrajectory = (g: ReturnType<typeof gait>, length: number): Trajectory => ({
  tempo: T,
  beat0: 0,
  length,
  points: { footL: g.footL, footR: g.footR },
  channels: {},
});

describe("footRestAt", () => {
  it("puts each foot forward and out to its own side", () => {
    const pose: BeatPose = { p: [0, 0], facing: 0 };
    // Facing +x, the dancer's right is +y (screen y down).
    expect(footRestAt(pose, "R")).toEqual([FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX]);
    expect(footRestAt(pose, "L")).toEqual([FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX]);
  });
});

describe("plantsOf", () => {
  it("alternates, one plant per beat, on the beat", () => {
    const plants = plantsOf(walking(4, 6));
    const steps = plants.filter((p) => p.beat > 0);
    expect(steps.map((p) => p.beat)).toEqual([1, 2, 3, 4, 5]);
    for (const plant of plants) expect(Number.isInteger(plant.beat)).toBe(true);
    // Beat 0 stands, so the settle takes the first beat; the steps then
    // alternate from the right foot as the scheduler numbered them.
    expect(steps.slice(1, 5).map((p) => p.foot)).toEqual(["R", "L", "R", "L"]);
  });

  it("lands each foot at the rest offset of the pose it is arriving at", () => {
    const plan = walking(4, 6);
    for (const plant of plantsOf(plan)) {
      const pose = plan.targets[plant.beat]!;
      expect(plant.p).toEqual(footRestAt(pose, plant.foot));
    }
  });

  it("settles the trailing foot on a beat with no step", () => {
    // Walk two steps, then stand: the left foot is a step behind when the
    // walking stops, and the standing beat is what brings it home.
    const plan = walking(2, 6);
    const plants = plantsOf(plan);
    const lastLeft = [...plants].reverse().find((p) => p.foot === "L")!;
    expect(lastLeft.beat).toBe(3);
    expect(lastLeft.p).toEqual(footRestAt(plan.targets[3]!, "L"));
  });
});

describe("gait", () => {
  it("does not move a planted foot at all between its plants", () => {
    const plan = walking(4, 6);
    const g = gait(plan, T);
    // The right foot plants at beat 2 and flies again over beat 3: it is
    // exactly still over the whole of beat 2 to 3.
    const from = 2 * T.samplesPerBeat;
    const to = 3 * T.samplesPerBeat;
    for (let i = from; i <= to; i++) {
      expect(g.footR[i]!.x).toBeCloseTo(g.footR[from]!.x, 12);
      expect(g.footR[i]!.y).toBeCloseTo(g.footR[from]!.y, 12);
      expect(g.footR[i]!.z).toBe(0);
    }
  });

  it("keeps exactly one foot on the floor while the other flies", () => {
    const plan = walking(4, 6);
    const g = gait(plan, T);
    for (let i = 0; i < plan.length; i++) {
      expect(g.footL[i]!.z === 0 || g.footR[i]!.z === 0).toBe(true);
    }
  });

  it("lifts a flying foot and puts it down again", () => {
    const g = gait(walking(4, 6), T);
    const mid = Math.round(1.5 * T.samplesPerBeat);
    expect(g.footR[mid]!.z).toBeCloseTo(FOOT_LIFT_PX, 6);
    expect(g.footR[2 * T.samplesPerBeat]!.z).toBe(0);
  });

  it("proves a walk of four 24 cm steps and a stop", () => {
    const plan = walking(4, 6);
    expect(proveMotion(asTrajectory(gait(plan, T), plan.length))).toEqual([]);
  });

  it("proves the do-si-do's stride, which is the longest in the fixture", () => {
    // 35 cm steps: a foot then covers two of them, 17.5 px, in the one beat it
    // is in the air. That is the number the whole-beat flight exists for.
    const plan = walking(8, 8.75);
    expect(proveMotion(asTrajectory(gait(plan, T), plan.length))).toEqual([]);
  });
});
