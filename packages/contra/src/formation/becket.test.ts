import type { DancerId, SetState, Vec2 } from "@caller/choreo";
import { WAIT_OUT, createGroup, dist, stationPose, withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import {
  BECKET,
  BECKET_STATIONS,
  BECKET_TOP_OFFSET_PX,
  BECKET_WAIT_STATIONS,
  COUPLE_PITCH_PX,
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
  for (const plan of BECKET.groups(state)) {
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
    const parts = BECKET.groups(state);
    expect(parts.map((p) => p.kind)).toEqual(["wait", "set", "set", "set", "wait"]);
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
    expect(BECKET.groups(state).map((p) => p.kind)).toEqual(["wait", "set", "wait", "wait"]);
    let next = state;
    for (let cycle = 0; cycle < 6; cycle++) {
      next = BECKET.progression.next(next);
      expect(next.couples).toHaveLength(5);
      expect(BECKET.groups(next).filter((p) => p.kind === "set").length).toBeGreaterThan(0);
    }
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
    const shape = (s: SetState) => BECKET.groups(s).map((p) => p.kind);
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
    for (const plan of BECKET.groups(state).filter((p) => p.kind === "wait")) {
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
    for (const plan of BECKET.groups(state).filter((p) => p.kind === "wait")) {
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
    const plan = BECKET.groups(state).find((p) => p.kind === "wait")!;
    const group = createGroup(plan, BECKET.roleSet);
    const params = withDefaults(WAIT_OUT, { crossTo: "mirror" }, 64);
    const ends = WAIT_OUT.ends(group, params);
    for (const station of plan.stations) {
      const started = stationPose(plan.frame, station).facing;
      expect(((ends[station.id]!.facing - started) % 360) + 360).toBeCloseTo(360 + 180, 9);
    }
  });
});
