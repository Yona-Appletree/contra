import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { planContext } from "../figures/ContraFigure.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { CONTRA_ROLES } from "../roles.js";
import { createContraRegistry } from "../figures/registry.js";
import { modelFromSet } from "../set/SetModel.js";
import { resolveCall } from "../set/resolve.js";
import type { FigureDefinition } from "./FigureDefinition.js";
import { createLibrary } from "./Library.js";
import { contraDataEngine } from "./engine.js";
import { DATA_DEFINITIONS, DATA_IDS, contraLibrary } from "./figures/index.js";
import { anchorOf, figureFor, interpretDefinition } from "./interpret.js";
import { balanceRingDefinition } from "./figures/balance-ring.js";
import { swingDefinition } from "./figures/swing.js";

/**
 * The interpreter, the library it builds, and the two rules resolution gained.
 *
 * The geometry is each figure's own golden; what is here is the wiring the five
 * migrations share, and the mistakes it is meant to make impossible.
 */

const HALL = createHall(DUPLE_IMPROPER, [{ id: "s", couples: 4, centre: [0, 0], axis: 90 }]);
const SET = HALL.sets[0]!;
const MODEL = modelFromSet(DUPLE_IMPROPER, SET, new Map());
const GROUPS = DUPLE_IMPROPER.groupsFor("hands-four", SET).filter((g) => g.kind === "set");

const resolve = (figure: string, params: object, library = contraLibrary(createContraRegistry())) =>
  resolveCall(
    { figure, beats: 8, params },
    { model: MODEL, formation: DUPLE_IMPROPER, library, groups: [GROUPS[0]!] },
    0,
  );

describe("the library", () => {
  it("holds a definition for every coded figure, and the sixteen as data", () => {
    const library = contraLibrary(createContraRegistry());
    for (const id of createContraRegistry().ids()) {
      if (id === "wait-out" || id === "walk-to-station") continue;
      expect(library.has(id), id).toBe(true);
    }
    for (const id of DATA_IDS) {
      expect(library.get(id).shape.kind, id).not.toBe("legacy");
    }
  });

  it("no longer bridges the sixteen", () => {
    // The milestone's own definition of "migrated": the legacy bridge does not
    // wrap these any more, so deleting the coded figure would not change
    // what the planner resolves against.
    const library = contraLibrary(createContraRegistry());
    for (const def of DATA_DEFINITIONS) {
      expect(library.get(def.id), def.id).toBe(def);
    }
  });

  it("every definition is plain data", () => {
    for (const def of DATA_DEFINITIONS) {
      expect(JSON.parse(JSON.stringify(def)), def.id).toEqual(def);
    }
  });

  it("interprets each definition once, so the plan cache can key on identity", () => {
    expect(interpretDefinition(swingDefinition)).toBe(interpretDefinition(swingDefinition));
  });

  it("builds a registry and a library that agree about all of them", () => {
    const { registry, library } = contraDataEngine();
    for (const id of DATA_IDS) {
      expect(registry.get(id), id).toBe(figureFor(library.get(id), registry));
    }
  });
});

describe("the interpreter refuses what it cannot draw", () => {
  // M2's "names the milestone that owns a shape kind it has not got" ran on
  // `ringWalk`, which M4 implements; there is no unimplemented kind left in the
  // union for it to name until M5 adds `schedule`. The contract itself — a kind
  // arriving without an arm is a named error rather than a silently missing
  // case — is held by `kinds/index.ts`'s exhaustive `switch`, which fails the
  // build instead of a test, and by the actors and anchor rules below.

  it("will not interpret a legacy shape, which is the coded figure itself", () => {
    const bridged: FigureDefinition = {
      ...swingDefinition,
      id: "bridged",
      shape: { kind: "legacy", figure: "swing" },
    };
    expect(() => interpretDefinition(bridged)).toThrow(/use `figureFor` with a registry/);
  });

  // **Nothing is owed here any more.** M2 refused `"each"` and the two
  // parameterised anchors by name with `(M7)` in the message; M7 built all
  // three, so what were refusals are claims. The contract that an unbuilt kind
  // is a named error rather than a silent gap is held by `kinds/index.ts`'s
  // exhaustive `switch`, which fails the build rather than a test.

  it('makes one instance per dancer for `actors: "each"` (M7)', () => {
    const alone: FigureDefinition = { ...swingDefinition, id: "alone", actors: "each" };
    const instances = resolve("alone", {}, createLibrary([alone])).filter((i) => !i.holdPlace);
    // Four dancers of a minor set, four instances, one part each, nobody twice.
    expect(instances).toHaveLength(4);
    expect(new Set(instances.flatMap((i) => Object.values(i.cast))).size).toBe(4);
    for (const instance of instances) expect(Object.keys(instance.cast)).toHaveLength(1);
  });

  it("anchors on a named pivot dancer, who is standing still (M7)", () => {
    const anchored: FigureDefinition = {
      ...swingDefinition,
      id: "pivoted",
      anchor: { pivot: "lark" },
    };
    const instances = resolve("pivoted", { pairs: "neighbors" }, createLibrary([anchored])).filter(
      (i) => !i.holdPlace,
    );
    expect(instances.length).toBeGreaterThan(0);
    const ctx = planContext(
      [
        { id: "lark", role: "lark", p: [-16, -10], facing: 90 },
        { id: "robin", role: "robin", p: [16, -10], facing: 90 },
      ],
      CONTRA_ROLES,
      14,
      {},
    );
    // The anchor *is* the pivot: not the midpoint, not the centroid. And the
    // axis runs from the pivot toward whoever is casting round them, which is
    // the radius the caster rides.
    expect(anchorOf({ pivot: "lark" }, ctx, ["lark", "robin"]).centre).toEqual([-16, -10]);
    expect(anchorOf({ pivot: "lark" }, ctx, ["lark", "robin"]).axis).toBeCloseTo(0, 9);
    expect(anchorOf({ pivot: "robin" }, ctx, ["lark", "robin"]).centre).toEqual([16, -10]);
  });

  it("casts a same-role pair by position, and `trade` swaps it (Q10, M7)", () => {
    const [one] = resolve("swing", { pairs: [["1L", "2L"]] }).filter((i) => !i.holdPlace);
    expect(one, "two larks now dance a swing rather than throwing").toBeDefined();
    const cast = one!.cast;
    expect(Object.keys(cast).sort()).toEqual(["lark", "robin"]);
    // Both dancers really are larks; one of them is dancing the robin's part.
    for (const dancer of Object.values(cast)) expect(dancer).toMatch(/lark$/);

    const [traded] = resolve("swing", { pairs: [["1L", "2L"]], trade: true }).filter(
      (i) => !i.holdPlace,
    );
    expect(traded!.cast["lark"]).toBe(cast["robin"]);
    expect(traded!.cast["robin"]).toBe(cast["lark"]);
  });
});

describe("resolution of a data figure", () => {
  it("makes one instance per pair, cast into the figure's own roles", () => {
    const instances = resolve("swing", { pairs: "neighbors" });
    const dancing = instances.filter((i) => !i.holdPlace);
    expect(dancing).toHaveLength(2);
    for (const instance of dancing) {
      expect(Object.keys(instance.cast).sort()).toEqual(["lark", "robin"]);
      expect(instance.group.stations.map((s) => s.id).sort()).toEqual(["lark", "robin"]);
      // The instance's frame is the set's, not one of its own.
      expect(instance.frame).toBe(GROUPS[0]!.frame);
    }
    // Disjoint: four dancers, four parts, nobody twice.
    const cast = dancing.flatMap((i) => Object.values(i.cast));
    expect(new Set(cast).size).toBe(4);
  });

  it("gives the pairing's leftovers a hold-place instance", () => {
    const instances = resolve("allemande", { pairs: [["1L", "2L"]] });
    const dancing = instances.filter((i) => !i.holdPlace);
    const standing = instances.filter((i) => i.holdPlace);
    expect(dancing).toHaveLength(1);
    expect(standing).toHaveLength(1);
    expect(Object.keys(standing[0]!.cast).sort()).toEqual(["1R", "2R"]);
  });

  it("pairs by a relation resolved against the live set, not by station ids", () => {
    const neighbours = resolve("swing", { pairs: "neighbors" })
      .filter((i) => !i.holdPlace)
      .map((i) => Object.values(i.cast).sort().join("+"))
      .sort();
    const partners = resolve("swing", { pairs: "partners" })
      .filter((i) => !i.holdPlace)
      .map((i) => Object.values(i.cast).sort().join("+"))
      .sort();
    expect(neighbours).not.toEqual(partners);
    // In duple improper a partner is across the set and a neighbour is along
    // the line, which is the relation table's answer and not the station ids'.
    expect(partners).toEqual(["s/c0/lark+s/c0/robin", "s/c1/lark+s/c1/robin"]);
  });

  it("hands a gatherer the formation's places and the other pair's centre", () => {
    const dancing = resolve("swing", { pairs: "neighbors" }).filter((i) => !i.holdPlace);
    for (const instance of dancing) {
      expect((instance.params["homes"] as unknown[]).length).toBe(4);
      expect((instance.params["nearby"] as unknown[]).length).toBe(2);
    }
  });

  it("hands a figure that does not gather no places at all", () => {
    const dancing = resolve("balance", { pairs: "neighbors" }).filter((i) => !i.holdPlace);
    for (const instance of dancing) {
      expect(instance.params["homes"]).toEqual([]);
    }
  });

  it("takes a ring in one instance over everybody the call selected", () => {
    const instances = resolve("balance-ring", {});
    const dancing = instances.filter((i) => !i.holdPlace);
    expect(dancing).toHaveLength(1);
    expect(Object.keys(dancing[0]!.cast)).toEqual(balanceRingDefinition.roles);
  });
});
