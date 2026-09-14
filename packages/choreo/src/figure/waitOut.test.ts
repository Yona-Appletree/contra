import { HOLD_SPACING_PX, dist, shoulders, solveArm } from "@caller/core";
import { describe, expect, it } from "vitest";
import { frame, reverseFrame } from "../formation/Frame.js";
import type { Station } from "../formation/Formation.js";
import { createGroup, groupStationPose } from "../group/Group.js";
import { withDefaults } from "./FigureDef.js";
import { WAIT_OUT } from "./waitOut.js";

const ROLES = { roles: ["lark", "robin"], top: "robin" };

const WAIT_STATIONS: Station[] = [
  { id: "WL", role: "lark", facing: 0, p: [-16, 0] },
  { id: "WR", role: "robin", facing: 180, p: [16, 0] },
];

const group = (axis = 90) =>
  createGroup(
    {
      id: "w",
      kind: "wait",
      frame: frame([0, 0], axis),
      stations: WAIT_STATIONS,
      members: { WL: "lark-1", WR: "robin-1" },
      couples: ["c"],
    },
    ROLES,
  );

const params = (over: object = {}) => withDefaults(WAIT_OUT, over, 64);

describe("wait-out", () => {
  it("swaps the two stations by the end, exactly", () => {
    const g = group();
    const p = params();
    expect(WAIT_OUT.ends(g, p)["WL"]!.p).toEqual(groupStationPose(g, "WR").p);
    expect(WAIT_OUT.ends(g, p)["WR"]!.p).toEqual(groupStationPose(g, "WL").p);
    expect(WAIT_OUT.sample(g, "WL", 64, p).p).toEqual(groupStationPose(g, "WR").p);
  });

  it("leaves both dancers facing along the frame's own axis", () => {
    for (const axis of [90, 270]) {
      const g = group(axis);
      expect(WAIT_OUT.ends(g, params())["WL"]!.facing).toBe(axis);
    }
  });

  it("steps together to the hold spacing to take hands", () => {
    const g = group();
    const p = params();
    const a = WAIT_OUT.sample(g, "WL", 20, p);
    const b = WAIT_OUT.sample(g, "WR", 20, p);
    expect(dist(a.p, b.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
  });

  it("gives both dancers the identical floor point for the joined hand", () => {
    const g = group();
    const p = params();
    const a = WAIT_OUT.sample(g, "WL", 20, p);
    const b = WAIT_OUT.sample(g, "WR", 20, p);
    const handA = a.hands.L;
    const handB = b.hands.R;
    expect(handA).not.toBe("down");
    expect(handB).not.toBe("down");
    if (handA === "down" || handB === "down") throw new Error("unreachable");
    expect(handA.p).toEqual(handB.p);
  });

  it("keeps the joined hand inside a 15 px arm (AC1)", () => {
    const g = group();
    const p = params();
    for (const [station, side] of [
      ["WL", "L"],
      ["WR", "R"],
    ] as const) {
      const pose = WAIT_OUT.sample(g, station, 20, p);
      const hand = pose.hands[side];
      if (hand === "down") throw new Error("expected a joined hand");
      expect(solveArm(shoulders(pose)[side], hand, side, pose.facing).short).toBe(0);
    }
  });

  it("has hands down at the stations, where no arm could reach the middle", () => {
    const g = group();
    const p = params();
    for (const t of [0, 1, 57, 60, 64]) {
      const pose = WAIT_OUT.sample(g, "WL", t, p);
      expect(pose.hands.L).toBe("down");
      expect(pose.hands.R).toBe("down");
    }
  });

  it("crosses over during the last eight beats", () => {
    const g = group();
    const p = params();
    const atFiftySix = WAIT_OUT.sample(g, "WL", 56, p);
    expect(atFiftySix.p).toEqual(groupStationPose(g, "WL").p);
    expect(dist(WAIT_OUT.sample(g, "WL", 64, p).p, atFiftySix.p)).toBeCloseTo(32, 9);
  });

  it("passes the two dancers more than 8 px apart while they cross (AC6)", () => {
    const g = group();
    const p = params();
    let closest = Infinity;
    for (let t = 56; t <= 64; t += 1 / 8) {
      closest = Math.min(
        closest,
        dist(WAIT_OUT.sample(g, "WL", t, p).p, WAIT_OUT.sample(g, "WR", t, p).p),
      );
    }
    expect(closest).toBeGreaterThan(8);
  });

  it("mirrors instead of swapping when the formation says so", () => {
    const g = group();
    const p = params({ crossTo: "mirror" });
    // Stations here are opposite each other, so mirroring and swapping agree
    // on the point and differ on the facing.
    expect(WAIT_OUT.ends(g, p)["WL"]!.p[0]).toBeCloseTo(16, 9);
    expect(WAIT_OUT.ends(g, p)["WL"]!.facing).toBe(180);
  });

  it("serves both ends of a line from one layout, by turning the frame", () => {
    const top = group(90);
    const bottom = createGroup(
      {
        id: "w",
        kind: "wait",
        frame: reverseFrame(frame([0, 0], 90)),
        stations: WAIT_STATIONS,
        members: { WL: "lark-2", WR: "robin-2" },
        couples: ["c"],
      },
      ROLES,
    );
    // The lark starts on opposite sides of the set at the two ends.
    expect(groupStationPose(top, "WL").p[0]).toBeCloseTo(-16, 9);
    expect(groupStationPose(bottom, "WL").p[0]).toBeCloseTo(16, 9);
  });

  it("refuses a group that is not a couple", () => {
    const three = createGroup(
      {
        id: "w",
        kind: "wait",
        frame: frame([0, 0], 90),
        stations: [...WAIT_STATIONS, { id: "X", role: "lark", facing: 0, p: [0, 20] }],
        members: { WL: "a", WR: "b", X: "c" },
        couples: ["c"],
      },
      ROLES,
    );
    expect(() => WAIT_OUT.sample(three, "WL", 0, params())).toThrow(/group of two/);
  });
});
