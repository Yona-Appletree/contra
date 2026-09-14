import type { Beat, PoseSample } from "@caller/core";
import { dirOf, dist, smooth } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { Dance, Program } from "../dance/Dance.js";
import { validateDance } from "../dance/Dance.js";
import type { EndPose, FigureDef, FigureParams } from "../figure/FigureDef.js";
import { createFigureRegistry } from "../figure/FigureDef.js";
import { joinHands } from "../figure/joinHands.js";
import { standing, walking } from "../figure/standing.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import { createHall } from "../formation/Formation.js";
import type { StationId } from "../formation/Formation.js";
import type { Group } from "../group/Group.js";
import { groupStation, groupStationPose } from "../group/Group.js";
import { createLibrary } from "../decider/Decider.js";
import { createScriptDecider } from "../decider/createScriptDecider.js";
import { poseAt } from "../timeline/poseAt.js";
import { closureReport, collisionReport, coverageProblems, reachReport } from "./oracles.js";
import { SQUARE, SQUARE_HEADS, SQUARE_RADIUS_PX, squareStations } from "./square.js";

/** AC5's number. */
const CLOSURE_PX = 0.01;
/** AC6's number. */
const COLLISION_PX = 8;

/** Who each head dances the figure with: their partner, beside them. */
const PARTNER: Record<StationId, StationId> = {
  "1L": "1R",
  "1R": "1L",
  "3L": "3R",
  "3R": "3L",
};

interface ForwardAndBackParams extends FigureParams {
  /** How far into the middle they go, in px. */
  reachPx: number;
  /** How far below shoulder height the joined hands are, in px. */
  holdDrop: number;
}

/**
 * "Heads forward and back", written here in the test file: the head couples
 * take inside hands, walk into the middle, and come back.
 *
 * It is a square-dance figure written against exactly the same `FigureDef` the
 * contra library uses, sampled by exactly the same `poseAt`, and scheduled by
 * exactly the same decider. That it works at all is the proof that nothing in
 * `@caller/choreo` assumes a contra.
 */
const FORWARD_AND_BACK: FigureDef<ForwardAndBackParams> = {
  id: "heads-forward-and-back",
  call: "HEADS FORWARD AND BACK",
  lead: 2,
  beats: 8,
  defaults: { reachPx: 8, holdDrop: 10 },

  sample(group: Group, station: StationId, t: Beat, params: ForwardAndBackParams): PoseSample {
    const half = params.beats / 2;
    const k = t <= half ? smooth(t / half) : smooth((params.beats - t) / half);
    const here = advanced(group, station, k, params);
    const partner = PARTNER[station];
    const pose =
      k > 0 && t > 0 && t < params.beats
        ? walking(here.p, here.facing)
        : standing(here.p, here.facing);
    if (partner === undefined) return pose;

    const there = advanced(group, partner, k, params);
    // One shared floor point: floating-point addition commutes, so both
    // dancers of the pair compute the identical point from this same frame.
    const point: [number, number] = [(here.p[0] + there.p[0]) / 2, (here.p[1] + there.p[1]) / 2];
    const myRole = groupStation(group, station).role;
    const joined = joinHands(
      point,
      params.holdDrop,
      [myRole, groupStation(group, partner).role],
      group.roleSet,
    );
    const hand = joined[myRole]!;
    // The partner stands to the dancer's right in a square, so the inside hand
    // is the right for the lark and the left for the robin.
    return { ...pose, hands: myRole === "lark" ? { L: "down", R: hand } : { L: hand, R: "down" } };
  },

  ends(group: Group, params: ForwardAndBackParams): Record<StationId, EndPose> {
    const out: Record<StationId, EndPose> = {};
    for (const s of group.stations) out[s.id] = advanced(group, s.id, 0, params);
    return out;
  },
};

function advanced(
  group: Group,
  station: StationId,
  k: number,
  params: ForwardAndBackParams,
): EndPose {
  const home = groupStationPose(group, station);
  if (PARTNER[station] === undefined || k === 0) return home;
  const forward = dirOf(home.facing);
  return {
    p: [home.p[0] + forward[0] * params.reachPx * k, home.p[1] + forward[1] * params.reachPx * k],
    facing: home.facing,
  };
}

const SQUARE_DANCE: Dance = validateDance({
  slug: "square-fixture",
  title: "Heads Forward and Back",
  author: "M7",
  formation: "square",
  phrases: (["A1", "A2", "B1", "B2"] as const).map((name) => ({
    name,
    figures: [
      { figure: "heads-forward-and-back", beats: 8, who: "heads" },
      { figure: "heads-forward-and-back", beats: 8, who: "heads" },
    ],
  })),
});

const SQUARE_PROGRAM: Program = {
  slug: "square-fixture",
  items: [{ dance: "square-fixture", medley: "none", timesThrough: 4 }],
};

function run(throughBeat: number) {
  const registry = createFigureRegistry([FORWARD_AND_BACK, WALK_TO_STATION, WAIT_OUT]);
  const hall = createHall(SQUARE, [{ id: "sq", couples: 4, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    SQUARE_PROGRAM,
    registry,
    hall,
    createLibrary([SQUARE_DANCE], [SQUARE]),
  );
  decider.advance(throughBeat);
  return decider;
}

describe("the square, which is not a contra", () => {
  it("has eight stations, four couples, robins on their larks' right", () => {
    const stations = squareStations();
    expect(stations).toHaveLength(8);
    expect(stations.filter((s) => s.role === "lark")).toHaveLength(4);
    expect(new Set(stations.map((s) => s.id)).size).toBe(8);
  });

  it("stands every couple the same distance from the middle", () => {
    for (const station of squareStations()) {
      const away = Math.hypot(station.p[0], station.p[1]);
      expect(away).toBeCloseTo(Math.hypot(SQUARE_RADIUS_PX, 10), 9);
    }
  });

  it("faces every dancer at the middle", () => {
    for (const station of squareStations()) {
      const forward = dirOf(station.facing);
      // Walking forward takes you closer to the middle.
      const after = [station.p[0] + forward[0], station.p[1] + forward[1]] as const;
      expect(Math.hypot(after[0], after[1])).toBeLessThan(Math.hypot(station.p[0], station.p[1]));
    }
  });

  it("never stands two dancers closer than AC6 allows", () => {
    const stations = squareStations();
    for (const a of stations) {
      for (const b of stations) {
        if (a.id === b.id) continue;
        expect(dist(a.p, b.p), `${a.id}/${b.id}`).toBeGreaterThan(COLLISION_PX);
      }
    }
  });

  it("does not progress: a square dance ends where it began", () => {
    const set = SQUARE.start({ id: "sq", couples: 4, centre: [0, 0], axis: 90 });
    expect(SQUARE.progression.next(set)).toBe(set);
  });

  it("names its own station subsets, and knows nothing of ones and twos", () => {
    expect(SQUARE.tags(8).heads).toEqual(SQUARE_HEADS);
    expect(SQUARE.tags(8).ones).toBeUndefined();
  });
});

describe("the square runs through the same engine", () => {
  it("covers every dancer with no gap and no overlap", () => {
    expect(coverageProblems(run(128).timeline(), 0, 128)).toEqual([]);
  });

  it("closes (AC5) within 0.01 px", () => {
    const report = closureReport(run(128).timeline());
    expect(report.seams).toBeGreaterThan(0);
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("never collides (AC6)", () => {
    const report = collisionReport(run(128).timeline(), 0, 128);
    expect(report.pairs).toBeGreaterThan(0);
    expect(report.minDistance, JSON.stringify(report.worst)).toBeGreaterThan(COLLISION_PX);
  });

  it("keeps every hand in reach (AC1)", () => {
    const report = reachReport(run(128).timeline(), 0, 128);
    expect(report.hands).toBeGreaterThan(0);
    expect(report.maxShort, JSON.stringify(report.worst)).toBe(0);
  });

  it("leaves the sides standing while the heads go forward", () => {
    const timeline = run(64).timeline();
    const headLark = timeline.dancers().find((d) => d.endsWith("c0/lark"))!;
    const sideLark = timeline.dancers().find((d) => d.endsWith("c1/lark"))!;
    expect(dist(poseAt(timeline, headLark, 0).p, poseAt(timeline, headLark, 4).p)).toBeGreaterThan(
      4,
    );
    expect(dist(poseAt(timeline, sideLark, 0).p, poseAt(timeline, sideLark, 4).p)).toBe(0);
  });

  it("gives the sides their own events, so nobody is ever uncovered", () => {
    const timeline = run(64).timeline();
    const sideLark = timeline.dancers().find((d) => d.endsWith("c1/lark"))!;
    const figures = timeline.figuresOf(sideLark);
    const firstCycle = figures.filter((f) => f.start < 64);
    expect(firstCycle.map((f) => f.figure)).toEqual(Array(8).fill("walk-to-station"));
    expect(firstCycle.map((f) => [f.start, f.end])).toEqual([
      [0, 8],
      [8, 16],
      [16, 24],
      [24, 32],
      [32, 40],
      [40, 48],
      [48, 56],
      [56, 64],
    ]);
  });

  it("says the square's own call, not a contra one", () => {
    const said = run(64)
      .timeline()
      .utterances()
      .map((u) => u.text);
    expect(said).toContain("HEADS FORWARD AND BACK");
  });
});
