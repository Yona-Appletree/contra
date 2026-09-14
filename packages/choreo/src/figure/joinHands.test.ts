import { describe, expect, it } from "vitest";
import type { RoleSet } from "../formation/Formation.js";
import { joinHands, joinedOrder } from "./joinHands.js";

const ROLES: RoleSet = { roles: ["lark", "robin"], top: "robin" };
const OTHER: RoleSet = { roles: ["up", "down"], top: "up" };

describe("joining hands", () => {
  it("gives both dancers one shared floor point", () => {
    const hands = joinHands([3, 4], 10, ["lark", "robin"], ROLES);
    expect(hands["lark"]!.p).toEqual([3, 4]);
    expect(hands["robin"]!.p).toEqual(hands["lark"]!.p);
  });

  it("leaves the two hands at the same height by default", () => {
    const hands = joinHands([0, 0], 10, ["lark", "robin"], ROLES);
    expect(hands["lark"]!.drop).toBe(10);
    expect(hands["robin"]!.drop).toBe(10);
  });

  it("puts the role set's top role's hand higher when asked to", () => {
    const hands = joinHands([0, 0], 10, ["lark", "robin"], ROLES, 1);
    expect(hands["robin"]!.drop).toBeLessThan(hands["lark"]!.drop);
    expect(hands["robin"]!.drop + hands["lark"]!.drop).toBe(20);
  });

  it("does not care which role is named first", () => {
    const a = joinHands([0, 0], 10, ["lark", "robin"], ROLES, 1);
    const b = joinHands([0, 0], 10, ["robin", "lark"], ROLES, 1);
    expect(a).toEqual(b);
  });

  it("reads the top role from the role set, so it never names a lark", () => {
    const hands = joinHands([0, 0], 10, ["up", "down"], OTHER, 1);
    expect(hands["up"]!.drop).toBeLessThan(hands["down"]!.drop);
  });

  it("orders a pair for the renderer, top first", () => {
    const a = { role: "lark", hand: { p: [0, 0] as [number, number], drop: 10 } };
    const b = { role: "robin", hand: { p: [0, 0] as [number, number], drop: 10 } };
    expect(joinedOrder(a, b, ROLES)[0]!.role).toBe("robin");
    expect(joinedOrder(b, a, ROLES)[0]!.role).toBe("robin");
  });
});
