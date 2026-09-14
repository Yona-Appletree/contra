import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import type { Spot, Spots } from "../ContraFigure.js";
import { joinPoint, planContext } from "../ContraFigure.js";
import { ringFor } from "../ring.js";
import type { ExprEnv } from "./expr.js";
import { evalAngle, evalNumber, evalPoint, evalSpot, evalStation } from "./expr.js";

/**
 * A square of four dancers round the origin, so every node's answer can be read
 * off by eye: the ring's centre is `[0, 0]` and the ring order runs
 * `2L, 2R, 1L, 1R` (anticlockwise on the floor, y down).
 */
const SQUARE: Spots = {
  "1L": { p: [-10, -10], facing: 90 },
  "1R": { p: [10, -10], facing: 90 },
  "2L": { p: [10, 10], facing: 270 },
  "2R": { p: [-10, 10], facing: 270 },
};

const ctx = planContext(DUPLE_IMPROPER.group(4), DUPLE_IMPROPER.roleSet, HOLD_SPACING_PX, SQUARE);
const ring = ringFor(ctx);

/** Somewhere nobody starts and nobody ends, so "live" is unmistakable. */
const LIVE: Spots = {
  "1L": { p: [100, 0], facing: 0 },
  "1R": { p: [100, 20], facing: 180 },
  "2L": { p: [200, 0], facing: 0 },
  "2R": { p: [200, 20], facing: 180 },
};

/** Somewhere else again, so "end" is unmistakable too. */
const ENDS: Spots = {
  "1L": { p: [-50, 0], facing: 45 },
  "1R": { p: [-50, 20], facing: 45 },
  "2L": { p: [-60, 0], facing: 45 },
  "2R": { p: [-60, 20], facing: 45 },
};

const env = (over: Partial<ExprEnv> = {}): ExprEnv => ({
  ctx,
  params: { places: 3, direction: "left", hand: "R", mirrored: true },
  beats: 8,
  self: "1L",
  t: 2,
  ring,
  ...over,
});

const withPasses = (over: Partial<ExprEnv> = {}): ExprEnv =>
  env({ ends: ENDS, live: (id) => LIVE[id] as Spot, ...over });

describe("the ring these tests read against", () => {
  it("is centred on the origin and runs 2L, 2R, 1L, 1R", () => {
    expect(ring.centre).toEqual([0, 0]);
    expect(ring.order).toEqual(["2L", "2R", "1L", "1R"]);
  });
});

describe("NumberExpr", () => {
  it("is a literal, or a named parameter", () => {
    expect(evalNumber(7, env())).toBe(7);
    expect(evalNumber({ param: "places" }, env())).toBe(3);
  });

  it("picks a number with a word: how a direction becomes a sign", () => {
    const sign = { number: "select", on: "direction", cases: { left: 1, right: -1 } } as const;
    expect(evalNumber(sign, env())).toBe(1);
    expect(evalNumber(sign, env({ params: { direction: "right" } }))).toBe(-1);
  });

  it("selects on a boolean parameter by its own spelling", () => {
    const pick = { number: "select", on: "mirrored", cases: { true: 1, false: 0 } } as const;
    expect(evalNumber(pick, env())).toBe(1);
    expect(evalNumber(pick, env({ params: { mirrored: false } }))).toBe(0);
  });

  it("folds a product left to right", () => {
    expect(evalNumber({ number: "mul", of: [2, 3, 4] }, env())).toBe(24);
    expect(evalNumber({ number: "mul", of: [{ param: "places" }] }, env())).toBe(3);
  });

  it("says what went wrong rather than yielding NaN", () => {
    expect(() => evalNumber({ param: "nope" }, env())).toThrow(/no parameter "nope"/);
    expect(() => evalNumber({ param: "direction" }, env())).toThrow(/not a number/);
    expect(() =>
      evalNumber({ number: "select", on: "direction", cases: { up: 1 } }, env()),
    ).toThrow(/is "left"/);
    expect(() => evalNumber({ number: "mul", of: [] }, env())).toThrow(/at least one term/);
  });
});

describe("StationExpr", () => {
  it("names a station outright, or the dancer the expression is about", () => {
    expect(evalStation("2R", env())).toBe("2R");
    expect(evalStation({ station: "self" }, env())).toBe("1L");
    expect(evalStation({ station: "self" }, env({ self: "2L" }))).toBe("2L");
  });

  it("counts places round the ring, forwards and back, wrapping", () => {
    expect(evalStation({ station: "ringShift", places: 1 }, env())).toBe("1R");
    expect(evalStation({ station: "ringShift", places: -1 }, env())).toBe("2R");
    expect(evalStation({ station: "ringShift", places: 4 }, env())).toBe("1L");
    expect(evalStation({ station: "ringShift", places: { param: "places" } }, env())).toBe("2R");
  });
});

describe("evalSpot", () => {
  it("reads a dancer's start, end and live place as three different things", () => {
    expect(evalSpot("start", "1L", withPasses())).toEqual(SQUARE["1L"]);
    expect(evalSpot("end", "1L", withPasses())).toEqual(ENDS["1L"]);
    expect(evalSpot("live", "1L", withPasses())).toEqual(LIVE["1L"]);
  });

  it("refuses to guess before its pass has run", () => {
    expect(() => evalSpot("end", "1L", env())).toThrow(/the ends pass has not run/);
    expect(() => evalSpot("live", "1L", env())).toThrow(/the position pass has not run/);
  });
});

describe("PointExpr", () => {
  it("reads a station's place in each of the three senses", () => {
    expect(evalPoint({ point: "start", station: { station: "self" } }, withPasses())).toEqual([
      -10, -10,
    ]);
    expect(evalPoint({ point: "end", station: "2L" }, withPasses())).toEqual([-60, 0]);
    expect(evalPoint({ point: "live", station: "2L" }, withPasses())).toEqual([200, 0]);
  });

  it("knows where the middle of the ring is", () => {
    expect(evalPoint({ point: "ringCentre" }, env())).toEqual([0, 0]);
  });

  it("takes the midpoint of two points", () => {
    expect(
      evalPoint(
        {
          point: "midpoint",
          a: { point: "start", station: "1L" },
          b: { point: "start", station: "1R" },
        },
        env(),
      ),
    ).toEqual([0, -10]);
  });

  it("goes a radius out from a centre at an angle", () => {
    expect(
      evalPoint({ point: "polar", centre: { point: "ringCentre" }, angle: 0, radius: 10 }, env()),
    ).toEqual([10, 0]);
  });

  it("offsets a point along an angle", () => {
    expect(
      evalPoint(
        { point: "offset", from: { point: "start", station: "1L" }, along: 0, distance: 10 },
        env(),
      ),
    ).toEqual([0, -10]);
  });

  it("joins two hands at one shared floor point, read from where the dancers are *now*", () => {
    const node = {
      point: "joinPoint",
      a: { station: "self" },
      aSide: "L",
      b: { station: "ringShift", places: 1 },
      bSide: "R",
    } as const;
    const got = evalPoint(node, withPasses());

    // The same point the ring's own `joinPoint` makes of the two live spots —
    // and nowhere near the two start spots, which is the whole reason the
    // language has a `live` node at all.
    expect(got).toEqual(joinPoint(LIVE["1L"]!, "L", LIVE["1R"]!, "R"));
    expect(dist(got, joinPoint(SQUARE["1L"]!, "L", SQUARE["1R"]!, "R"))).toBeGreaterThan(50);
  });
});

describe("AngleExpr", () => {
  it("is a literal or a parameter", () => {
    expect(evalAngle(180, env())).toBe(180);
    expect(evalAngle({ param: "places" }, env())).toBe(3);
  });

  it("takes the bearing from one point to another", () => {
    expect(
      evalAngle(
        {
          angle: "bearing",
          from: { point: "start", station: "1L" },
          to: { point: "start", station: "1R" },
        },
        env(),
      ),
    ).toBe(0);
  });

  it("reads a dancer's facing in each of the three senses", () => {
    expect(evalAngle({ angle: "facingOf", station: "1L", at: "start" }, withPasses())).toBe(90);
    expect(evalAngle({ angle: "facingOf", station: "1L", at: "end" }, withPasses())).toBe(45);
    expect(evalAngle({ angle: "facingOf", station: "1L", at: "live" }, withPasses())).toBe(0);
  });
});

describe("a spec is data", () => {
  it("every node survives a round trip through JSON", () => {
    const node = {
      point: "polar",
      centre: { point: "ringCentre" },
      angle: {
        angle: "bearing",
        from: { point: "start", station: { station: "self" } },
        to: { point: "ringCentre" },
      },
      radius: { number: "mul", of: [{ param: "places" }, 2] },
    } as const;
    const copy = JSON.parse(JSON.stringify(node)) as typeof node;
    expect(copy).toEqual(node);
    expect(evalPoint(copy, env())).toEqual(evalPoint(node, env()));
  });
});
