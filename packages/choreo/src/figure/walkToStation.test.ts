import { ARM_REACH_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { frame } from "../formation/Frame.js";
import { createGroup, groupStationPose } from "../group/Group.js";
import { SQUARE, squareStations } from "../testing/square.js";
import { withDefaults } from "./FigureDef.js";
import { WALK_TO_STATION } from "./walkToStation.js";
import { DEFAULT_BOW_PX } from "./walkPath.js";

const group = () =>
  createGroup(
    {
      id: "g",
      kind: "set",
      frame: frame([0, 0], 90),
      stations: squareStations(),
      members: Object.fromEntries(squareStations().map((s) => [s.id, `d-${s.id}`])),
      couples: [],
    },
    SQUARE.roleSet,
  );

describe("walk-to-station", () => {
  it("stands still when nothing tells it where to go", () => {
    const g = group();
    const params = withDefaults(WALK_TO_STATION, undefined, 8);
    const home = groupStationPose(g, "1L");
    for (const t of [0, 2, 4, 6, 8]) {
      const pose = WALK_TO_STATION.sample(g, "1L", t, params);
      expect(dist(pose.p, home.p)).toBe(0);
      expect(pose.stepRate).toBe(0);
    }
    expect(WALK_TO_STATION.ends(g, params)["1L"]!.p).toEqual(home.p);
  });

  it("lands exactly on the target station at the last beat", () => {
    const g = group();
    const params = withDefaults(WALK_TO_STATION, { to: { "1L": "3R" } }, 8);
    expect(WALK_TO_STATION.sample(g, "1L", 8, params).p).toEqual(groupStationPose(g, "3R").p);
    expect(WALK_TO_STATION.ends(g, params)["1L"]!.p).toEqual(groupStationPose(g, "3R").p);
  });

  it("starts exactly on the station it is told it came from", () => {
    const g = group();
    const params = withDefaults(WALK_TO_STATION, { from: { "1L": "2R" }, to: { "1L": "1L" } }, 8);
    expect(WALK_TO_STATION.sample(g, "1L", 0, params).p).toEqual(groupStationPose(g, "2R").p);
  });

  it("prefers an explicit world origin, which is how the line-up gap works", () => {
    const g = group();
    const origin = { p: [100, 100] as [number, number], facing: 0 };
    const params = withDefaults(
      WALK_TO_STATION,
      { origins: { "1L": origin }, from: { "1L": "2R" }, to: { "1L": "1L" } },
      8,
    );
    expect(WALK_TO_STATION.sample(g, "1L", 0, params).p).toEqual(origin.p);
  });

  it("turns the end facing by however many degrees it is told", () => {
    const g = group();
    const params = withDefaults(WALK_TO_STATION, { turn: { "1L": 180 } }, 8);
    expect(WALK_TO_STATION.ends(g, params)["1L"]!.facing).toBe(
      groupStationPose(g, "1L").facing + 180,
    );
  });

  it("bows to its own right so two dancers swapping places pass, not collide", () => {
    const g = group();
    const swap = withDefaults(WALK_TO_STATION, { to: { "1L": "3R", "3R": "1L" } }, 8);
    const straight = withDefaults(WALK_TO_STATION, { to: { "1L": "3R", "3R": "1L" }, bowPx: 0 }, 8);
    const apart = (params: typeof swap, t: number) =>
      dist(
        WALK_TO_STATION.sample(g, "1L", t, params).p,
        WALK_TO_STATION.sample(g, "3R", t, params).p,
      );
    expect(apart(straight, 4)).toBeLessThan(1e-9);
    expect(apart(swap, 4)).toBeCloseTo(2 * DEFAULT_BOW_PX, 6);
  });

  it("never places a hand, so it can never break the reach invariant", () => {
    const g = group();
    const params = withDefaults(WALK_TO_STATION, { to: { "1L": "3R" } }, 8);
    for (let t = 0; t <= 8; t += 0.5) {
      const pose = WALK_TO_STATION.sample(g, "1L", t, params);
      expect(pose.hands.L).toBe("down");
      expect(pose.hands.R).toBe("down");
    }
    // A sanity check that the constant it would be measured against is real.
    expect(ARM_REACH_PX).toBe(15);
  });

  it("is pure: the same inputs give the same pose", () => {
    const params = withDefaults(WALK_TO_STATION, { to: { "1L": "3R" } }, 8);
    expect(WALK_TO_STATION.sample(group(), "1L", 3.25, params)).toEqual(
      WALK_TO_STATION.sample(group(), "1L", 3.25, params),
    );
  });
});
