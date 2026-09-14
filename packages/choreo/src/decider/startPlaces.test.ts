import { HOLD_SPACING_PX, angleDiff, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { Dance, PhraseName, Program } from "../dance/Dance.js";
import { validateDance } from "../dance/Dance.js";
import type { EndPose } from "../figure/FigureDef.js";
import { createFigureRegistry } from "../figure/FigureDef.js";
import type { WaitOutParams } from "../figure/waitOut.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import type {
  CoupleState,
  Formation,
  GroupPlan,
  GroupSelector,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "../formation/Formation.js";
import { HANDS_FOUR_GROUP, createHall } from "../formation/Formation.js";
import { frame, frameAngle, framePoint } from "../formation/Frame.js";
import type { Group } from "../group/Group.js";
import { closureReport, coverageProblems } from "../testing/oracles.js";
import { poseAt } from "../timeline/poseAt.js";
import { createLibrary } from "./Decider.js";
import { createScriptDecider } from "./createScriptDecider.js";

/**
 * A dance may begin somewhere other than the formation's stations.
 *
 * The case that forces it is a becket dance that shifts left in its own first
 * two beats: the minor set the time through runs in is the one the shift
 * *makes*, so the dancers start one couple place back along their own line, and
 * closure at the cycle has to be measured against those places rather than
 * against the stations. Everything here is form-neutral — a fixture formation
 * whose progression trades a couple's two places, and a dance whose first
 * figure is that trade — so it holds for any form that progresses early.
 */

const PHRASES: readonly PhraseName[] = ["A1", "A2", "B1", "B2"];

/** AC5's number. */
const CLOSURE_PX = 0.01;

/** Two stations facing each other across the frame, far enough apart to pass. */
const STATIONS: readonly Station[] = [
  { id: "A", role: "lark", facing: 0, p: [-16, 0] },
  { id: "B", role: "robin", facing: 180, p: [16, 0] },
];

const stationPoseOf = (id: StationId): EndPose => {
  const station = STATIONS.find((s) => s.id === id)!;
  return { p: station.p, facing: station.facing };
};

/**
 * A formation of couples in a line whose progression trades the couple's two
 * places. Nothing leaves its own group, so a dance that performs the trade in
 * its first figure is exactly a dance that progresses before its cycle is over.
 */
const TRADING: Formation = {
  id: "trading",
  roleSet: { roles: ["lark", "robin"], top: "robin" },

  group(n: number): Station[] {
    if (n !== 2) throw new Error(`the trading fixture dances in twos, not ${n}`);
    return STATIONS.map((s) => ({ ...s }));
  },

  groupFor(selector: GroupSelector): Station[] {
    onlyHandsFour(selector);
    return STATIONS.map((s) => ({ ...s }));
  },

  progression: {
    next: (set: SetState): SetState => ({
      ...set,
      couples: set.couples.map((c) => ({
        ...c,
        direction: (c.direction === 1 ? -1 : 1) as 1 | -1,
      })),
    }),
  },

  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[] {
    onlyHandsFour(selector);
    return set.couples.map((couple): GroupPlan => {
      const lark = couple.dancers["lark"]!;
      const robin = couple.dancers["robin"]!;
      return {
        id: `${set.id}/p${couple.place}`,
        kind: "set",
        frame: frame(
          [set.frame.centre[0], set.frame.centre[1] + couple.place * set.pitch],
          set.frame.axis,
          set.frame.spacing,
        ),
        stations: STATIONS.map((s) => ({ ...s })),
        members: couple.direction === 1 ? { A: lark, B: robin } : { A: robin, B: lark },
        couples: [couple.id],
      };
    });
  },

  start(spec: SetSpec): SetState {
    const couples: CoupleState[] = [];
    for (let i = 0; i < spec.couples; i++) {
      couples.push({
        id: `${spec.id}/c${i}`,
        dancers: { lark: `${spec.id}/c${i}/lark`, robin: `${spec.id}/c${i}/robin` },
        place: i,
        direction: 1,
      });
    }
    return {
      id: spec.id,
      frame: frame(spec.centre, spec.axis, HOLD_SPACING_PX),
      pitch: 40,
      couples,
    };
  },

  tags(selector: GroupSelector): Record<string, StationId[]> {
    onlyHandsFour(selector);
    return { all: ["A", "B"], larks: ["A"], robins: ["B"] };
  },
};

/** The trading fixture defines the one built-in selector and no other. */
function onlyHandsFour(selector: GroupSelector): void {
  if (selector !== HANDS_FOUR_GROUP) {
    throw new Error(`the trading fixture has no group selector "${selector}"`);
  }
}

/** Where the trading dance picks its dancers up: each on the other's place. */
const TRADE_START: Record<StationId, EndPose> = {
  A: stationPoseOf("B"),
  B: stationPoseOf("A"),
};

/** Four sixteen-beat phrases; the first eight beats are the progression itself. */
const stand = (name: PhraseName) => ({
  name,
  figures: [{ figure: "walk-to-station", beats: 16, call: `${name} STAND` }],
});

/**
 * The dance that progresses in its first figure: the couple trades places over
 * the first eight beats and stands for the remaining fifty-six.
 */
const TRADE: Dance = validateDance({
  slug: "trade",
  title: "The Trade",
  author: "The fixture",
  formation: "trading",
  startPlaces: TRADE_START,
  phrases: [
    {
      name: "A1",
      figures: [
        {
          figure: "walk-to-station",
          beats: 8,
          params: { startPlaces: TRADE_START, to: { A: "A", B: "B" } },
          call: "TRADE PLACES",
        },
        { figure: "walk-to-station", beats: 8, call: "STAND" },
      ],
    },
    stand("A2"),
    stand("B1"),
    stand("B2"),
  ],
});

/** The same dance without the declaration, which is the bug M9 measured. */
const TRADE_UNDECLARED: Dance = validateDance({
  ...TRADE,
  slug: "trade-undeclared",
  title: "The Undeclared Trade",
  startPlaces: undefined,
});

/** A plain dance on the stations, so a switch into the trading dance can be measured. */
const STAY: Dance = validateDance({
  slug: "stay",
  title: "Stay Put",
  author: "The fixture",
  formation: "trading",
  phrases: PHRASES.map(stand),
});

function run(program: Program, until: number, dances: readonly Dance[]) {
  const registry = createFigureRegistry([WALK_TO_STATION, WAIT_OUT]);
  const hall = createHall(TRADING, [{ id: "set0", couples: 3, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    program,
    registry,
    hall,
    createLibrary([...dances], [TRADING]),
  );
  decider.advance(until);
  return decider;
}

const alone = (dance: Dance, until: number) =>
  run({ slug: "p", items: [{ dance: dance.slug, medley: "m", timesThrough: 8 }] }, until, [dance]);

describe("a dance that progresses in its own first figure", () => {
  it("closes at every seam, eight times through", () => {
    const report = closureReport(alone(TRADE, 256).timeline());
    expect(report.seams).toBeGreaterThan(0);
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("leaves every dancer on their start place in the progressed set (AC5)", () => {
    const timeline = alone(TRADE, 256).timeline();
    const hall = createHall(TRADING, [{ id: "set0", couples: 3, centre: [0, 0], axis: 90 }]);
    const progressed = TRADING.progression.next(hall.sets[0]!);
    let worst = 0;
    let worstTurn = 0;
    for (const plan of TRADING.groupsFor(HANDS_FOUR_GROUP, progressed)) {
      for (const station of plan.stations) {
        const place = TRADE.startPlaces?.[station.id] ?? { p: station.p, facing: station.facing };
        const pose = poseAt(timeline, plan.members[station.id]!, 64);
        worst = Math.max(worst, dist(pose.p, framePoint(plan.frame, place.p)));
        worstTurn = Math.max(
          worstTurn,
          Math.abs(angleDiff(pose.facing, frameAngle(plan.frame, place.facing))),
        );
      }
    }
    expect(worst).toBeLessThan(CLOSURE_PX);
    expect(worstTurn).toBeLessThan(1e-9);
  });

  it("covers every dancer with no gap and no overlap", () => {
    expect(coverageProblems(alone(TRADE, 256).timeline(), 0, 192)).toEqual([]);
  });
});

describe("the line-up walks to the next dance's own first places", () => {
  const program: Program = {
    slug: "switching",
    items: [
      { dance: "stay", medley: "m", timesThrough: 1 },
      { dance: "trade", medley: "m", timesThrough: 1 },
    ],
  };

  it("closes across the switch", () => {
    const report = closureReport(run(program, 300, [STAY, TRADE]).timeline());
    expect(report.seams).toBeGreaterThan(0);
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("leaves the dancers 32 px out when the dance does not declare them", () => {
    // The same programme with `startPlaces` stripped from the dance but left on
    // its first figure: the line-up puts everybody on the stations and the new
    // dance picks them up from the other side of the set. This is the number the
    // declaration exists to remove, and it is what fails without the fix.
    const undeclared: Program = {
      ...program,
      items: [program.items[0]!, { ...program.items[1]!, dance: "trade-undeclared" }],
    };
    const report = closureReport(run(undeclared, 300, [STAY, TRADE_UNDECLARED]).timeline());
    expect(report.maxPositionError).toBeGreaterThan(30);
  });
});

describe("wait-out crosses from where the couple started", () => {
  const group = (): Group => {
    const stations: Station[] = [
      { id: "WL", role: "lark", facing: 0, p: [-16, -10] },
      { id: "WR", role: "robin", facing: 0, p: [-16, 10] },
    ];
    return {
      id: "w",
      frame: frame([0, 0], 90, HOLD_SPACING_PX),
      members: { WL: "l", WR: "r" },
      stations,
      roleSet: { roles: ["lark", "robin"], top: "robin" },
    };
  };

  const params = (startPlaces: Record<StationId, EndPose>): WaitOutParams => ({
    ...WAIT_OUT.defaults,
    crossTo: "mirror",
    startPlaces,
    beats: 64,
  });

  it("mirrors the waiting places when the dance declares nothing", () => {
    const ends = WAIT_OUT.ends(group(), params({}));
    // The point opposite (-16, -10) through the frame centre is (16, 10).
    expect(dist(ends["WL"]!.p, framePoint(group().frame, [16, 10]))).toBeLessThan(1e-9);
  });

  it("mirrors the start places when it declares them, and starts there", () => {
    const shifted: Record<StationId, EndPose> = {
      WL: { p: [-16, 30], facing: 0 },
      WR: { p: [-16, 50], facing: 0 },
    };
    const g = group();
    const ends = WAIT_OUT.ends(g, params(shifted));
    expect(dist(ends["WL"]!.p, framePoint(g.frame, [16, -30]))).toBeLessThan(1e-9);
    expect(dist(ends["WR"]!.p, framePoint(g.frame, [16, -50]))).toBeLessThan(1e-9);
    // And it picks the dancer up from the declared place, not from the station.
    const at0 = WAIT_OUT.sample(g, "WL", 0, params(shifted));
    expect(dist(at0.p, framePoint(g.frame, [-16, 30]))).toBeLessThan(1e-9);
  });
});
