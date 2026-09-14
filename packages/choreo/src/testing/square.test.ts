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
import { HANDS_FOUR_GROUP, createHall } from "../formation/Formation.js";
import type { GroupPlan, StationId } from "../formation/Formation.js";
import type { Group } from "../group/Group.js";
import { groupStation, groupStationPose } from "../group/Group.js";
import { createLibrary } from "../decider/Decider.js";
import { createScriptDecider } from "../decider/createScriptDecider.js";
import { poseAt } from "../timeline/poseAt.js";
import { closureReport, collisionReport, coverageProblems, reachReport } from "./oracles.js";
import { assertPartition, partitionProblems } from "./assertPartition.js";
import {
  LINE_GROUP,
  SQUARE,
  SQUARE_HEADS,
  SQUARE_PLACES,
  SQUARE_RADIUS_PX,
  squareStations,
  squareWaitKind,
} from "./square.js";

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

function run(throughBeat: number, couples = 4) {
  const registry = createFigureRegistry([FORWARD_AND_BACK, WALK_TO_STATION, WAIT_OUT]);
  const hall = createHall(SQUARE, [{ id: "sq", couples, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    SQUARE_PROGRAM,
    registry,
    hall,
    createLibrary([SQUARE_DANCE], [SQUARE]),
  );
  decider.advance(throughBeat);
  return decider;
}

/** The fixture's set, as the hall seats it. */
const squareSet = (couples: number) =>
  SQUARE.start({ id: "sq", couples, centre: [0, 0], axis: 90 });

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
    expect(SQUARE.tags("hands-four").heads).toEqual(SQUARE_HEADS);
    expect(SQUARE.tags("hands-four").ones).toBeUndefined();
    expect(() => SQUARE.tags("shadow-pair")).toThrow(/no group selector/);
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

/**
 * The partition property, on the one selector this milestone implements.
 *
 * `groupsFor` has to divide the *whole* set up — every dancer in exactly one
 * group, dancing and standing out alike — because that is what makes it
 * impossible for two groups of one call to claim the same dancer once the
 * selectors get wider than one minor set. Proved here, on the fixture that
 * knows nothing about contra, so `assertPartition` exists before it is needed.
 */
describe("groupsFor is a partition of the whole set", () => {
  for (const couples of [4, 5, 6]) {
    it(`accounts for every one of ${String(couples)} couples exactly once`, () => {
      const set = squareSet(couples);
      const plans = SQUARE.groupsFor(HANDS_FOUR_GROUP, set);
      expect(partitionProblems(plans, set)).toEqual([]);
      assertPartition(plans, set);
      // And again in the progressed set, which turns the outs over.
      const next = SQUARE.progression.next(set);
      expect(partitionProblems(SQUARE.groupsFor(HANDS_FOUR_GROUP, next), next)).toEqual([]);
    });
  }

  it("notices a dancer claimed twice, and one claimed by nobody", () => {
    const set = squareSet(5);
    const [square, out] = SQUARE.groupsFor(HANDS_FOUR_GROUP, set) as [GroupPlan, GroupPlan];
    // The out couple's lark dragged into the square as well: double-claimed,
    // and whoever they displaced is now in no group at all.
    const both: GroupPlan = { ...square, members: { ...square.members, "1L": out.members["WL"]! } };
    const problems = partitionProblems([both, out], set);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toMatch(/in 2 groups/);
    expect(problems.join("\n")).toMatch(/in no group/);
    expect(() => assertPartition([both, out], set)).toThrow(/not a partition/);
  });

  it("notices a group naming somebody who is not in the set", () => {
    const set = squareSet(4);
    const [square] = SQUARE.groupsFor(HANDS_FOUR_GROUP, set) as [GroupPlan];
    const stranger: GroupPlan = {
      ...square,
      members: { ...square.members, "1L": "somebody-else" },
    };
    expect(partitionProblems([stranger], set).join("\n")).toMatch(
      /somebody-else: in .* but not in set/,
    );
  });
});

/**
 * The two outs, and a couple standing out going through the same per-call loop
 * as everybody else.
 *
 * A square has no couples standing out of its own accord; the fixture seats
 * them on purpose, one beyond each end of the set's axis, so that the engine's
 * `wait-top`/`wait-bottom` distinction and its waiting-group path are both
 * exercised by something that is not a contra.
 */
describe("the two outs", () => {
  it("stands a fifth couple out at the bottom and a sixth at the top", () => {
    expect(SQUARE.groupsFor(HANDS_FOUR_GROUP, squareSet(5)).map((p) => p.kind)).toEqual([
      "set",
      "wait-bottom",
    ]);
    // Both ends, in one set: the partition reads top to bottom.
    expect(SQUARE.groupsFor(HANDS_FOUR_GROUP, squareSet(6)).map((p) => p.kind)).toEqual([
      "wait-top",
      "set",
      "wait-bottom",
    ]);
  });

  it("knows which end from the place alone, and says so for a place either side", () => {
    expect(squareWaitKind(-1)).toBe("wait-top");
    expect(squareWaitKind(SQUARE_PLACES)).toBe("wait-bottom");
    expect(squareWaitKind(0)).toBeUndefined();
    expect(squareWaitKind(SQUARE_PLACES - 1)).toBeUndefined();
  });

  it("gives a couple standing out one wait-out for the whole time through", () => {
    // What the removed special case did, now reached by the general path: the
    // schedule claims nothing of their cycle, so the whole of it is the gap.
    const timeline = run(128, 6).timeline();
    for (const suffix of ["c4/lark", "c5/robin"]) {
      const out = timeline.dancers().find((d) => d.endsWith(suffix))!;
      const first = timeline.figuresOf(out).filter((f) => f.start < 64);
      expect(first.map((f) => [f.figure, f.start, f.end])).toEqual([["wait-out", 0, 64]]);
    }
  });

  it("covers a hall with couples standing out, with no gap and no overlap", () => {
    expect(coverageProblems(run(128, 6).timeline(), 0, 128)).toEqual([]);
  });

  it("closes (AC5) with couples standing out too", () => {
    const report = closureReport(run(128, 6).timeline());
    expect(report.seams).toBeGreaterThan(0);
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("refuses a hall it cannot seat", () => {
    expect(() => squareSet(3)).toThrow(/at least four/);
    expect(() => squareSet(7)).toThrow(/four, five or six/);
  });
});

/**
 * M2's own fixture proof: a neutral `"line"`-equivalent selector that widens
 * to sweep a standing-out couple into a call for part of a cycle, and the
 * `WaitOutParams.join`/`cross` split that fills whatever the sweep leaves
 * unclaimed. No contra knowledge anywhere below — a square has no lines, only
 * a couple standing out beyond either end of the set's own axis, which is
 * exactly what `@caller/contra`'s waiting couple is at the true end of a line.
 */
describe("the line selector's sweep (M2)", () => {
  it("is a partition of the whole set too, at every line length", () => {
    for (const couples of [4, 5, 6]) {
      const set = squareSet(couples);
      const plans = SQUARE.groupsFor(LINE_GROUP, set);
      // Always exactly one plan: "line" folds every standing-out couple into
      // the one dancing group rather than leaving it a separate wait plan.
      expect(plans).toHaveLength(1);
      expect(plans[0]!.kind).toBe("set");
      expect(partitionProblems(plans, set)).toEqual([]);
      assertPartition(plans, set);
    }
  });

  it("widens by exactly the standing-out couple's own two stations, per end", () => {
    const top = SQUARE.groupsFor(LINE_GROUP, squareSet(6))[0]!;
    expect(top.stations).toHaveLength(8 + 2 + 2);
    expect(new Set(top.stations.map((s) => s.id)).size).toBe(12); // no id collision
    expect(top.members["WL-top"]).toBeDefined();
    expect(top.members["WR-bottom"]).toBeDefined();

    const noOuts = SQUARE.groupsFor(LINE_GROUP, squareSet(4))[0]!;
    expect(noOuts.stations).toHaveLength(8); // identical to "hands-four" in the interior
  });

  it("tags(\"line\")'s wait-top/wait-bottom filter down to whichever end an instance actually has", () => {
    const tags = SQUARE.tags(LINE_GROUP);
    const sixCoupleStations = SQUARE.groupsFor(LINE_GROUP, squareSet(6))[0]!.stations.map(
      (s) => s.id,
    );
    const fourCoupleStations = SQUARE.groupsFor(LINE_GROUP, squareSet(4))[0]!.stations.map(
      (s) => s.id,
    );
    expect(tags["wait-top"]!.filter((id) => sixCoupleStations.includes(id))).toEqual([
      "WL-top",
      "WR-top",
    ]);
    // The plain interior (no outs) instance has neither: resolveSelector's own
    // filter-to-present-ids drops both down to nothing, exactly as it already
    // does for `"hands-four"`'s widest abstract tag definitions.
    expect(tags["wait-top"]!.filter((id) => fourCoupleStations.includes(id))).toEqual([]);
  });

  // A figure for the widened group: heads forward-and-back, unchanged, plus
  // whichever standing-out couple this call's own partition swept in also
  // goes forward and back as its own pair — proof (a) below that a swept
  // couple gets the *real* figure, not a stand-in.
  const WIDE_PARTNER: Record<StationId, StationId> = {
    ...PARTNER,
    "WL-top": "WR-top",
    "WR-top": "WL-top",
    "WL-bottom": "WR-bottom",
    "WR-bottom": "WL-bottom",
  };
  const WIDE_FORWARD_AND_BACK: FigureDef<ForwardAndBackParams> = {
    ...FORWARD_AND_BACK,
    id: "wide-forward-and-back",
    call: "EVERYBODY FORWARD AND BACK",
    sample(group, station, t, params) {
      const half = params.beats / 2;
      const k = t <= half ? smooth(t / half) : smooth((params.beats - t) / half);
      const home = groupStationPose(group, station);
      const partner = WIDE_PARTNER[station];
      const forward = dirOf(home.facing);
      const here =
        partner === undefined || k === 0
          ? home
          : {
              p: [
                home.p[0] + forward[0] * params.reachPx * k,
                home.p[1] + forward[1] * params.reachPx * k,
              ] as const,
              facing: home.facing,
            };
      return t > 0 && t < params.beats ? walking(here.p, here.facing) : standing(here.p, here.facing);
    },
    ends(group) {
      const out: Record<StationId, EndPose> = {};
      for (const s of group.stations) out[s.id] = groupStationPose(group, s.id);
      return out;
    },
  };

  const SWEEP_DANCE: Dance = validateDance({
    slug: "line-sweep-fixture",
    title: "Everybody Forward and Back",
    author: "M2",
    formation: "square",
    phrases: [
      { name: "A1", figures: [{ figure: "heads-forward-and-back", beats: 8, who: "heads" }] },
      {
        name: "A2",
        figures: [
          {
            figure: "wide-forward-and-back",
            beats: 8,
            who: "all",
            group: LINE_GROUP,
            ends: "both",
          },
        ],
      },
      { name: "B1", figures: [{ figure: "heads-forward-and-back", beats: 8, who: "heads" }] },
    ],
  });

  const SWEEP_PROGRAM: Program = {
    slug: "line-sweep-fixture",
    items: [{ dance: "line-sweep-fixture", medley: "none", timesThrough: 4 }],
  };

  function runSweep(throughBeat: number, couples = 6) {
    const registry = createFigureRegistry([
      FORWARD_AND_BACK,
      WIDE_FORWARD_AND_BACK,
      WALK_TO_STATION,
      WAIT_OUT,
    ]);
    const hall = createHall(SQUARE, [{ id: "sq", couples, centre: [0, 0], axis: 90 }]);
    const decider = createScriptDecider(
      SWEEP_PROGRAM,
      registry,
      hall,
      createLibrary([SWEEP_DANCE], [SQUARE]),
    );
    decider.advance(throughBeat);
    return decider;
  }

  it("(a) gives the swept couple the real figure over its own span", () => {
    const timeline = runSweep(24).timeline();
    const topOut = timeline.dancers().find((d) => d.endsWith("c5/lark"))!; // 6th couple, wait-top
    const figures = timeline.figuresOf(topOut).filter((f) => f.start < 24);
    expect(figures.map((f) => f.figure)).toEqual(["wait-out", "wide-forward-and-back", "wait-out"]);
    expect(figures.map((f) => [f.start, f.end])).toEqual([
      [0, 8],
      [8, 16],
      [16, 24],
    ]);
  });

  it("(b) phase-flags the leading and trailing gaps: join only leading, cross only trailing", () => {
    const timeline = runSweep(24).timeline();
    const bottomOut = timeline.dancers().find((d) => d.endsWith("c4/robin"))!; // 5th couple, wait-bottom
    const figures = timeline.figuresOf(bottomOut).filter((f) => f.start < 24);
    const [leading, swept, trailing] = figures as [
      (typeof figures)[0],
      (typeof figures)[0],
      (typeof figures)[0],
    ];
    expect(leading.figure).toBe("wait-out");
    expect((leading.params as { join: boolean; cross: boolean }).join).toBe(true);
    expect((leading.params as { join: boolean; cross: boolean }).cross).toBe(false);
    expect(swept.figure).toBe("wide-forward-and-back");
    expect(trailing.figure).toBe("wait-out");
    expect((trailing.params as { join: boolean; cross: boolean }).join).toBe(false);
    expect((trailing.params as { join: boolean; cross: boolean }).cross).toBe(true);
  });

  it("(c) closes to 0.01 px across the whole sequence, sweep and gaps together", () => {
    const report = closureReport(runSweep(24 * 8).timeline());
    expect(report.seams).toBeGreaterThan(0);
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("covers every dancer with no gap and no overlap, sweep included", () => {
    expect(coverageProblems(runSweep(24 * 8).timeline(), 0, 24 * 8)).toEqual([]);
  });

  it("checked independently for wait-top and wait-bottom: both got their own leading/trailing split", () => {
    const timeline = runSweep(24).timeline();
    const topOut = timeline.dancers().find((d) => d.endsWith("c5/robin"))!;
    const bottomOut = timeline.dancers().find((d) => d.endsWith("c4/lark"))!;
    for (const dancer of [topOut, bottomOut]) {
      const figures = timeline.figuresOf(dancer).filter((f) => f.start < 24);
      expect(figures.map((f) => f.figure)).toEqual([
        "wait-out",
        "wide-forward-and-back",
        "wait-out",
      ]);
    }
  });

  it("a down-the-hall-shaped call (ends: \"bottom\") never sweeps a wait-top couple in", () => {
    const bottomOnlyDance: Dance = validateDance({
      ...SWEEP_DANCE,
      slug: "line-sweep-bottom-only",
      phrases: [
        { name: "A1", figures: [{ figure: "heads-forward-and-back", beats: 8, who: "heads" }] },
        {
          name: "A2",
          figures: [
            {
              figure: "wide-forward-and-back",
              beats: 8,
              who: "all",
              group: LINE_GROUP,
              ends: "bottom",
            },
          ],
        },
        { name: "B1", figures: [{ figure: "heads-forward-and-back", beats: 8, who: "heads" }] },
      ],
    });
    const program: Program = {
      slug: "line-sweep-bottom-only",
      items: [{ dance: "line-sweep-bottom-only", medley: "none", timesThrough: 1 }],
    };
    const registry = createFigureRegistry([
      FORWARD_AND_BACK,
      WIDE_FORWARD_AND_BACK,
      WALK_TO_STATION,
      WAIT_OUT,
    ]);
    const hall = createHall(SQUARE, [{ id: "sq", couples: 6, centre: [0, 0], axis: 90 }]);
    const decider = createScriptDecider(
      program,
      registry,
      hall,
      createLibrary([bottomOnlyDance], [SQUARE]),
    );
    decider.advance(24);
    const timeline = decider.timeline();
    const topOut = timeline.dancers().find((d) => d.endsWith("c5/lark"))!; // wait-top
    const bottomOut = timeline.dancers().find((d) => d.endsWith("c4/lark"))!; // wait-bottom
    // The bottom-out couple gets swept; the top-out couple gets a single,
    // whole-cycle wait-out, exactly as if it were never widened at all.
    expect(
      timeline
        .figuresOf(bottomOut)
        .filter((f) => f.start < 24)
        .map((f) => f.figure),
    ).toEqual(["wait-out", "wide-forward-and-back", "wait-out"]);
    const topFigures = timeline.figuresOf(topOut).filter((f) => f.start < 24);
    expect(topFigures.map((f) => f.figure)).toEqual(["wait-out"]);
    expect(topFigures.map((f) => [f.start, f.end])).toEqual([[0, 24]]);
  });
});
