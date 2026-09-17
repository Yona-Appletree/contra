import type { Dance } from "@caller/choreo";
import { WALK_TO_STATION, danceBeats, withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { chainCalls, contraDance } from "./chain.js";
import { createContraRegistry } from "./registry.js";
import { DATA_DEFINITIONS, DATA_IDS } from "../library/figures/index.js";
import { paramDefaults } from "../library/interpret.js";
import { spotError, stationSpot } from "./testing.js";

describe("the registry", () => {
  it("files every figure under its own id", () => {
    const registry = createContraRegistry();
    for (const id of DATA_IDS) expect(registry.get(id).id, id).toBe(id);
  });

  it("holds every figure a dance can call, plus the two the engine needs", () => {
    const registry = createContraRegistry();
    for (const id of DATA_IDS) expect(registry.has(id), id).toBe(true);
    expect(registry.has("wait-out")).toBe(true);
    expect(registry.has(WALK_TO_STATION.id)).toBe(true);
  });

  // **"gives every figure a call" is gone with the coded layer** (M11). A
  // `FigureDefinition` has no call string of its own: what a caller says is the
  // text layer's, computed from the figure and its parameters, and
  // `interpret.ts` fills the compiled figure's `call` with the id in capitals
  // so that a debugger has something to print. Asserting on it asserted on the
  // coded table's shape, which is what this milestone deleted.
  it("gives every figure a lead and a duration, and fills in from its own defaults", () => {
    const registry = createContraRegistry();
    for (const id of DATA_IDS) {
      const def = registry.get(id);
      expect(def.lead, id).toBeGreaterThanOrEqual(0);
      expect(def.beats, id).toBeGreaterThan(0);
      expect(() => withDefaults(def, undefined, def.beats), id).not.toThrow();
    }
  });

  it("throws with the ids it does have when a dance calls something else", () => {
    // `mad-robin` is a real figure since M5, so the name a missing one is asked
    // for has to be one nothing answers to.
    expect(() => createContraRegistry().get("dolphin-hey")).toThrow(/no figure "dolphin-hey"/);
  });

  it("leaves every figure's declared defaults alone when no override names it", () => {
    const registry = createContraRegistry();
    for (const def of DATA_DEFINITIONS) {
      const built = registry.get(def.id).defaults as Record<string, unknown>;
      for (const [key, value] of Object.entries(paramDefaults(def))) {
        expect(built[key], `${def.id}.${key}`).toEqual(value);
      }
    }
  });

  it("merges an override over one figure's defaults and leaves the rest untouched", () => {
    const registry = createContraRegistry([], { "robins-chain": { stepInPx: 8 } });
    const chain = registry.get("robins-chain").defaults as Record<string, unknown>;
    expect(chain["stepInPx"]).toBe(8);
    const plain = createContraRegistry();
    // Untouched: no key of `overrides` names it, so it is the same figure.
    for (const [key, value] of Object.entries(
      plain.get("circle").defaults as Record<string, unknown>,
    )) {
      if (key === "from" || key === "homes" || key === "slots" || key === "nearby") continue;
      expect((registry.get("circle").defaults as Record<string, unknown>)[key], key).toEqual(value);
    }
  });
});

describe("chaining a dance", () => {
  it("hands each call the places the one before it left", () => {
    const { calls } = chainCalls(DUPLE_IMPROPER, [
      { figure: "circle", beats: 8, params: { places: 3 } },
      { figure: "long-lines", beats: 8 },
    ]);
    const first = calls[0]!.params as {
      from: Record<string, { p: [number, number]; facing: number }>;
    };
    const second = calls[1]!.params as {
      from: Record<string, { p: [number, number]; facing: number }>;
    };
    // The first call starts at the stations; the second starts three places round.
    expect(spotError(first.from["1L"]!, stationSpot(DUPLE_IMPROPER, "1L"))).toBeLessThan(1e-9);
    expect(spotError(second.from["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
  });

  it("leaves the dancers a `who` misses where they were", () => {
    const { ends } = chainCalls(DUPLE_IMPROPER, [
      { figure: "swing", beats: 8, params: { pairs: "neighbors" }, who: "ones" },
    ]);
    // Only the ones danced it, so the twos are still on their own stations.
    expect(spotError(ends["2L"]!, stationSpot(DUPLE_IMPROPER, "2L"))).toBeLessThan(1e-9);
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
  });

  it("threads nothing through a figure with no coded twin, rather than refusing", () => {
    // Since M6 a dance may call a figure that is only a `FigureDefinition`, or
    // one a later milestone still owes. Neither has a hands-four template to
    // walk, and the chain is dead weight on the new path anyway — `planCycle`
    // derives `from` from set state — so the places pass straight through and
    // the call is still in the threaded dance.
    const { calls, ends } = chainCalls(DUPLE_IMPROPER, [
      { figure: "walk-to-station", beats: 8 },
      { figure: "pull-by", beats: 2, params: { pairs: "neighbors" } },
    ]);
    expect(calls.map((c) => c.figure)).toEqual(["walk-to-station", "pull-by"]);
    for (const station of DUPLE_IMPROPER.group(4)) {
      expect(spotError(ends[station.id]!, stationSpot(DUPLE_IMPROPER, station.id))).toBeLessThan(
        1e-9,
      );
    }
  });

  it("builds a dance that is only data", () => {
    const dance: Dance = contraDance({
      slug: "tiny",
      title: "A Tiny Dance",
      author: "M8",
      formation: DUPLE_IMPROPER,
      phrases: [
        { name: "A1", figures: [{ figure: "long-lines", beats: 8 }] },
        { name: "A2", figures: [{ figure: "long-lines", beats: 8 }] },
      ],
    });
    expect(danceBeats(dance)).toBe(16);
    expect(dance.formation).toBe("duple-improper");
    expect(JSON.parse(JSON.stringify(dance))).toEqual(dance);
  });
});
