import { describe, expect, it } from "vitest";
import { planContext } from "../figures/ContraFigure.js";
import { CONTRA_ROLES } from "../roles.js";
import type { ExprEnv } from "./expr.js";
import {
  evalAngle,
  evalBool,
  evalMoment,
  evalNumber,
  evalPoint,
  evalRole,
  evalSide,
  roleShift,
} from "./expr.js";

/**
 * The expression calculus, re-targeted on to figure-roles.
 *
 * What is tested here is the re-targeting and the three passes, not the
 * arithmetic the data layer already proved: that `{ role }` leaves resolve
 * against the *instance*, that a role shift wraps through its cast order, that
 * `{ point: "anchor" }` is the shape's own origin, and that reading a pass that
 * has not run throws instead of answering wrongly.
 */

const STATIONS = [
  { id: "a", role: "lark" as const, p: [0, -10] as [number, number], facing: 90 },
  { id: "b", role: "robin" as const, p: [0, 10] as [number, number], facing: 270 },
  { id: "c", role: "lark" as const, p: [20, 0] as [number, number], facing: 180 },
];

const env = (over: Partial<ExprEnv> = {}): ExprEnv => ({
  ctx: planContext(STATIONS, CONTRA_ROLES, 14, {}),
  params: { turns: 2, hand: "L", openOut: true, inward: 45 },
  beats: 8,
  self: "a",
  t: 0,
  order: ["a", "b", "c"],
  anchor: [3, 4],
  ...over,
});

describe("the calculus's leaves", () => {
  it("reads a number from a literal, a parameter, a choice and a product", () => {
    expect(evalNumber(7, env())).toBe(7);
    expect(evalNumber({ param: "turns" }, env())).toBe(2);
    expect(evalNumber({ number: "select", on: "hand", cases: { L: -1, R: 1 } }, env())).toBe(-1);
    expect(evalNumber({ number: "mul", of: [3, { param: "turns" }] }, env())).toBe(6);
    expect(evalNumber({ number: "sum", of: [90, { param: "inward" }] }, env())).toBe(135);
  });

  it("names the parameter, and what was there instead, when one is wrong", () => {
    expect(() => evalNumber({ param: "nope" }, env())).toThrow(/no parameter "nope"/);
    expect(() => evalNumber({ param: "hand" }, env())).toThrow(/not a number/);
    expect(() => evalBool({ param: "turns" }, env())).toThrow(/not a boolean/);
    expect(() => evalSide({ param: "turns" }, env())).toThrow(/not "L" or "R"/);
  });

  it("reads a truth and a hand off a parameter", () => {
    expect(evalBool({ param: "openOut" }, env())).toBe(true);
    expect(evalBool(false, env())).toBe(false);
    expect(evalSide({ param: "hand" }, env())).toBe("L");
    expect(evalSide("R", env())).toBe("R");
  });

  it("every number is an angle, because an angle is a number", () => {
    expect(evalAngle({ number: "sum", of: [90, { param: "inward" }] }, env())).toBe(135);
    expect(evalAngle(180, env())).toBe(180);
  });

  it("counts a moment from the start or from the end", () => {
    expect(evalMoment(1.4, env())).toBe(1.4);
    expect(evalMoment({ fromEnd: 1.4 }, env())).toBeCloseTo(6.6, 9);
    expect(evalMoment({ fromEnd: 0 }, env())).toBe(8);
  });
});

describe("a role expression is about the figure, not the formation", () => {
  it("names a role outright, or the one the expression is being read for", () => {
    expect(evalRole("b", env())).toBe("b");
    expect(evalRole({ role: "self" }, env())).toBe("a");
    expect(evalRole({ role: "self" }, env({ self: "c" }))).toBe("c");
  });

  it("shifts through the instance's own cast order, and wraps both ways", () => {
    expect(evalRole({ role: "shift", places: 1 }, env())).toBe("b");
    expect(evalRole({ role: "shift", places: 2 }, env())).toBe("c");
    expect(evalRole({ role: "shift", places: 3 }, env())).toBe("a");
    expect(evalRole({ role: "shift", places: -1 }, env())).toBe("c");
    expect(roleShift(["lark", "robin"], "robin", 1)).toBe("lark");
  });

  it("says so when a role is not in the instance at all", () => {
    expect(() => roleShift(["a", "b"], "z", 1)).toThrow(/"z" is not in \[a, b\]/);
  });
});

describe("the three passes", () => {
  it("reads the anchor as the shape's own origin", () => {
    expect(evalPoint({ point: "anchor" }, env())).toEqual([3, 4]);
  });

  it("reads a start place without any pass having run", () => {
    expect(evalPoint({ point: "start", role: "b" }, env())).toEqual([0, 10]);
    expect(evalPoint({ point: "start", role: { role: "self" } }, env())).toEqual([0, -10]);
  });

  it("throws rather than guessing when a pass has not run", () => {
    expect(() => evalPoint({ point: "end", role: "a" }, env())).toThrow(/ends pass has not run/);
    expect(() => evalPoint({ point: "live", role: "a" }, env())).toThrow(
      /position pass has not run/,
    );
  });

  it("reads an end and a live place once their passes have", () => {
    const ends = { a: { p: [1, 2] as [number, number], facing: 0 } };
    expect(evalPoint({ point: "end", role: "a" }, env({ ends }))).toEqual([1, 2]);
    expect(() => evalPoint({ point: "end", role: "b" }, env({ ends }))).toThrow(
      /no end for role "b"/,
    );
    const live = env({ live: () => ({ p: [5, 6], facing: 12 }) });
    expect(evalPoint({ point: "live", role: "b" }, live)).toEqual([5, 6]);
    expect(evalAngle({ angle: "facingOf", role: "b", at: "live" }, live)).toBe(12);
  });

  it("builds the points a hold needs out of live places", () => {
    const live = env({ live: (role) => ({ p: role === "a" ? [0, 0] : [10, 0], facing: 0 }) });
    expect(
      evalPoint(
        { point: "midpoint", a: { point: "live", role: "a" }, b: { point: "live", role: "b" } },
        live,
      ),
    ).toEqual([5, 0]);
    const joined = evalPoint({ point: "joinPoint", a: "a", aSide: "R", b: "b", bSide: "L" }, live);
    expect(joined[0]).toBeGreaterThan(0);
    expect(joined[0]).toBeLessThan(10);
  });

  it("reads a bearing between two points as an angle", () => {
    expect(
      evalAngle(
        {
          angle: "bearing",
          from: { point: "start", role: "a" },
          to: { point: "start", role: "b" },
        },
        env(),
      ),
    ).toBeCloseTo(90, 9);
  });
});
