import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { Dance, PhraseName, Program } from "../dance/Dance.js";
import { validateDance } from "../dance/Dance.js";
import type { AnyFigureDef, EndPose } from "../figure/FigureDef.js";
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
import { frame } from "../formation/Frame.js";
import type { Group } from "../group/Group.js";
import { closureReport } from "../testing/oracles.js";
import { createLibrary } from "./Decider.js";
import { createScriptDecider } from "./createScriptDecider.js";

/**
 * The decider must take `wait-out` from the **registry**, not from the module
 * it imports.
 *
 * A form may register its own `wait-out` under the engine's id — `@caller/contra`
 * does, to read the crossing off the formation rather than off a parameter the
 * decider has no way to set. `poseAt` resolves a figure event through the
 * registry, so the form's figure is what gets *drawn*; if the decider records
 * the built-in's `ends` instead, the two disagree and the eight-beat line-up
 * between two dances walks from the wrong place. In contra that is 51 px.
 *
 * Everything here is form-neutral: a fixture formation where every couple
 * waits, and a replacement `wait-out` that crosses the other way, so the two
 * definitions' `ends` are as far apart as the figure can make them.
 */

const PHRASES: readonly PhraseName[] = ["A1", "A2", "B1", "B2"];

/** AC5's number, applied to the seam the line-up lands on. */
const CLOSURE_PX = 0.01;

/** Two stations facing each other across the frame, which is a `'swap'` couple. */
const WAIT_STATIONS: readonly Station[] = [
  { id: "WL", role: "lark", facing: 0, p: [-16, -10] },
  { id: "WR", role: "robin", facing: 180, p: [16, -10] },
];

/**
 * A formation in which nobody ever dances: every couple is its own waiting
 * group. The smallest fixture that puts the decider on the `wait-out` path.
 */
const WAITING: Formation = {
  id: "waiting",
  roleSet: { roles: ["lark", "robin"], top: "robin" },

  group(n: number): Station[] {
    if (n !== 2) throw new Error(`the waiting fixture waits in twos, not ${n}`);
    return WAIT_STATIONS.map((s) => ({ ...s }));
  },

  groupFor(selector: GroupSelector): Station[] {
    onlyHandsFour(selector);
    return WAIT_STATIONS.map((s) => ({ ...s }));
  },

  progression: { next: (set: SetState): SetState => set },

  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[] {
    onlyHandsFour(selector);
    return set.couples.map((couple): GroupPlan => {
      const lark = couple.dancers["lark"];
      const robin = couple.dancers["robin"];
      if (lark === undefined || robin === undefined) {
        throw new Error(`couple "${couple.id}" is missing a dancer`);
      }
      return {
        id: `${set.id}/w${couple.place}`,
        // Everybody in this fixture is out, and out at the bottom: there is no
        // line above them to be the top of.
        kind: "wait-bottom",
        frame: frame(
          [set.frame.centre[0], set.frame.centre[1] + couple.place * set.pitch],
          set.frame.axis,
          set.frame.spacing,
        ),
        stations: WAIT_STATIONS.map((s) => ({ ...s })),
        members: { WL: lark, WR: robin },
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
    return { all: ["WL", "WR"], larks: ["WL"], robins: ["WR"] };
  },
};

/** The waiting fixture defines the one built-in selector and no other. */
function onlyHandsFour(selector: GroupSelector): void {
  if (selector !== HANDS_FOUR_GROUP) {
    throw new Error(`the waiting fixture has no group selector "${selector}"`);
  }
}

/**
 * The same figure, crossing the other way: every dancer walks to the point
 * opposite their own through the frame centre instead of trading stations.
 * Registered under the engine's own id, exactly as `@caller/contra` does.
 */
const MIRRORING_WAIT_OUT: AnyFigureDef = {
  id: WAIT_OUT.id,
  call: WAIT_OUT.call,
  lead: WAIT_OUT.lead,
  beats: WAIT_OUT.beats,
  defaults: WAIT_OUT.defaults,
  sample: (group: Group, station: StationId, t: number, params: WaitOutParams) =>
    WAIT_OUT.sample(group, station, t, { ...params, crossTo: "mirror" }),
  ends: (group: Group, params: WaitOutParams): Record<StationId, EndPose> =>
    WAIT_OUT.ends(group, { ...params, crossTo: "mirror" }),
};

const stand = (slug: string, title: string): Dance =>
  validateDance({
    slug,
    title,
    author: "The fixture",
    formation: "waiting",
    phrases: PHRASES.map((name) => ({
      name,
      figures: [{ figure: "walk-to-station", beats: 16 }],
    })),
  });

const ONE = stand("one", "First Dance");
const TWO = stand("two", "Second Dance");

/** Two dances, one time through each, so the line-up between them is emitted. */
const PROGRAM: Program = {
  slug: "switching",
  items: [
    { dance: "one", medley: "m", timesThrough: 1 },
    { dance: "two", medley: "m", timesThrough: 1 },
  ],
};

function run(waitOut: AnyFigureDef) {
  const registry = createFigureRegistry([WALK_TO_STATION, waitOut]);
  const hall = createHall(WAITING, [{ id: "set0", couples: 3, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    PROGRAM,
    registry,
    hall,
    createLibrary([ONE, TWO], [WAITING]),
  );
  decider.advance(160);
  return decider.timeline();
}

describe("the decider takes wait-out from the registry", () => {
  it("records the registered figure's ends, so the line-up starts where the dancer is", () => {
    const report = closureReport(run(MIRRORING_WAIT_OUT));
    expect(report.seams).toBeGreaterThan(0);
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("is unchanged when the registry holds the engine's own wait-out", () => {
    const report = closureReport(run(WAIT_OUT as AnyFigureDef));
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("the two definitions really do end in different places", () => {
    // Without this the test above could pass by the replacement being the same
    // figure. A `'swap'` and a `'mirror'` crossing of these stations differ.
    const hall = createHall(WAITING, [{ id: "set0", couples: 1, centre: [0, 0], axis: 90 }]);
    const plan = WAITING.groupsFor(HANDS_FOUR_GROUP, hall.sets[0]!)[0]!;
    const group: Group = {
      id: plan.id,
      frame: plan.frame,
      members: plan.members,
      stations: plan.stations,
      roleSet: WAITING.roleSet,
    };
    const params = { ...WAIT_OUT.defaults, beats: 64 } as WaitOutParams;
    const swap = WAIT_OUT.ends(group, params)["WL"]!;
    const mirror = MIRRORING_WAIT_OUT.ends(group, params)["WL"]!;
    expect(dist(swap.p, mirror.p)).toBeGreaterThan(10);
  });
});
