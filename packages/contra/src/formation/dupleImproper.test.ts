import type { Dance, Decider, Program, SetState, StationId } from "@caller/choreo";
import {
  ARM_REACH_PX,
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  WAIT_OUT,
  WALK_TO_STATION,
  closureReport,
  collisionReport,
  coverageProblems,
  createFigureRegistry,
  createHall,
  createLibrary,
  createScriptDecider,
  danceBeats,
  dist,
  poseAt,
  reachReport,
  stationPose,
  validateDance,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import {
  ACROSS_PX,
  DUPLE_IMPROPER,
  DUPLE_IMPROPER_STATIONS,
  PLACE_PITCH_PX,
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
    { name: "A1", figures: [{ figure: "walk-to-station", beats: 16, params: { from: IDENTITY, to: P1 } }] },
    { name: "A2", figures: [{ figure: "walk-to-station", beats: 16, params: { from: P1, to: P2 } }] },
    { name: "B1", figures: [{ figure: "walk-to-station", beats: 16, params: { from: P2, to: P3 } }] },
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
  const hall = createHall(DUPLE_IMPROPER, [
    { id: "set0", couples, centre: [0, 0], axis: 90 },
  ]);
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
    expect(parts.map((p) => p.kind)).toEqual(["set", "set", "wait"]);
    expect(parts[2]!.couples[0]!.place).toBe(4);
  });

  it("moves the sets down one place the next time through, leaving both ends out", () => {
    const after = DUPLE_IMPROPER.progression.next(set(6));
    const parts = partitionDupleImproper(after);
    expect(parts.map((p) => p.kind)).toEqual(["wait", "set", "set", "wait"]);
    expect(parts[0]!.couples[0]!.place).toBe(0);
    expect(parts[3]!.couples[0]!.place).toBe(5);
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
    for (const plan of DUPLE_IMPROPER.groups(progressed)) {
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
