import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { layoutDancer } from "../person/layoutDancer.js";
import { sceneOrder } from "../renderer/sceneOrder.js";
import { FIXTURES, FIXTURE_NAMES, fixture } from "./fixtures.js";

describe("fixtures", () => {
  it("has the three the milestone asks for", () => {
    expect(FIXTURE_NAMES).toEqual(["facings", "two-hand-hold", "swing"]);
    expect(() => fixture("nope")).toThrow(/no fixture named/);
  });

  it("is the same data every time it is read", () => {
    for (const name of FIXTURE_NAMES) {
      expect(JSON.stringify(fixture(name))).toBe(JSON.stringify(FIXTURES[name]));
    }
  });

  it("never asks for a hand the arm cannot reach", () => {
    // The inviolable invariant: every fixture frame is drawable without an
    // arm pointing at a hand it falls short of.
    for (const name of FIXTURE_NAMES) {
      const f = fixture(name);
      for (const dancer of f.frame.people) {
        const layout = layoutDancer(dancer, f.frame.beat);
        for (const arm of layout.arms) {
          expect(`${name}/${dancer.person.id}: ${arm.short}`).toBe(
            `${name}/${dancer.person.id}: 0`,
          );
        }
      }
    }
  });

  it("shows one dancer at each of the eight facings", () => {
    const facings = fixture("facings").frame.people.map((d) => d.pose.facing);
    expect(facings).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it("holds two hands at the contract's spacing, on two shared floor points", () => {
    const f = fixture("two-hand-hold");
    const [lark, robin] = f.frame.people;
    if (lark === undefined || robin === undefined) throw new Error("expected two dancers");
    expect(dist(lark.pose.p, robin.pose.p)).toBeCloseTo(HOLD_SPACING_PX, 10);

    const order = sceneOrder(
      f.frame.people.map((d) => {
        const l = layoutDancer(d, f.frame.beat);
        return { id: l.person.id, role: l.person.role, p: l.p, hands: l.hands };
      }),
      f.frame.roleSet,
    );
    expect(order.stacks).toEqual([
      { L: "bottom", R: "bottom" },
      { L: "top", R: "top" },
    ]);
  });

  it("draws the robin's arms over the lark's in the swing", () => {
    const f = fixture("swing");
    const layouts = f.frame.people.map((d) => {
      const l = layoutDancer(d, f.frame.beat);
      return { id: l.person.id, role: l.person.role, p: l.p, hands: l.hands };
    });
    const order = sceneOrder(layouts, f.frame.roleSet);
    const robin = layouts.findIndex((l) => l.role === "robin");
    const lark = layouts.findIndex((l) => l.role === "lark");
    expect(order.arms.indexOf(robin)).toBeGreaterThan(order.arms.indexOf(lark));
    expect(order.stacks[robin]?.R).toBe("top");
    expect(order.stacks[lark]?.L).toBe("bottom");
  });
});
