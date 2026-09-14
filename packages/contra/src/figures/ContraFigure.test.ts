import type { Beat } from "@caller/core";
import type { Group, Station } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import type {
  ContraFigure,
  ContraParams,
  FigurePlan,
  LocalSample,
  PlanContext,
} from "./ContraFigure.js";
import { PLAN_CACHE_SIZE, clearPlanCache, contraFigure, planCacheSize } from "./ContraFigure.js";
import { probeGroup } from "./testing.js";

/** Each fixture figure needs its own id, so two of them cannot share a key. */
let seq = 0;

/**
 * A figure that does nothing but count how often it is planned.
 *
 * The plan cache is not observable through the figure contract — that is the
 * point of it — so the only place it can be seen working is inside a `plan`.
 */
function counted(): { figure: ContraFigure<ContraParams>; plans: () => number } {
  let built = 0;
  seq += 1;
  const figure = contraFigure<ContraParams>({
    id: `counted-${String(seq)}`,
    call: "STAND STILL",
    describe: "stand still",
    lead: 0,
    beats: 8,
    defaults: { from: {} },
    plan(ctx: PlanContext): FigurePlan {
      built += 1;
      return {
        at: (station: string): LocalSample => {
          const spot = ctx.spot(station);
          return { p: spot.p, facing: spot.facing, hands: { L: "down", R: "down" } };
        },
        ends: Object.fromEntries(ctx.ids.map((id) => [id, ctx.spot(id)])),
        joinsAt: () => [],
      };
    },
  });
  return { figure, plans: () => built };
}

/** A fresh params object, as the decider's `withDefaults` makes one per event. */
const params = (beats: Beat = 8): ContraParams => ({ from: {}, beats });

describe("the plan cache", () => {
  it("plans a figure once for a whole frame of a group, however many dancers ask", () => {
    clearPlanCache();
    const { figure, plans } = counted();
    const group: Group = probeGroup(DUPLE_IMPROPER);
    const p = params();

    // What a frame does: every dancer of the group, at one beat. Before the
    // cache this was one whole plan per dancer per frame.
    for (let t = 0; t < 4; t += 1) {
      for (const station of ["1L", "1R", "2L", "2R"]) {
        figure.sample(group, station, t, p);
      }
    }
    expect(plans()).toBe(1);
  });

  it("gives back exactly the pose an uncached plan gives", () => {
    const { figure } = counted();
    const group: Group = probeGroup(DUPLE_IMPROPER);
    const p = params();

    clearPlanCache();
    const cold = figure.sample(group, "1L", 3, p);
    const warm = figure.sample(group, "1L", 3, p);
    clearPlanCache();
    const again = figure.sample(group, "1L", 3, p);

    expect(warm).toEqual(cold);
    expect(again).toEqual(cold);
  });

  it("plans again for a different group, and for a different params object", () => {
    clearPlanCache();
    const { figure, plans } = counted();
    const one: Group = probeGroup(DUPLE_IMPROPER);
    const two: Group = probeGroup(DUPLE_IMPROPER);
    const p = params();

    figure.sample(one, "1L", 0, p);
    figure.sample(two, "1L", 0, p);
    expect(plans()).toBe(2);

    // The decider builds a fresh params object for every figure event, so two
    // events of one dance are two plans even when their contents match.
    figure.sample(one, "1L", 0, params());
    expect(plans()).toBe(3);
  });

  it("shares one plan between `sample` and `ends`", () => {
    clearPlanCache();
    const { figure, plans } = counted();
    const group: Group = probeGroup(DUPLE_IMPROPER);
    const p = params();

    figure.ends(group, p);
    figure.sample(group, "1L", 0, p);
    expect(plans()).toBe(1);
  });

  it("leaves `moves` and `joins` uncached: they are the dance-build path", () => {
    clearPlanCache();
    const { figure, plans } = counted();
    const stations: readonly Station[] = DUPLE_IMPROPER.group(4);
    const p = params();

    figure.moves(p, stations);
    figure.moves(p, stations);
    figure.joins(p, 0, stations);
    expect(plans()).toBe(3);
    expect(planCacheSize()).toBe(0);
  });

  it("never holds more than PLAN_CACHE_SIZE plans, however long the evening is", () => {
    clearPlanCache();
    const { figure } = counted();
    const group: Group = probeGroup(DUPLE_IMPROPER);

    // Four times the bound of distinct figure events — more than twice what a
    // whole evening's timeline holds.
    for (let i = 0; i < PLAN_CACHE_SIZE * 4; i += 1) {
      figure.sample(group, "1L", 0, params());
    }
    expect(planCacheSize()).toBe(PLAN_CACHE_SIZE);
  });
});
