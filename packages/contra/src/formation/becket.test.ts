import type { DancerId, SetState, Vec2 } from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  WAIT_OUT,
  assertPartition,
  createGroup,
  dist,
  partitionProblems,
  resolveSelector,
  stationPose,
  withDefaults,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import {
  BECKET,
  BECKET_STATIONS,
  BECKET_TOP_OFFSET_PX,
  BECKET_WAIT_STATIONS,
  COUPLE_PITCH_PX,
  LINE_GROUP,
  SHADOW_PAIR_GROUP,
} from "./becket.js";
import { ACROSS_PX, PLACE_PITCH_PX } from "./dupleImproper.js";

/** AC5's number. */
const CLOSURE_PX = 0.01;
/** AC6's number. */
const COLLISION_PX = 8;

const set = (couples: number): SetState =>
  BECKET.start({ id: "b", couples, centre: [0, 0], axis: 90 });

/** Where every dancer of a set stands, as its own groups place them. */
function places(state: SetState): Map<DancerId, Vec2> {
  const out = new Map<DancerId, Vec2>();
  for (const plan of BECKET.groupsFor(HANDS_FOUR_GROUP, state)) {
    for (const station of plan.stations) {
      out.set(plan.members[station.id]!, stationPose(plan.frame, station).p);
    }
  }
  return out;
}

describe("becket stations", () => {
  it("keeps the lines a duple line's width apart and the couples twice a place apart", () => {
    expect(COUPLE_PITCH_PX).toBe(PLACE_PITCH_PX * 2);
    const xs = new Set(BECKET_STATIONS.map((s) => s.p[0]));
    expect([...xs].sort((a, b) => a - b)).toEqual([-ACROSS_PX / 2, ACROSS_PX / 2]);
  });

  it("stands partners beside each other, robin on the lark's right", () => {
    const by = (id: string) => BECKET_STATIONS.find((s) => s.id === id)!;
    // The `+1` line faces across at 0°, so its right is +y.
    expect(by("1L").p[1]).toBeLessThan(by("1R").p[1]);
    // The other line faces back at 180°, so its right is −y.
    expect(by("2L").p[1]).toBeGreaterThan(by("2R").p[1]);
  });

  it("faces the two couples at each other", () => {
    const by = (id: string) => BECKET_STATIONS.find((s) => s.id === id)!;
    expect(by("1L").facing).toBe(0);
    expect(by("2L").facing).toBe(180);
  });

  it("never stands two dancers closer than AC6 allows", () => {
    for (const a of BECKET_STATIONS) {
      for (const b of BECKET_STATIONS) {
        if (a.id === b.id) continue;
        expect(dist(a.p, b.p), `${a.id}/${b.id}`).toBeGreaterThan(COLLISION_PX);
      }
    }
  });

  it("puts the waiting stations a couple's width apart, on the waiting line", () => {
    const [wl, wr] = BECKET_WAIT_STATIONS as unknown as [
      (typeof BECKET_WAIT_STATIONS)[0],
      (typeof BECKET_WAIT_STATIONS)[0],
    ];
    expect(dist(wl.p, wr.p)).toBeCloseTo(PLACE_PITCH_PX, 9);
    expect(wl.p[0]).toBe(-ACROSS_PX / 2);
  });
});

describe("a becket set", () => {
  it("lays a hall out as full places with one waiting couple beyond each end", () => {
    const state = set(8);
    expect(state.couples).toHaveLength(8);
    const parts = BECKET.groupsFor(HANDS_FOUR_GROUP, state);
    expect(parts.map((p) => p.kind)).toEqual(["wait-top", "set", "set", "set", "wait-bottom"]);
    expect(state.couples.filter((c) => c.place === -1)).toHaveLength(1);
    expect(state.couples.filter((c) => c.place === 3)).toHaveLength(1);
  });

  it("refuses a hall too small to make a becket line", () => {
    expect(() => set(2)).toThrow(/at least four/);
  });

  it("stands the odd couple out of an odd hall on a second waiting place", () => {
    // Two couples stand at every dancing place, one from each line, so an odd
    // number cannot fill a becket set: the odd one out takes a waiting place
    // beyond the bottom end, and the set alternates between three dancing
    // places and two — somebody is always out, never the same couple twice.
    const state = set(5);
    expect(state.couples).toHaveLength(5);
    expect(BECKET.groupsFor(HANDS_FOUR_GROUP, state).map((p) => p.kind)).toEqual([
      "wait-top",
      "set",
      "wait-bottom",
      "wait-bottom",
    ]);
    let next = state;
    for (let cycle = 0; cycle < 6; cycle++) {
      next = BECKET.progression.next(next);
      expect(next.couples).toHaveLength(5);
      expect(
        BECKET.groupsFor(HANDS_FOUR_GROUP, next).filter((p) => p.kind === "set").length,
      ).toBeGreaterThan(0);
    }
  });

  it("puts every dancer in exactly one group, at every hall size and every time through", () => {
    for (let couples = 4; couples <= 9; couples++) {
      let state = set(couples);
      for (let cycle = 0; cycle < 2 * couples; cycle++) {
        expect(
          partitionProblems(BECKET.groupsFor(HANDS_FOUR_GROUP, state), state),
          `${couples} couples, cycle ${cycle}`,
        ).toEqual([]);
        state = BECKET.progression.next(state);
      }
    }
  });

  it("refuses a group selector it does not define", () => {
    // M2 added "shadow-pair" and "line"; "set" (D9) is still not one becket
    // defines.
    expect(() => BECKET.groupsFor("set", set(8))).toThrow(/no group selector/);
    expect(() => BECKET.tags("set")).toThrow(/no group selector/);
    expect(BECKET.groupFor(HANDS_FOUR_GROUP)).toEqual(BECKET.group(4));
  });

  it("lays its first dancer out where a duple improper line's first dancer stands", () => {
    // A hall hands both formations the same point for a line. A becket set's
    // first dancer is at place −1, so the frame sits `BECKET_TOP_OFFSET_PX`
    // down the hall from it and the two lines start together.
    const ys = [...places(set(8)).values()].map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
  });

  it("keeps the same shape every time through", () => {
    let state = set(10);
    const shape = (s: SetState) => BECKET.groupsFor(HANDS_FOUR_GROUP, s).map((p) => p.kind);
    const first = shape(state);
    for (let cycle = 0; cycle < 6; cycle++) {
      state = BECKET.progression.next(state);
      expect(shape(state)).toEqual(first);
      expect(state.couples).toHaveLength(10);
    }
  });

  it("slides each line to its own left and turns the end couples round", () => {
    const state = set(8);
    const before = new Map(state.couples.map((c) => [c.id, c]));
    const after = BECKET.progression.next(state);
    for (const couple of after.couples) {
      const was = before.get(couple.id)!;
      if (was.place === -1 || was.place === 3) {
        // A couple beyond the end comes back in on the other line.
        expect(couple.direction).toBe(-was.direction);
        expect(couple.place).toBe(was.place + was.direction);
      } else {
        expect(couple.direction).toBe(was.direction);
        expect(couple.place).toBe(was.place - was.direction);
      }
    }
  });

  it("stands a waiting couple on its own line, a place apart, beyond the end", () => {
    const state = set(8);
    const standing = places(state);
    for (const plan of BECKET.groupsFor(HANDS_FOUR_GROUP, state).filter((p) => p.kind !== "set")) {
      const couple = state.couples.find((c) => c.id === plan.couples[0])!;
      const points = plan.stations.map((s) => standing.get(plan.members[s.id]!)!);
      for (const p of points) {
        expect(Math.abs(p[0])).toBeCloseTo(ACROSS_PX / 2, 9);
        // Beyond the last dancing place, down the set from its own centre.
        const centre = BECKET_TOP_OFFSET_PX + couple.place * COUPLE_PITCH_PX;
        expect(Math.abs(p[1] - centre)).toBeCloseTo(PLACE_PITCH_PX / 2, 9);
      }
      expect(dist(points[0]!, points[1]!)).toBeCloseTo(PLACE_PITCH_PX, 9);
    }
  });
});

describe("the becket end effect closes", () => {
  it("puts every waiting couple within 0.01 px of where the next time through wants it", () => {
    const state = set(10);
    const next = places(BECKET.progression.next(state));
    let worst = 0;
    let checked = 0;
    for (const plan of BECKET.groupsFor(HANDS_FOUR_GROUP, state).filter((p) => p.kind !== "set")) {
      const group = createGroup(plan, BECKET.roleSet);
      const params = withDefaults(WAIT_OUT, { crossTo: "mirror" }, 64);
      for (const [station, end] of Object.entries(WAIT_OUT.ends(group, params))) {
        worst = Math.max(worst, dist(end.p, next.get(plan.members[station]!)!));
        checked += 1;
      }
    }
    expect(checked).toBe(4);
    expect(worst).toBeLessThan(CLOSURE_PX);
  });

  it("turns the waiting couple round to face the other way", () => {
    const state = set(8);
    const plan = BECKET.groupsFor(HANDS_FOUR_GROUP, state).find((p) => p.kind !== "set")!;
    const group = createGroup(plan, BECKET.roleSet);
    const params = withDefaults(WAIT_OUT, { crossTo: "mirror" }, 64);
    const ends = WAIT_OUT.ends(group, params);
    for (const station of plan.stations) {
      const started = stationPose(plan.frame, station).facing;
      expect(((ends[station.id]!.facing - started) % 360) + 360).toBeCloseTo(360 + 180, 9);
    }
  });
});

/** M2: the seam-scoped `"shadow-pair"` partition, for becket. */
describe("shadow-pair (becket)", () => {
  for (const couples of [4, 5, 6, 8, 9, 12]) {
    it(`is a partition of the whole set at ${String(couples)} couples`, () => {
      const state = set(couples);
      const plans = BECKET.groupsFor(SHADOW_PAIR_GROUP, state);
      expect(partitionProblems(plans, state)).toEqual([]);
      assertPartition(plans, state);
    });
  }

  it("has interior seams of four, and true ends of two, never eight (Q9)", () => {
    const plans = BECKET.groupsFor(SHADOW_PAIR_GROUP, set(8));
    for (const plan of plans) {
      expect([2, 4]).toContain(plan.stations.length);
      expect(new Set(Object.values(plan.members)).size).toBe(Object.values(plan.members).length);
    }
    expect(plans.some((p) => p.stations.length === 4)).toBe(true);
  });

  it('who: "shadow" resolves through tags("shadow-pair") the way who: "neighbors" resolves through tags("hands-four")', () => {
    const plans = BECKET.groupsFor(SHADOW_PAIR_GROUP, set(8));
    const seam = plans.find((p) => p.stations.length === 4)!;
    const shadowSelected = resolveSelector("shadow", BECKET, SHADOW_PAIR_GROUP, seam.stations);
    expect(new Set(shadowSelected)).toEqual(new Set(["NL", "NR", "FL", "FR"]));

    const handsFour = BECKET.groupsFor(HANDS_FOUR_GROUP, set(4)).find(
      (p) => p.stations.length === 4,
    )!;
    const neighborsSelected = resolveSelector(
      "neighbors",
      BECKET,
      HANDS_FOUR_GROUP,
      handsFour.stations,
    );
    expect(new Set(neighborsSelected)).toEqual(new Set(["1L", "1R", "2L", "2R"]));
  });
});

/** M2: `"line"`, for becket — widened only at a true end. */
describe("line (becket)", () => {
  for (const couples of [4, 5, 6, 8, 9]) {
    it(`is a partition of the whole set at ${String(couples)} couples`, () => {
      const state = set(couples);
      const plans = BECKET.groupsFor(LINE_GROUP, state);
      expect(partitionProblems(plans, state)).toEqual([]);
      assertPartition(plans, state);
    });
  }

  it("is identical to hands-four in every interior minor set, at three dancing places", () => {
    const state = set(8); // three dancing places (0,1,2); only the outer two widen
    const line = BECKET.groupsFor(LINE_GROUP, state);
    const handsFour = BECKET.groupsFor(HANDS_FOUR_GROUP, state).filter(
      (p) => p.stations.length === 4,
    );
    expect(handsFour).toHaveLength(3);
    // The middle dancing place (index 1 of 3) is nobody's true end, so its
    // "line" plan is untouched — still four stations, same members.
    const middle = line.find((p) => p.stations.length === 4)!;
    expect(line.filter((p) => p.stations.length === 4)).toHaveLength(1);
    const middleHandsFour = handsFour.find((p) => p.frame.centre[1] === middle.frame.centre[1])!;
    expect(middle.members).toEqual(middleHandsFour.members);
  });

  it("widens the two outer dancing places to six stations at an even set's two true ends", () => {
    const state = set(8);
    const sizes = BECKET.groupsFor(LINE_GROUP, state)
      .map((p) => p.stations.length)
      .sort((a, b) => a - b);
    // Three dancing places: the two outer ones widen (six each), the one in
    // the middle stays four, and no separate wait plan remains (both waits
    // are single couples fully absorbed).
    expect(sizes).toEqual([4, 6, 6]);
  });

  it('tags("line")\'s wait-top/wait-bottom filter to whichever end an instance actually widened', () => {
    const state = set(8);
    const tags = BECKET.tags(LINE_GROUP);
    const widened = BECKET.groupsFor(LINE_GROUP, state).filter((p) => p.stations.length === 6);
    expect(widened).toHaveLength(2);
    const topOne = widened.find((p) =>
      p.stations.map((s) => s.id).some((id) => tags["wait-top"]!.includes(id)),
    )!;
    const bottomOne = widened.find((p) =>
      p.stations.map((s) => s.id).some((id) => tags["wait-bottom"]!.includes(id)),
    )!;
    expect(topOne.id).not.toBe(bottomOne.id);
  });
});
