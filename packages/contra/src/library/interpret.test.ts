import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { createContraRegistry } from "../figures/registry.js";
import { modelFromSet } from "../set/SetModel.js";
import { resolveCall } from "../set/resolve.js";
import type { FigureDefinition } from "./FigureDefinition.js";
import { createLibrary } from "./Library.js";
import { contraDataEngine } from "./engine.js";
import { GATHERER_DEFINITIONS, GATHERER_IDS, contraLibrary } from "./figures/index.js";
import { figureFor, interpretDefinition } from "./interpret.js";
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
  it("holds a definition for every coded figure, and the five as data", () => {
    const library = contraLibrary(createContraRegistry());
    for (const id of createContraRegistry().ids()) {
      if (id === "wait-out" || id === "walk-to-station") continue;
      expect(library.has(id), id).toBe(true);
    }
    for (const id of GATHERER_IDS) {
      expect(library.get(id).shape.kind, id).not.toBe("legacy");
    }
  });

  it("no longer bridges the five", () => {
    // The milestone's own definition of "migrated": the legacy bridge does not
    // wrap these five any more, so deleting the coded figure would not change
    // what the planner resolves against.
    const library = contraLibrary(createContraRegistry());
    for (const def of GATHERER_DEFINITIONS) {
      expect(library.get(def.id), def.id).toBe(def);
    }
  });

  it("every definition is plain data", () => {
    for (const def of GATHERER_DEFINITIONS) {
      expect(JSON.parse(JSON.stringify(def)), def.id).toEqual(def);
    }
  });

  it("interprets each definition once, so the plan cache can key on identity", () => {
    expect(interpretDefinition(swingDefinition)).toBe(interpretDefinition(swingDefinition));
  });

  it("builds a registry and a library that agree about the five", () => {
    const { registry, library } = contraDataEngine();
    for (const id of GATHERER_IDS) {
      expect(registry.get(id), id).toBe(figureFor(library.get(id), registry));
    }
  });
});

describe("the interpreter refuses what it cannot draw", () => {
  it("names the milestone that owns a shape kind it has not got", () => {
    const later: FigureDefinition = {
      ...swingDefinition,
      id: "later",
      anchor: "centroid",
      shape: { kind: "ringWalk", places: 1, faceOffset: 180, inBeats: 1, outBeats: 1 },
    };
    const fig = interpretDefinition(later);
    expect(() => fig.moves({ ...fig.defaults, beats: 8 } as never, GROUPS[0]!.stations)).toThrow(
      /unsupported: shape kind "ringWalk" \(M4\)/,
    );
  });

  it("will not interpret a legacy shape, which is the coded figure itself", () => {
    const bridged: FigureDefinition = {
      ...swingDefinition,
      id: "bridged",
      shape: { kind: "legacy", figure: "swing" },
    };
    expect(() => interpretDefinition(bridged)).toThrow(/use `figureFor` with a registry/);
  });

  it("names the milestone that owns an actor rule or an anchor it has not got", () => {
    // `"line"` and `"lane"` are M6's and resolve now — a long wave is the whole
    // set — so what is still owed here is `"each"` and the two parameterised
    // anchors.
    const later: FigureDefinition = { ...swingDefinition, id: "later-actors", actors: "each" };
    expect(() => resolve("later-actors", {}, createLibrary([later]))).toThrow(
      /unsupported: actors "each" on "later-actors" \(M7\)/,
    );
    const anchored: FigureDefinition = {
      ...swingDefinition,
      id: "later-anchor",
      anchor: { pivot: "lark" },
    };
    expect(() => resolve("later-anchor", {}, createLibrary([anchored]))).toThrow(
      /unsupported: anchor .*pivot.* on "later-anchor" \(M4\)/,
    );
  });

  it("says so when a swing is asked of two dancers of the same role (M7)", () => {
    expect(() => resolve("swing", { pairs: [["1L", "2L"]] })).toThrow(
      /wants a lark and a robin, and the call paired two larks \(M7\)/,
    );
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
      expect((instance.params["places"] as unknown[]).length).toBe(4);
      expect((instance.params["nearby"] as unknown[]).length).toBe(2);
    }
  });

  it("hands a figure that does not gather no places at all", () => {
    const dancing = resolve("balance", { pairs: "neighbors" }).filter((i) => !i.holdPlace);
    for (const instance of dancing) {
      expect(instance.params["places"]).toEqual([]);
    }
  });

  it("takes a ring in one instance over everybody the call selected", () => {
    const instances = resolve("balance-ring", {});
    const dancing = instances.filter((i) => !i.holdPlace);
    expect(dancing).toHaveLength(1);
    expect(Object.keys(dancing[0]!.cast)).toEqual(balanceRingDefinition.roles);
  });
});
