import type { Dance } from "@caller/choreo";
import { WALK_TO_STATION, danceBeats, withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { chainCalls, contraDance } from "./chain.js";
import { CONTRA_FIGURES, CONTRA_FIGURE_IDS, createContraRegistry } from "./registry.js";
import { spotError, stationSpot } from "./testing.js";

describe("the registry", () => {
  it("files every figure under its own id", () => {
    for (const id of CONTRA_FIGURE_IDS) {
      expect(CONTRA_FIGURES[id].id, id).toBe(id);
    }
  });

  it("holds every figure a dance can call, plus the two the engine needs", () => {
    const registry = createContraRegistry();
    for (const id of CONTRA_FIGURE_IDS) expect(registry.has(id), id).toBe(true);
    expect(registry.has("wait-out")).toBe(true);
    expect(registry.has(WALK_TO_STATION.id)).toBe(true);
  });

  it("gives every figure a call, a lead and a duration", () => {
    for (const id of CONTRA_FIGURE_IDS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = CONTRA_FIGURES[id] as import("./ContraFigure.js").ContraFigure<any>;
      expect(def.call.length, id).toBeGreaterThan(0);
      expect(def.lead, id).toBeGreaterThanOrEqual(0);
      expect(def.beats, id).toBeGreaterThan(0);
      // Every figure's parameters fill in from its defaults alone.
      expect(() => withDefaults(def, undefined, def.beats), id).not.toThrow();
    }
  });

  it("throws with the ids it does have when a dance calls something else", () => {
    expect(() => createContraRegistry().get("mad-robin")).toThrow(/no figure "mad-robin"/);
  });

  it("leaves every figure's defaults alone when no override names it", () => {
    const registry = createContraRegistry();
    for (const id of CONTRA_FIGURE_IDS) {
      expect(registry.get(id).defaults, id).toBe(CONTRA_FIGURES[id].defaults);
    }
  });

  it("merges an override over one figure's defaults and leaves the rest untouched", () => {
    const registry = createContraRegistry([], { "robins-chain": { stepInPx: 8 } });
    expect(registry.get("robins-chain").defaults).toEqual({
      ...CONTRA_FIGURES["robins-chain"].defaults,
      stepInPx: 8,
    });
    // Untouched: no key of `overrides` names it.
    expect(registry.get("circle").defaults).toBe(CONTRA_FIGURES.circle.defaults);
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
