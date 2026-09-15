import type { FigureCall } from "@caller/choreo";
import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { createContraRegistry } from "../figures/registry.js";
import { legacyLibrary } from "../library/legacy.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { HOLD_PLACE_FIGURE, resolveCall } from "./resolve.js";
import { modelFromSet } from "./SetModel.js";

/** One call against a live set: who dances it, where, and who stands. */

const REGISTRY = createContraRegistry();
const LIBRARY = legacyLibrary(REGISTRY);

function context(couples: number, selector = "hands-four") {
  const set = createHall(DUPLE_IMPROPER, [{ id: "set0", couples, centre: [0, 0], axis: 90 }])
    .sets[0]!;
  return {
    model: modelFromSet(DUPLE_IMPROPER, set, new Map()),
    formation: DUPLE_IMPROPER,
    library: LIBRARY,
    groups: DUPLE_IMPROPER.groupsFor(selector, set),
  };
}

const swing: FigureCall = { figure: "swing", beats: 8, params: { pairs: "neighbors" } };

describe("resolving one call against the set", () => {
  it("gives every minor set its own instance, over everybody", () => {
    const ctx = context(4);
    const instances = resolveCall(swing, ctx, 0);
    expect(instances).toHaveLength(2);
    for (const instance of instances) {
      expect(instance.figure).toBe("swing");
      expect(instance.holdPlace).toBe(false);
      expect(Object.keys(instance.cast).sort()).toEqual(["1L", "1R", "2L", "2R"]);
      expect(instance.frame).toBe(instance.group.frame);
      expect(instance.beats).toBe(8);
    }
    // Disjoint actors: no dancer is cast twice.
    const cast = instances.flatMap((i) => Object.values(i.cast));
    expect(new Set(cast).size).toBe(cast.length);
  });

  it("leaves a couple standing out of the partition to the cycle's own fill", () => {
    // Five couples: one minor set plus a waiting couple at each parity.
    const instances = resolveCall(swing, context(5), 0);
    expect(instances).toHaveLength(2);
    expect(instances.flatMap((i) => Object.values(i.cast))).toHaveLength(8);
  });

  it("gives the dancers a `who` left out one hold-place instance per group", () => {
    const larks: FigureCall = { ...swing, who: "larks" };
    const instances = resolveCall(larks, context(4), 0);
    expect(instances.map((i) => i.figure)).toEqual([
      "swing",
      HOLD_PLACE_FIGURE,
      "swing",
      HOLD_PLACE_FIGURE,
    ]);
    expect(Object.keys(instances[0]!.cast)).toEqual(["1L", "2L"]);
    expect(Object.keys(instances[1]!.cast)).toEqual(["1R", "2R"]);
    expect(instances[1]!.holdPlace).toBe(true);
  });

  it("takes a relation word in `who`, not only a tag", () => {
    const ctx = context(4);
    // Everybody in a hands-four has a neighbour inside it, so this selects all
    // four — but by *relation*, which is what M6's `who: "N2"` will need.
    const byRelation = resolveCall({ ...swing, who: "N1" }, ctx, 0);
    expect(Object.keys(byRelation[0]!.cast).sort()).toEqual(["1L", "1R", "2L", "2R"]);
  });

  it("no longer refuses a relation that reaches past the minor set (M6)", () => {
    // M1 threw `unsupported: N2 (M6)` here. The tables answer every relation
    // now, so a `who` that names one resolves; whether anybody it names is
    // *reachable* is the pool's question, not the table's, and the hands-four
    // pool answers nobody — see `lane.test.ts` for the pool that answers.
    expect(() => resolveCall({ ...swing, who: "N2" }, context(4), 0)).not.toThrow();
  });

  it("names the start beat it was resolved at", () => {
    expect(resolveCall(swing, context(4), 40)[0]!.start).toBe(40);
  });

  it("survives a JSON round trip: an instance is data", () => {
    const instance = resolveCall(swing, context(4), 0)[0]!;
    expect(JSON.parse(JSON.stringify(instance))).toEqual(instance);
  });
});
