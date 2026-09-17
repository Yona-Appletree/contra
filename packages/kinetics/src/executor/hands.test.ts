import { describe, expect, it } from "vitest";
import { HEIGHTS } from "../body/Body.js";
import type { DancerId } from "../dialect/Dialect.js";
import { free } from "../holds/free.js";
import type { BodyFrame } from "../holds/HoldPosture.js";
import type { Trajectory } from "../motion/Trajectory.js";
import { proveMotion } from "../motion/prove.js";
import { dist } from "../motion/Vec3.js";
import { TAKE_BEATS } from "../units/limits.js";
import { tempo } from "../units/Tempo.js";
import { HAND_REACH_PX, handPath, reachOverrun, shoulderAnchor, type HoldEvent } from "./hands.js";

const T = tempo(112);
const LENGTH = 6 * T.samplesPerBeat + 1;

/**
 * Two bodies 14 px apart across y, both walking +x at 10 px a beat and facing
 * each other: a take with the floor moving under it, which is the only kind a
 * dance has.
 */
const walking = (): Map<DancerId, BodyFrame[]> => {
  const make = (y: number, yaw: number, role: "lark" | "robin"): BodyFrame[] => {
    const out: BodyFrame[] = [];
    for (let i = 0; i < LENGTH; i++) {
      const beat = i / T.samplesPerBeat;
      out.push({ hip: { x: 10 * beat, y, z: HEIGHTS.hipPx }, yawDeg: yaw, leanDeg: 0, role });
    }
    return out;
  };
  return new Map([
    ["lark", make(-7, 90, "lark")],
    ["robin", make(7, -90, "robin")],
  ]);
};

const asTrajectory = (points: readonly { x: number; y: number; z: number }[]): Trajectory => ({
  tempo: T,
  beat0: 0,
  length: points.length,
  points: { handR: points },
  channels: {},
});

describe("handPath", () => {
  const frames = walking();
  const self = frames.get("lark")!;
  const take: HoldEvent[] = [{ beat: 1, hold: "allemande-R", with: "robin" }];

  it("proves a take while both bodies are moving under it", () => {
    const path = handPath(take, "right", self, frames, T);
    expect(proveMotion(asTrajectory(path.target))).toEqual([]);
  });

  it("is the hang before the take and the hold after it", () => {
    const path = handPath(take, "right", self, frames, T);
    const before = T.samplesPerBeat;
    const after = (1 + TAKE_BEATS) * T.samplesPerBeat;
    expect(dist(path.target[before]!, free.target(self[before]!, undefined, "right"))).toBeCloseTo(
      0,
      9,
    );
    // Fully taken: the shared point midway between the two hips.
    const other = frames.get("robin")![after]!;
    expect(path.target[after]!.x).toBeCloseTo((self[after]!.hip.x + other.hip.x) / 2, 6);
    expect(path.target[after]!.y).toBeCloseTo((self[after]!.hip.y + other.hip.y) / 2, 6);
  });

  it("gives both dancers the same shared point, by arithmetic", () => {
    const larkPath = handPath(take, "right", frames.get("lark")!, frames, T);
    const robinPath = handPath(
      [{ beat: 1, hold: "allemande-R", with: "lark" }],
      "right",
      frames.get("robin")!,
      frames,
      T,
    );
    const after = (1 + TAKE_BEATS) * T.samplesPerBeat;
    expect(dist(larkPath.target[after]!, robinPath.target[after]!)).toBeCloseTo(0, 9);
  });

  it("ramps the take weight from nothing to all of it, and back on the release", () => {
    const path = handPath([...take, { beat: 4, hold: undefined }], "right", self, frames, T);
    expect(path.weight[0]).toBe(0);
    expect(path.weight[T.samplesPerBeat]).toBeCloseTo(0, 9);
    expect(path.weight[(1 + TAKE_BEATS / 2) * T.samplesPerBeat]).toBeCloseTo(0.5, 6);
    expect(path.weight[(1 + TAKE_BEATS) * T.samplesPerBeat]).toBeCloseTo(1, 9);
    expect(path.weight[(4 + TAKE_BEATS) * T.samplesPerBeat]).toBeCloseTo(0, 9);
  });

  it("proves the release as well as the take", () => {
    const path = handPath([...take, { beat: 4, hold: undefined }], "right", self, frames, T);
    expect(proveMotion(asTrajectory(path.target))).toEqual([]);
  });

  it("hangs the hand when there is nobody on the far end", () => {
    const path = handPath(
      [{ beat: 1, hold: "allemande-R", with: "nobody" }],
      "right",
      self,
      frames,
      T,
    );
    const after = (1 + TAKE_BEATS) * T.samplesPerBeat;
    expect(dist(path.target[after]!, free.target(self[after]!, undefined, "right"))).toBeCloseTo(
      0,
      9,
    );
  });
});

describe("reachOverrun", () => {
  const frame: BodyFrame = {
    hip: { x: 0, y: 0, z: HEIGHTS.hipPx },
    yawDeg: 0,
    leanDeg: 0,
    role: "lark",
  };

  it("says nothing about a hand an arm can reach", () => {
    expect(reachOverrun(frame, "right", free.target(frame, undefined, "right"))).toBe(0);
  });

  it("reports a take 20 px away rather than clamping it", () => {
    const anchor = shoulderAnchor(frame, "right");
    const far = { x: anchor.x + 20, y: anchor.y, z: anchor.z };
    const over = reachOverrun(frame, "right", far);
    expect(over).toBeCloseTo(20, 9);
    expect(over).toBeGreaterThan(HAND_REACH_PX);
    // The point itself is untouched: nothing here moves a hand.
    expect(far).toEqual({ x: anchor.x + 20, y: anchor.y, z: anchor.z });
  });
});
