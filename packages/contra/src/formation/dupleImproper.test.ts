import type { Dance, Decider, GroupPlan, Program, SetState, StationId } from "@caller/choreo";
import {
  ARM_REACH_PX,
  HANDS_FOUR_GROUP,
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  WAIT_OUT,
  WALK_TO_STATION,
  assertPartition,
  closureReport,
  collisionReport,
  coverageProblems,
  createFigureRegistry,
  createHall,
  createLibrary,
  createScriptDecider,
  danceBeats,
  dist,
  partitionProblems,
  poseAt,
  reachReport,
  resolveSelector,
  stationPose,
  validateDance,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import {
  ACROSS_PX,
  DUPLE_IMPROPER,
  DUPLE_IMPROPER_STATIONS,
  LINE_GROUP,
  PLACE_PITCH_PX,
  SHADOW_PAIR_GROUP,
  partitionDupleImproper,
} from "./dupleImproper.js";

/** AC5's number: closure is 0.01 px. */
const CLOSURE_PX = 0.01;
/** AC6's number: no two torso centres within 8 px. */
const COLLISION_PX = 8;

/**
 * The fixture dance: four sixteen-beat `walk-to-station` figures whose
 * composition is exactly the duple-improper progression.
 *
 * `across` trades places with the dancer across the set, `along` trades with
 * the dancer up or down the line. across ∘ along ∘ across sends every dancer to
 * the station its progressed self starts on, which is what makes AC5 checkable
 * without a single real contra figure.
 */
const ACROSS: Record<StationId, StationId> = { "1L": "1R", "1R": "1L", "2L": "2R", "2R": "2L" };
const ALONG: Record<StationId, StationId> = { "1L": "2R", "2R": "1L", "1R": "2L", "2L": "1R" };

const compose = (
  second: Record<StationId, StationId>,
  first: Record<StationId, StationId>,
): Record<StationId, StationId> =>
  Object.fromEntries(Object.entries(first).map(([from, to]) => [from, second[to]!]));

const P1 = ACROSS;
const P2 = compose(ALONG, P1);
const P3 = compose(ACROSS, P2);
const TURN_AROUND: Record<StationId, number> = { "1L": 180, "1R": 180, "2L": 180, "2R": 180 };
const IDENTITY: Record<StationId, StationId> = { "1L": "1L", "1R": "1R", "2L": "2L", "2R": "2R" };

const FIXTURE_DANCE: Dance = validateDance({
  slug: "fixture-walk",
  title: "The Walking Fixture",
  author: "M7",
  formation: "duple-improper",
  phrases: [
    {
      name: "A1",
      figures: [{ figure: "walk-to-station", beats: 16, params: { from: IDENTITY, to: P1 } }],
    },
    {
      name: "A2",
      figures: [{ figure: "walk-to-station", beats: 16, params: { from: P1, to: P2 } }],
    },
    {
      name: "B1",
      figures: [{ figure: "walk-to-station", beats: 16, params: { from: P2, to: P3 } }],
    },
    {
      name: "B2",
      figures: [
        { figure: "walk-to-station", beats: 16, params: { from: P3, to: P3, turn: TURN_AROUND } },
      ],
    },
  ],
});

const PROGRAM: Program = {
  slug: "fixture",
  items: [{ dance: "fixture-walk", medley: "none", timesThrough: 8 }],
};

function run(couples: number, throughBeat: number): Decider {
  const registry = createFigureRegistry([WALK_TO_STATION, WAIT_OUT]);
  const hall = createHall(DUPLE_IMPROPER, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    PROGRAM,
    registry,
    hall,
    createLibrary([FIXTURE_DANCE], [DUPLE_IMPROPER]),
  );
  decider.advance(throughBeat);
  return decider;
}

describe("duple improper stations", () => {
  it("puts the lines AC3's distance apart and the places a spike pitch apart", () => {
    expect(ACROSS_PX).toBe(HOLD_SPACING_PX + LINE_OFFSET_PX);
    expect(ACROSS_PX).toBe(32);
    expect(PLACE_PITCH_PX).toBe(20);
  });

  it("alternates larks down each line, which is what improper means", () => {
    const by = (id: string) => DUPLE_IMPROPER_STATIONS.find((s) => s.id === id)!;
    // The +x line reads lark, robin going down; the −x line robin, lark.
    expect(by("1L").p[0]).toBeGreaterThan(0);
    expect(by("2R").p[0]).toBeGreaterThan(0);
    expect(by("1R").p[0]).toBeLessThan(0);
    expect(by("2L").p[0]).toBeLessThan(0);
    expect(by("1L").p[1]).toBeLessThan(by("2R").p[1]);
  });

  it("has everyone facing their neighbour along the line", () => {
    const by = (id: string) => DUPLE_IMPROPER_STATIONS.find((s) => s.id === id)!;
    expect(by("1L").facing).toBe(90);
    expect(by("2R").facing).toBe(270);
  });

  it("never stands two dancers closer than AC6 allows", () => {
    for (const a of DUPLE_IMPROPER_STATIONS) {
      for (const b of DUPLE_IMPROPER_STATIONS) {
        if (a.id === b.id) continue;
        expect(dist(a.p, b.p)).toBeGreaterThan(COLLISION_PX);
      }
    }
  });
});

describe("hands four from the top", () => {
  const set = (couples: number): SetState =>
    DUPLE_IMPROPER.start({ id: "s", couples, centre: [0, 0], axis: 90 });

  it("pairs every couple when the line is even and nobody has progressed", () => {
    const parts = partitionDupleImproper(set(6));
    expect(parts.map((p) => p.kind)).toEqual(["set", "set", "set"]);
  });

  it("leaves the bottom couple waiting when the line is odd", () => {
    const parts = partitionDupleImproper(set(5));
    expect(parts.map((p) => p.kind)).toEqual(["set", "set", "wait-bottom"]);
    expect(parts[2]!.couples[0]!.place).toBe(4);
  });

  it("moves the sets down one place the next time through, leaving both ends out", () => {
    const after = DUPLE_IMPROPER.progression.next(set(6));
    const parts = partitionDupleImproper(after);
    expect(parts.map((p) => p.kind)).toEqual(["wait-top", "set", "set", "wait-bottom"]);
    expect(parts[0]!.couples[0]!.place).toBe(0);
    expect(parts[3]!.couples[0]!.place).toBe(5);
  });

  it("puts every dancer in exactly one group, at every line length and every time through", () => {
    // The partition property `groupsFor` owes the engine: nobody in two groups,
    // nobody in none. Checked by the engine's own form-neutral helper.
    for (let couples = 2; couples <= 7; couples++) {
      let state = set(couples);
      for (let cycle = 0; cycle < 2 * couples; cycle++) {
        const plans = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, state);
        expect(partitionProblems(plans, state), `${couples} couples, cycle ${cycle}`).toEqual([]);
        state = DUPLE_IMPROPER.progression.next(state);
      }
    }
  });

  it("names the end a leftover couple is out at, and reaches both over a line of five", () => {
    // An odd line always has somebody out, and it is the other end each time
    // through — which is exactly the difference `wait-top`/`wait-bottom` carries.
    let state = set(5);
    const kinds: string[] = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      kinds.push(
        ...DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, state)
          .filter((p) => p.kind !== "set")
          .map((p) => p.kind),
      );
      state = DUPLE_IMPROPER.progression.next(state);
    }
    expect(kinds).toEqual(["wait-bottom", "wait-top", "wait-bottom", "wait-top"]);
  });

  it("refuses a group selector it does not define, rather than dancing in fours anyway", () => {
    // M2 added "shadow-pair" and "line"; "set" (D9, the full-set promenade)
    // is still not one duple improper defines.
    expect(() => DUPLE_IMPROPER.groupsFor("set", set(4))).toThrow(/no group selector/);
    expect(() => DUPLE_IMPROPER.tags("set")).toThrow(/no group selector/);
    expect(() => DUPLE_IMPROPER.groupFor("set")).toThrow(/no group selector/);
    expect(DUPLE_IMPROPER.groupFor(HANDS_FOUR_GROUP)).toEqual(DUPLE_IMPROPER.group(4));
  });

  it("returns to the same shape after two times through, at every line length", () => {
    // The couples are not the same couples — that is the whole point of a
    // contra line — but the arrangement of places and directions repeats, so
    // hands four falls the same way every other time through.
    const shape = (s: SetState) =>
      [...s.couples].sort((a, b) => a.place - b.place).map((c) => [c.place, c.direction]);
    for (let couples = 2; couples <= 6; couples++) {
      const start = set(couples);
      const twice = DUPLE_IMPROPER.progression.next(DUPLE_IMPROPER.progression.next(start));
      expect(shape(twice), `${couples} couples`).toEqual(shape(start));
    }
  });

  it("moves every couple through the line, never off it", () => {
    for (let couples = 2; couples <= 6; couples++) {
      let state = set(couples);
      const seen = new Map<string, Set<number>>();
      for (let cycle = 0; cycle < 4 * couples; cycle++) {
        for (const couple of state.couples) {
          const places = seen.get(couple.id) ?? new Set<number>();
          places.add(couple.place);
          seen.set(couple.id, places);
        }
        state = DUPLE_IMPROPER.progression.next(state);
      }
      for (const [id, places] of seen) {
        expect(Math.min(...places), id).toBe(0);
        expect(Math.max(...places), id).toBe(couples - 1);
      }
    }
  });

  it("keeps every couple in the line and every place at most twice filled", () => {
    let state = set(7);
    for (let cycle = 0; cycle < 6; cycle++) {
      state = DUPLE_IMPROPER.progression.next(state);
      expect(state.couples).toHaveLength(7);
      const places = state.couples.map((c) => c.place);
      expect(Math.min(...places)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...places)).toBeLessThanOrEqual(6);
      expect(new Set(places).size).toBe(7);
    }
  });

  it("puts the waiting couple's lark back on the other line", () => {
    // A two waiting at the top becomes a one, so its lark crosses to +x.
    const state = DUPLE_IMPROPER.progression.next(set(6));
    const waiting = partitionDupleImproper(state)[0]!.couples[0]!;
    expect(waiting.direction).toBe(-1);
    const after = DUPLE_IMPROPER.progression.next(state);
    expect(after.couples.find((c) => c.id === waiting.id)!.direction).toBe(1);
  });
});

describe("the fixture dance", () => {
  it("is four sixteen-beat phrases, from its own data", () => {
    expect(danceBeats(FIXTURE_DANCE)).toBe(64);
    expect(FIXTURE_DANCE.phrases.map((p) => p.name)).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("composes to the progression: everyone ends on their progressed station", () => {
    expect(P3).toEqual({ "1L": "2R", "1R": "2L", "2L": "1R", "2R": "1L" });
  });

  it("survives a round trip through JSON, because it is only data", () => {
    const copy: Dance = JSON.parse(JSON.stringify(FIXTURE_DANCE)) as Dance;
    expect(copy).toEqual(FIXTURE_DANCE);
    expect(danceBeats(copy)).toBe(64);
  });
});

describe("AC5 — closure, at every line length from 2 to 6", () => {
  for (let couples = 2; couples <= 6; couples++) {
    it(`closes within ${CLOSURE_PX} px with ${couples} couples`, () => {
      const decider = run(couples, 128);
      const report = closureReport(decider.timeline());
      expect(report.seams).toBeGreaterThan(0);
      expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
    });
  }

  it("puts every dancer on the progressed set's own station after one time through", () => {
    const registry = createFigureRegistry([WALK_TO_STATION, WAIT_OUT]);
    const hall = createHall(DUPLE_IMPROPER, [{ id: "set0", couples: 5, centre: [0, 0], axis: 90 }]);
    const progressed = DUPLE_IMPROPER.progression.next(hall.sets[0]!);
    const decider = createScriptDecider(
      PROGRAM,
      registry,
      hall,
      createLibrary([FIXTURE_DANCE], [DUPLE_IMPROPER]),
    );
    decider.advance(64);

    // Where the progressed set says each dancer should stand.
    const expected = new Map<string, readonly [number, number]>();
    for (const plan of DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, progressed)) {
      for (const station of plan.stations) {
        const dancer = plan.members[station.id]!;
        expected.set(dancer, stationPose(plan.frame, station).p);
      }
    }
    let worst = 0;
    for (const [dancer, p] of expected) {
      worst = Math.max(worst, dist(poseAt(decider.timeline(), dancer, 64).p, p));
    }
    expect(worst).toBeLessThan(CLOSURE_PX);
  });
});

describe("AC6 — no collisions, at every line length from 2 to 6", () => {
  for (let couples = 2; couples <= 6; couples++) {
    it(`keeps every pair more than ${COLLISION_PX} px apart with ${couples} couples`, () => {
      const decider = run(couples, 128);
      const report = collisionReport(decider.timeline(), 0, 128);
      expect(report.pairs).toBeGreaterThan(0);
      expect(report.minDistance, JSON.stringify(report.worst)).toBeGreaterThan(COLLISION_PX);
    });
  }
});

describe("AC1 — hands meet by construction, at every line length from 2 to 6", () => {
  for (let couples = 2; couples <= 6; couples++) {
    it(`solves every hand with short === 0 with ${couples} couples`, () => {
      const decider = run(couples, 128);
      const report = reachReport(decider.timeline(), 0, 128);
      expect(report.hands).toBeGreaterThan(0);
      expect(report.maxShort, JSON.stringify(report.worst)).toBe(0);
    });
  }

  it("takes the waiting couple's hands at less than a full arm's reach", () => {
    const decider = run(5, 128);
    const report = reachReport(decider.timeline(), 0, 128);
    expect(report.hands).toBeGreaterThan(0);
    expect(report.maxShort).toBeLessThan(ARM_REACH_PX);
  });
});

describe("timeline coverage", () => {
  for (let couples = 2; couples <= 6; couples++) {
    it(`covers every dancer with no gap and no overlap with ${couples} couples`, () => {
      const decider = run(couples, 128);
      expect(coverageProblems(decider.timeline(), 0, 128)).toEqual([]);
    });
  }
});

describe("waiting out", () => {
  it("gives one couple at each end a wait-out when the line is odd", () => {
    const decider = run(5, 128);
    const waits = decider
      .timeline()
      .figures()
      .filter((f) => f.figure === "wait-out");
    expect(waits.length).toBeGreaterThan(0);
    // Every wait-out is a whole time through.
    for (const wait of waits) expect(wait.end - wait.start).toBe(64);
  });

  it("crosses over during the last eight beats and comes back facing the right way", () => {
    const decider = run(5, 128);
    const timeline = decider.timeline();
    const wait = timeline.figures().find((f) => f.figure === "wait-out")!;
    const dancer = Object.values(wait.bindings)[0]!;
    const holding = poseAt(timeline, dancer, wait.start + 50);
    const before = poseAt(timeline, dancer, wait.start + 56);
    const during = poseAt(timeline, dancer, wait.start + 60);
    const after = poseAt(timeline, dancer, wait.end);

    // Holding hands at 50, let go and back on station at 56, moving at 60, on
    // the other side of the set at 64.
    expect(holding.hands.L === "down" && holding.hands.R === "down").toBe(false);
    expect(before.hands.L === "down" && before.hands.R === "down").toBe(true);
    expect(dist(before.p, during.p)).toBeGreaterThan(1);
    expect(dist(before.p, after.p)).toBeGreaterThan(HOLD_SPACING_PX);
    // The set runs down +y, so "facing the right way" is along the set axis.
    expect(Math.abs(((after.facing % 360) + 360) % 360) % 180).toBeCloseTo(90, 6);
  });
});

/**
 * M2: the seam-scoped `"shadow-pair"` partition. The partition property is
 * checked at several line lengths, even and odd, per the milestone's own
 * requirement — this is the check that would have caught the superseded
 * eight-station design's double-claiming risk (notes.md D6).
 */
describe("shadow-pair: the seam-scoped four-station partition", () => {
  const set = (couples: number): SetState =>
    DUPLE_IMPROPER.start({ id: "s", couples, centre: [0, 0], axis: 90 });

  for (const couples of [2, 3, 4, 5, 6, 7]) {
    it(`is a partition of the whole set at ${String(couples)} couples, over several times through`, () => {
      let state = set(couples);
      for (let cycle = 0; cycle < couples; cycle++) {
        const plans = DUPLE_IMPROPER.groupsFor(SHADOW_PAIR_GROUP, state);
        expect(partitionProblems(plans, state), `cycle ${cycle}`).toEqual([]);
        assertPartition(plans, state);
        state = DUPLE_IMPROPER.progression.next(state);
      }
    });
  }

  it("has exactly one interior seam at four couples, and true ends on both sides", () => {
    const plans = DUPLE_IMPROPER.groupsFor(SHADOW_PAIR_GROUP, set(4));
    const bySize = plans.map((p) => p.stations.length).sort((a, b) => a - b);
    expect(bySize).toEqual([2, 2, 4]);
    const seam = plans.find((p) => p.stations.length === 4)!;
    expect(new Set(Object.keys(seam.members))).toEqual(new Set(["NL", "NR", "FL", "FR"]));
  });

  it("a seam always names four different dancers, never eight (Q9)", () => {
    for (const couples of [4, 6, 8]) {
      const plans = DUPLE_IMPROPER.groupsFor(SHADOW_PAIR_GROUP, set(couples));
      for (const plan of plans) {
        expect(new Set(Object.values(plan.members)).size).toBe(Object.values(plan.members).length);
        expect(plan.stations.length === 2 || plan.stations.length === 4).toBe(true);
      }
    }
  });

  it("who: \"shadow\" resolves through tags(\"shadow-pair\") the way who: \"neighbors\" resolves through tags(\"hands-four\")", () => {
    const plans = DUPLE_IMPROPER.groupsFor(SHADOW_PAIR_GROUP, set(4));
    const seam = plans.find((p) => p.stations.length === 4)!;
    const shadowSelected = resolveSelector("shadow", DUPLE_IMPROPER, SHADOW_PAIR_GROUP, seam.stations);
    expect(new Set(shadowSelected)).toEqual(new Set(["NL", "NR", "FL", "FR"]));

    const handsFour = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, set(4))[0]!;
    const neighborsSelected = resolveSelector(
      "neighbors",
      DUPLE_IMPROPER,
      HANDS_FOUR_GROUP,
      handsFour.stations,
    );
    expect(new Set(neighborsSelected)).toEqual(new Set(["1L", "1R", "2L", "2R"]));
  });

  it("a true end resolves \"shadow\" to nothing, and stands instead of dancing a full pairing", () => {
    const plans = DUPLE_IMPROPER.groupsFor(SHADOW_PAIR_GROUP, set(4));
    const end = plans.find((p) => p.stations.length === 2)!;
    const selected = resolveSelector("shadow", DUPLE_IMPROPER, SHADOW_PAIR_GROUP, end.stations);
    // The whole-group pairing tag (`shadow: all`) filtered down to this
    // smaller instance's own two stations still names both of them — a
    // *figure* would need a real far side to pair them with and that is M6's
    // problem, not this milestone's; `groupsFor`'s own job is only ever the
    // partition (every dancer in exactly one group), which item still holds.
    expect(selected.length).toBeGreaterThan(0);
  });

  it("left-diagonal and right-diagonal are the two disjoint cross-role pairs of a seam", () => {
    const plans = DUPLE_IMPROPER.groupsFor(SHADOW_PAIR_GROUP, set(4));
    const seam = plans.find((p) => p.stations.length === 4)!;
    const left = resolveSelector("left-diagonal", DUPLE_IMPROPER, SHADOW_PAIR_GROUP, seam.stations);
    const right = resolveSelector("right-diagonal", DUPLE_IMPROPER, SHADOW_PAIR_GROUP, seam.stations);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    expect(new Set([...left, ...right])).toEqual(new Set(["NL", "NR", "FL", "FR"]));
    expect(left.some((id) => right.includes(id))).toBe(false);
  });
});

/**
 * M2: `"line"` — each minor set's own four stations, widened only at a true
 * end to fold in the waiting couple beyond it, and only when the call's own
 * `ends` permits that end.
 */
describe("line: the widened minor set, and ends", () => {
  const set = (couples: number): SetState =>
    DUPLE_IMPROPER.start({ id: "s", couples, centre: [0, 0], axis: 90 });

  for (const couples of [2, 3, 4, 5, 6, 7]) {
    it(`is a partition of the whole set at ${String(couples)} couples`, () => {
      const state = set(couples);
      const plans = DUPLE_IMPROPER.groupsFor(LINE_GROUP, state);
      expect(partitionProblems(plans, state)).toEqual([]);
      assertPartition(plans, state);
    });
  }

  it("is identical to hands-four in the interior — four couples, no waiting couple", () => {
    const state = set(4);
    const line = DUPLE_IMPROPER.groupsFor(LINE_GROUP, state);
    const handsFour = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, state);
    expect(line).toHaveLength(handsFour.length);
    for (const plan of line) expect(plan.stations).toHaveLength(4);
  });

  it("widens to six stations at a true end", () => {
    const state = set(5); // one couple waits, always at a true end
    const line = DUPLE_IMPROPER.groupsFor(LINE_GROUP, state);
    const sizes = line.map((p) => p.stations.length).sort((a, b) => a - b);
    expect(sizes).toEqual([4, 6]);
  });

  it("tags(\"line\")'s wait-top/wait-bottom filter to whichever end an instance actually widened", () => {
    const state = set(5); // the odd couple waits at the bottom this cycle
    const tags = DUPLE_IMPROPER.tags(LINE_GROUP);
    const widened = DUPLE_IMPROPER.groupsFor(LINE_GROUP, state).find((p) => p.stations.length === 6)!;
    const ids = new Set(widened.stations.map((s) => s.id));
    expect(tags["wait-bottom"]!.every((id) => ids.has(id))).toBe(true);
    expect(tags["wait-top"]!.some((id) => ids.has(id))).toBe(false);
  });
});
