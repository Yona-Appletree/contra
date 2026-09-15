import { HOLD_SPACING_PX, dist, hangingHand, shoulders, solveArm } from "@caller/core";
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
      kind: "wait-top",
      frame: frame([0, 0], axis),
      stations: WAIT_STATIONS,
      members: { WL: "lark-1", WR: "robin-1" },
      couples: ["c"],
    },
    ROLES,
  );

const params = (over: object = {}) => withDefaults(WAIT_OUT, over, 64);
/** Like {@link params}, but with a beat count of its own, since `withDefaults`'s own third argument overrides any `beats` in `over`. */
const paramsFor = (beats: number, over: object = {}) => withDefaults(WAIT_OUT, over, beats);

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

  it("has its hands at the hip at the stations, where no arm could reach the middle", () => {
    const g = group();
    const p = params();
    for (const t of [0, 1, 57, 60, 64]) {
      const pose = WAIT_OUT.sample(g, "WL", t, p);
      // The outside hand is never placed at all. The inside one is placed — at
      // the hip, which is where its take starts from and where its release
      // leaves it, so nothing appears or vanishes at either instant (F3c).
      expect(pose.hands.R).toBe("down");
      const inside = pose.hands.L;
      if (inside === "down") {
        // Past the start of the crossing the couple has let go for good.
        expect(t).toBeGreaterThanOrEqual(56);
        continue;
      }
      const hang = hangingHand(pose.p, pose.facing, "L", t, pose.amp);
      expect(dist(inside.p, hang.p)).toBeCloseTo(0, 9);
      expect(inside.drop).toBeCloseTo(hang.drop, 9);
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

  describe("a swap lands on the other station, wherever the couple came in from (M9e)", () => {
    // `startPlaces` is where the two dancers *are* when the figure begins — a
    // measurement a planner makes so that the step together starts from the
    // truth. Where they *go* is a place of the formation, and reading the
    // measurement for the landing is what put a waiting couple down on a place
    // somebody else had just been settled on.
    const stood = (WL: [number, number], WR: [number, number]) =>
      params({ startPlaces: { WL: { p: WL, facing: 0 }, WR: { p: WR, facing: 180 } } });

    it("lands on the stations when the couple is a place off them", () => {
      const g = group();
      // A place along the line from each station, which is where a time
      // through that picks everybody up where the last one left them can
      // leave a couple whose progression re-pairs the set.
      const p = stood([-16, 20], [16, 20]);
      expect(WAIT_OUT.ends(g, p)["WL"]!.p).toEqual(groupStationPose(g, "WR").p);
      expect(WAIT_OUT.ends(g, p)["WR"]!.p).toEqual(groupStationPose(g, "WL").p);
      expect(WAIT_OUT.sample(g, "WL", 64, p).p).toEqual(groupStationPose(g, "WR").p);
    });

    it("picks the dancers up from where they stand all the same", () => {
      const g = group();
      const p = stood([-16, 20], [16, 20]);
      expect(dist(WAIT_OUT.sample(g, "WL", 0, p).p, [-16, 20])).toBeLessThan(1e-9);
      expect(dist(WAIT_OUT.sample(g, "WR", 0, p).p, [16, 20])).toBeLessThan(1e-9);
    });

    it("lands on the stations even when the couple arrives on each other's sides", () => {
      const g = group();
      // The two dancers swapped across the set by the dance itself: each takes
      // the end of the hold they are standing at, and crosses to the other.
      const p = stood([16, 0], [-16, 0]);
      expect(WAIT_OUT.ends(g, p)["WL"]!.p).toEqual(groupStationPose(g, "WL").p);
      expect(WAIT_OUT.ends(g, p)["WR"]!.p).toEqual(groupStationPose(g, "WR").p);
    });

    it("changes nothing for a couple standing on its own stations", () => {
      const g = group();
      const p = stood([-16, 0], [16, 0]);
      expect(WAIT_OUT.ends(g, p)).toEqual(WAIT_OUT.ends(g, params()));
    });
  });

  it("serves both ends of a line from one layout, by turning the frame", () => {
    const top = group(90);
    const bottom = createGroup(
      {
        id: "w",
        kind: "wait-bottom",
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

  describe("the join/cross split (M2's waiting-couple sweep)", () => {
    it("defaults both true, and is byte-identical to a whole-cycle wait-out", () => {
      const g = group();
      const withDefaultsP = params();
      const explicitP = params({ join: true, cross: true });
      for (const t of [0, 1, 4, 20, 32, 56, 60, 64]) {
        expect(WAIT_OUT.sample(g, "WL", t, explicitP)).toEqual(
          WAIT_OUT.sample(g, "WL", t, withDefaultsP),
        );
        expect(WAIT_OUT.sample(g, "WR", t, explicitP)).toEqual(
          WAIT_OUT.sample(g, "WR", t, withDefaultsP),
        );
      }
      expect(WAIT_OUT.ends(g, explicitP)).toEqual(WAIT_OUT.ends(g, withDefaultsP));
    });

    it("join: false holds at the resting place from beat 0, no step-together ramp", () => {
      const g = group();
      const p = paramsFor(8, { join: false, cross: false });
      const rest = groupStationPose(g, "WL");
      // No ramp at all: beat 0 and beat 4 (mid-ramp in the joined case) agree.
      expect(WAIT_OUT.sample(g, "WL", 0, p).p).toEqual(rest.p);
      expect(WAIT_OUT.sample(g, "WL", 4, p).p).toEqual(rest.p);
    });

    it("cross: false still steps back out on schedule, ending at the station (not crossed)", () => {
      const g = group();
      const p = paramsFor(8, { cross: false });
      const rest = groupStationPose(g, "WL");
      const atEnd = WAIT_OUT.sample(g, "WL", 8, p);
      // Lands back at its own station — the part-out ramp always runs — never
      // at the far one: cross: false means nothing to cross to yet.
      expect(atEnd.p).toEqual(rest.p);
      expect(WAIT_OUT.ends(g, p)["WL"]!.p).toEqual(rest.p);
      expect(WAIT_OUT.ends(g, p)["WL"]!.facing).toEqual(rest.facing);
    });

    it("a leading (join, no cross) instance seams into a trailing (cross, no join) one", () => {
      // The realistic shape from `createScriptDecider`'s gap fill: a call
      // sweeps the couple out of the middle of their own wait-out span, so the
      // couple gets two instances — a leading gap that joins, steps back out
      // and stops (no cross), and a trailing one that picks up from that same
      // station and crosses without joining again.
      const g = group();
      const leading = paramsFor(24, { join: true, cross: false });
      const trailing = paramsFor(40, { join: false, cross: true });
      // Each station's own two instances seam to 0 px.
      for (const station of ["WL", "WR"] as const) {
        const end = WAIT_OUT.sample(g, station, 24, leading);
        const start = WAIT_OUT.sample(g, station, 0, trailing);
        expect(dist(end.p, start.p)).toBeCloseTo(0, 9);
        expect(end.facing).toBeCloseTo(start.facing, 9);
      }
      // And the trailing instance still ends exactly on the ordinary swap.
      expect(WAIT_OUT.ends(g, trailing)["WL"]!.p).toEqual(groupStationPose(g, "WR").p);
    });
  });

  it("refuses a group that is not a couple", () => {
    const three = createGroup(
      {
        id: "w",
        kind: "wait-top",
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
