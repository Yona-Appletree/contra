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
  BECKET_SHIFT_PLACES,
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

/** What kind of group each place of the set holds, top to bottom. */
const shape = (state: SetState): string[] =>
  BECKET.groupsFor(HANDS_FOUR_GROUP, state).map((p) => p.kind);

describe("becket stations", () => {
  it("keeps the lines a duple line's width apart and the couples twice a place apart", () => {
    expect(COUPLE_PITCH_PX).toBe(PLACE_PITCH_PX * 2);
    const xs = new Set(BECKET_STATIONS.map((s) => s.p[0]));
    expect([...xs].sort((a, b) => a - b)).toEqual([-ACROSS_PX / 2, ACROSS_PX / 2]);
  });

  it("exposes the along-hall length of one minor set, one couple-place wide (T6)", () => {
    // Unlike duple improper, becket's two minor-set couples share one place —
    // a minor set is one couple place along the hall — so that, not twice it,
    // is the along-hall period. (The *slide* is half of it since FR-C2; the
    // period of the pattern is not.)
    expect(BECKET.hallPitch).toBe(COUPLE_PITCH_PX);
    expect(BECKET.hallPitch).toBe(40);
  });

  it("slides half a couple width a time through — one dancer position (FR-C2)", () => {
    // DD54, the user's own words: "its really shift half-way, isn't it?" The two
    // lines slide opposite ways, so they pass each other one whole couple width.
    expect(BECKET_SHIFT_PLACES).toBe(0.5);
    expect(BECKET_SHIFT_PLACES * COUPLE_PITCH_PX).toBe(PLACE_PITCH_PX);
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
  it("lays an even hall out with every couple dancing, and two out the next time through", () => {
    // FR-C2: both lines start on the same couple places, which is where a hall
    // that has taken hands four and moved one place round stands. A time
    // through later the two grids are half a place out of step and the couple
    // at each end has nobody across from it.
    const state = set(8);
    expect(state.couples).toHaveLength(8);
    expect(shape(state)).toEqual(["set", "set", "set", "set"]);
    expect(shape(BECKET.progression.next(state))).toEqual([
      "wait-top",
      "set",
      "set",
      "set",
      "wait-bottom",
    ]);
  });

  it("refuses a hall too small to make a becket line", () => {
    expect(() => set(2)).toThrow(/at least four/);
  });

  it("stands one couple out of a seven-couple hall, at the other end each time", () => {
    // S2, the user's own ruling: "in our sim it starts with two couples out at
    // the bottom on the right set. that is not right." A real line of seven
    // dances three hands-fours and stands **one** couple out. Since FR-C2 the
    // end it is out at alternates, exactly as an odd duple improper line's does
    // — the relative motion of the two lines is the same one couple place.
    const state = set(7);
    expect(state.couples).toHaveLength(7);
    expect(shape(state)).toEqual(["set", "set", "set", "wait-bottom"]);

    /** Who is out, and where, each time through. */
    const out = (s: SetState): string => {
      const waiting = BECKET.groupsFor(HANDS_FOUR_GROUP, s).filter((p) => p.kind !== "set");
      expect(waiting).toHaveLength(1);
      const plan = waiting[0]!;
      const couple = s.couples.find((c) => c.id === plan.couples[0])!;
      return `${couple.id}@${String(couple.place)}:${plan.kind}`;
    };

    let next = state;
    const seen: string[] = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      expect(
        BECKET.groupsFor(HANDS_FOUR_GROUP, next).filter((p) => p.kind === "set"),
        `time through ${String(cycle + 1)}`,
      ).toHaveLength(3);
      seen.push(out(next));
      next = BECKET.progression.next(next);
      expect(next.couples).toHaveLength(7);
    }
    expect(seen).toEqual([
      "b/c6@3:wait-bottom",
      "b/c0@-0.5:wait-top",
      "b/c5@3:wait-bottom",
      "b/c2@-0.5:wait-top",
    ]);
  });

  it("stands one couple out of a five-couple hall, and is back where it began after ten", () => {
    // Ten, not five: a becket couple slides **half** a couple place a time
    // through since FR-C2, so it takes two of them to move one place along its
    // own line and `2 × couples` to travel the whole ring.
    const state = set(5);
    expect(state.couples).toHaveLength(5);
    expect(shape(state)).toEqual(["set", "set", "wait-bottom"]);
    let next = state;
    const seen: string[] = [];
    for (let cycle = 0; cycle < 10; cycle++) {
      const waiting = BECKET.groupsFor(HANDS_FOUR_GROUP, next).filter((p) => p.kind !== "set");
      expect(BECKET.groupsFor(HANDS_FOUR_GROUP, next).filter((p) => p.kind === "set")).toHaveLength(
        2,
      );
      expect(waiting).toHaveLength(1);
      seen.push(waiting[0]!.couples[0]!);
      next = BECKET.progression.next(next);
    }
    // Every couple out exactly twice — once at each end — and then the ring
    // closes on the set `start` built.
    const counted = new Map<string, number>();
    for (const id of seen) counted.set(id, (counted.get(id) ?? 0) + 1);
    expect([...counted.keys()].sort()).toEqual(["b/c0", "b/c1", "b/c2", "b/c3", "b/c4"]);
    expect([...new Set(counted.values())]).toEqual([2]);
    const seats = (s: SetState) =>
      [...s.couples]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((c) => `${c.id}@${String(c.place)}/${String(c.direction)}`);
    expect(seats(next)).toEqual(seats(state));
  });

  it("never crosses anybody straight over, at either parity (FR-C2)", () => {
    // S2's odd line needed a couple to cross with no time out, because a
    // whole-place slide left it one couple short of two waiting places. A
    // half-place slide never does: everybody who runs past the end of a line
    // stands out for a time through first, so nothing is ever marked
    // `crossedOver`.
    for (const couples of [4, 5, 6, 7, 8, 9]) {
      let state = set(couples);
      for (let cycle = 0; cycle < 2 * couples; cycle++) {
        state = BECKET.progression.next(state);
        expect(
          state.couples.filter((c) => c.crossedOver === true),
          `${String(couples)} couples, cycle ${String(cycle)}`,
        ).toEqual([]);
        for (const plan of BECKET.groupsFor(HANDS_FOUR_GROUP, state)) {
          expect(plan.stations.filter((s) => s.crossedOver === true)).toEqual([]);
        }
      }
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

  it("lays its topmost dancer out where a duple improper line's first dancer stands", () => {
    // A hall hands both formations the same point for a line. The topmost
    // dancer a becket set ever has is the lark of the couple standing out
    // beyond the top, which is there on the times through when the two grids
    // are half a place out of step — so the reach of the set over a whole
    // pair of times through begins at the point the hall handed it.
    const state = set(8);
    const ys = [...places(state).values(), ...places(BECKET.progression.next(state)).values()].map(
      (p) => p[1],
    );
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    expect(BECKET_TOP_OFFSET_PX).toBe(PLACE_PITCH_PX + PLACE_PITCH_PX / 2);
  });

  it("keeps the same two shapes, alternating, every time through", () => {
    // The two grids fall in and out of step, so an even hall dances every couple
    // one time through and stands one couple out at each end the next.
    let state = set(10);
    const first = shape(state);
    expect(first).toEqual(["set", "set", "set", "set", "set"]);
    for (let cycle = 0; cycle < 6; cycle++) {
      state = BECKET.progression.next(state);
      expect(shape(state)).toEqual(
        cycle % 2 === 0
          ? ["wait-top", "set", "set", "set", "set", "wait-bottom"]
          : ["set", "set", "set", "set", "set"],
      );
      expect(state.couples).toHaveLength(10);
    }
  });

  it("slides each line half a place to its own left and turns the end couples round", () => {
    const state = BECKET.progression.next(set(8));
    const before = new Map(state.couples.map((c) => [c.id, c]));
    const after = BECKET.progression.next(state);
    let crossed = 0;
    for (const couple of after.couples) {
      const was = before.get(couple.id)!;
      if (was.place === -0.5 || was.place === 3.5) {
        // A couple standing out beyond the end comes back in on the other line,
        // the same half place along.
        expect(couple.direction).toBe(-was.direction);
        expect(couple.place).toBe(was.place + was.direction * BECKET_SHIFT_PLACES);
        crossed += 1;
      } else {
        expect(couple.direction).toBe(was.direction);
        expect(couple.place).toBe(was.place - was.direction * BECKET_SHIFT_PLACES);
      }
    }
    expect(crossed).toBe(2);
  });

  it("stands a waiting couple on its own line, half a place beyond the end", () => {
    const state = BECKET.progression.next(set(8));
    const standing = places(state);
    const waits = BECKET.groupsFor(HANDS_FOUR_GROUP, state).filter((p) => p.kind !== "set");
    expect(waits).toHaveLength(2);
    for (const plan of waits) {
      const couple = state.couples.find((c) => c.id === plan.couples[0])!;
      const points = plan.stations.map((s) => standing.get(plan.members[s.id]!)!);
      for (const p of points) {
        expect(Math.abs(p[0])).toBeCloseTo(ACROSS_PX / 2, 9);
      }
      // The couple's own two dancers are a place apart along the line, and its
      // own place is where the lattice says it is.
      const centre = BECKET_TOP_OFFSET_PX + couple.place * COUPLE_PITCH_PX;
      expect(points.map((p) => p[1] - centre).sort((a, b) => a - b)).toEqual([
        -PLACE_PITCH_PX / 2,
        PLACE_PITCH_PX / 2,
      ]);
      expect(dist(points[0]!, points[1]!)).toBeCloseTo(PLACE_PITCH_PX, 9);
    }
  });
});

describe("the becket end effect closes", () => {
  it("puts every waiting couple within 0.01 px of where the next time through wants it", () => {
    const state = BECKET.progression.next(set(10));
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
    const state = BECKET.progression.next(set(8));
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
      for (const state of [set(couples), BECKET.progression.next(set(couples))]) {
        const plans = BECKET.groupsFor(LINE_GROUP, state);
        expect(partitionProblems(plans, state)).toEqual([]);
        assertPartition(plans, state);
      }
    });
  }

  it("is identical to hands-four in every interior minor set", () => {
    // One time through in, an eight-couple hall has three dancing places and a
    // couple out at each end; only the outer two widen.
    const state = BECKET.progression.next(set(8));
    const line = BECKET.groupsFor(LINE_GROUP, state);
    const handsFour = BECKET.groupsFor(HANDS_FOUR_GROUP, state).filter(
      (p) => p.stations.length === 4,
    );
    expect(handsFour).toHaveLength(3);
    const middle = line.find((p) => p.stations.length === 4)!;
    expect(line.filter((p) => p.stations.length === 4)).toHaveLength(1);
    const middleHandsFour = handsFour.find((p) => p.frame.centre[1] === middle.frame.centre[1])!;
    expect(middle.members).toEqual(middleHandsFour.members);
  });

  it("widens the two outer dancing places at an even set's two true ends, and neither when nobody is out", () => {
    const sizes = (state: SetState) =>
      BECKET.groupsFor(LINE_GROUP, state)
        .map((p) => p.stations.length)
        .sort((a, b) => a - b);
    // Nobody out: four plain fours.
    expect(sizes(set(8))).toEqual([4, 4, 4, 4]);
    // One out at each end: the two outer dancing places widen to six.
    expect(sizes(BECKET.progression.next(set(8)))).toEqual([4, 6, 6]);
  });

  it('tags("line")\'s wait-top/wait-bottom filter to whichever end an instance actually widened', () => {
    const state = BECKET.progression.next(set(8));
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
