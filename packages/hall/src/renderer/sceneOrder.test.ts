import type { Hand } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { OrderedDancer } from "./sceneOrder.js";
import { sceneOrder } from "./sceneOrder.js";

const ROLE_SET = { top: "robin" };

/** A hand nowhere near any other hand, so it never counts as joined. */
let loose = 0;
const down = (): Hand => ({ p: [1000 + loose++ * 50, 1000], drop: 14 });
const free = (): { L: Hand; R: Hand } => ({ L: down(), R: down() });

const dancer = (
  id: string,
  role: string,
  y: number,
  hands: { L: Hand; R: Hand } = free(),
): OrderedDancer => ({ id, role, p: [0, y], hands });

describe("sceneOrder", () => {
  it("sorts bodies up the screen", () => {
    const list = [dancer("a", "lark", 5), dancer("b", "robin", -3), dancer("c", "lark", 1)];
    expect(sceneOrder(list, ROLE_SET).bodies).toEqual([1, 2, 0]);
  });

  it("leaves unjoined arms in body order", () => {
    const list = [dancer("a", "lark", 5), dancer("b", "robin", -3)];
    const order = sceneOrder(list, ROLE_SET);
    expect(order.arms).toEqual(order.bodies);
    expect(order.stacks).toEqual([
      { L: "free", R: "free" },
      { L: "free", R: "free" },
    ]);
  });

  it("draws the top role's arms last however the pair is arranged", () => {
    const shared: Hand = { p: [0, 0], drop: 5 };
    for (const [robinY, larkY] of [
      [-4, 4],
      [4, -4],
    ] as const) {
      const lark = dancer("lark", "lark", larkY, { L: shared, R: down() });
      const robin = dancer("robin", "robin", robinY, { L: down(), R: shared });
      const order = sceneOrder([lark, robin], ROLE_SET);
      expect(order.arms.indexOf(1)).toBeGreaterThan(order.arms.indexOf(0));
      expect(order.stacks[0]).toEqual({ L: "bottom", R: "free" });
      expect(order.stacks[1]).toEqual({ L: "free", R: "top" });
    }
  });

  it("treats hands within the join epsilon as the same joined hand", () => {
    const lark = dancer("lark", "lark", 0, { L: { p: [0, 0], drop: 5 }, R: down() });
    const near = dancer("robin", "robin", 0, { L: down(), R: { p: [0.05, 0], drop: 5 } });
    const far = dancer("robin", "robin", 0, { L: down(), R: { p: [0.5, 0], drop: 5 } });
    expect(sceneOrder([lark, near], ROLE_SET).stacks[0]).toEqual({ L: "bottom", R: "free" });
    expect(sceneOrder([lark, far], ROLE_SET).stacks[0]).toEqual({ L: "free", R: "free" });
  });

  it("orders a chain of joined dancers without dropping anybody", () => {
    const h1: Hand = { p: [0, 0], drop: 5 };
    const h2: Hand = { p: [10, 0], drop: 5 };
    const lark1 = dancer("l1", "lark", 0, { L: h1, R: down() });
    const robin = dancer("r", "robin", 2, { L: h1, R: h2 });
    const lark2 = dancer("l2", "lark", 4, { L: h2, R: down() });
    const order = sceneOrder([lark1, robin, lark2], ROLE_SET);
    expect([...order.arms].sort()).toEqual([0, 1, 2]);
    expect(order.arms.indexOf(1)).toBe(2);
    expect(order.stacks[1]).toEqual({ L: "top", R: "top" });
  });

  it("is deterministic when two dancers share a y", () => {
    const list = [dancer("b", "lark", 0), dancer("a", "lark", 0)];
    expect(sceneOrder(list, ROLE_SET).bodies).toEqual(sceneOrder(list, ROLE_SET).bodies);
  });
});
