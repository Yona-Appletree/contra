import { WAIT_OUT, WALK_TO_STATION } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { CONTRA_FIGURE_IDS, CONTRA_FIGURES, createContraRegistry } from "../figures/registry.js";
import { dataOnlyFigureIds } from "./figures/index.js";
import { createLibrary } from "./Library.js";
import { LEGACY_ROLES, isContraFigure, legacyDefinition, legacyLibrary } from "./legacy.js";

/** The legacy bridge: seventeen coded figures, as definitions, as data. */

const REGISTRY = createContraRegistry();

describe("the legacy bridge", () => {
  it("bridges every contra figure in the registry and nothing else", () => {
    const library = legacyLibrary(REGISTRY);
    // **Every figure in the registry, not every *coded* figure.** Since M5 the
    // registry also holds the library's data-only definitions — nothing could
    // draw the hey otherwise — and an interpreted definition has `joins`, so the
    // bridge wraps it like any other. Wrapping it is harmless and is what keeps
    // AC1's all-bridged planner able to dance a dance that calls one:
    // `contraLibrary` replaces every bridged id the library has a definition
    // for, which is the whole of the migration.
    expect(library.ids()).toEqual(
      [...CONTRA_FIGURE_IDS, ...dataOnlyFigureIds()].sort((a, b) => a.localeCompare(b)),
    );
    expect(dataOnlyFigureIds()).toContain("hey");
    // The engine's own figures are not dance-callable and are not bridged.
    expect(library.has(WALK_TO_STATION.id)).toBe(false);
    expect(library.has(WAIT_OUT.id)).toBe(false);
  });

  it("keeps the hands-four station ids as its figure-roles and its anchor", () => {
    for (const id of CONTRA_FIGURE_IDS) {
      const def = legacyLibrary(REGISTRY).get(id);
      expect(def.roles).toEqual(LEGACY_ROLES);
      expect(def.anchor).toBe("hands-four");
      expect(def.actors).toBe("all");
      expect(def.shape).toEqual({ kind: "legacy", figure: id });
      expect(def.ends).toBe("relative");
      expect(def.nominalBeats).toBe(CONTRA_FIGURES[id].beats);
    }
  });

  it("is plain data: every definition survives a JSON round trip", () => {
    for (const id of legacyLibrary(REGISTRY).ids()) {
      const def = legacyLibrary(REGISTRY).get(id);
      expect(JSON.parse(JSON.stringify(def))).toEqual(def);
    }
  });

  it("recognises a coded figure by the half of its contract the bridge needs", () => {
    expect(isContraFigure(REGISTRY.get("swing"))).toBe(true);
    expect(isContraFigure(WALK_TO_STATION)).toBe(false);
  });

  it("bridges a figure whose defaults an override replaced", () => {
    const overridden = createContraRegistry([], { swing: { endHalf: 12 } });
    expect(legacyLibrary(overridden).has("swing")).toBe(true);
    expect((overridden.get("swing").defaults as { endHalf: number }).endHalf).toBe(12);
  });
});

describe("the library", () => {
  it("names what it has when asked for something it does not", () => {
    expect(() => createLibrary([legacyDefinition(CONTRA_FIGURES.swing)]).get("hey")).toThrow(
      /no figure definition "hey" \(have: swing\)/,
    );
  });

  it("lets a later definition of the same id replace an earlier one", () => {
    const first = legacyDefinition(CONTRA_FIGURES.swing);
    const second = { ...first, nominalBeats: 99 };
    expect(createLibrary([first, second]).get("swing").nominalBeats).toBe(99);
  });
});
