import type { FigureDefinition } from "./FigureDefinition.js";

/**
 * The figure definitions a planner may resolve a call against, by id.
 *
 * Deliberately the same three questions `@caller/choreo`'s `FigureRegistry`
 * answers, because the two live side by side for the whole rebuild: the
 * registry holds what a figure *draws* (a `FigureDef` the timeline samples) and
 * the library holds what a figure *is* (a `FigureDefinition` resolution reads).
 * M1's library is entirely legacy definitions pointing back at the registry;
 * by M5 the arrow runs the other way.
 */
export interface Library {
  get(id: string): FigureDefinition;
  has(id: string): boolean;
  ids(): string[];
}

/** A library over `defs`; later definitions of the same id replace earlier ones. */
export function createLibrary(defs: readonly FigureDefinition[] = []): Library {
  const byId = new Map<string, FigureDefinition>();
  for (const def of defs) byId.set(def.id, def);
  return {
    get(id) {
      const def = byId.get(id);
      if (!def)
        throw new Error(`no figure definition "${id}" (have: ${[...byId.keys()].join(", ")})`);
      return def;
    },
    has: (id) => byId.has(id),
    ids: () => [...byId.keys()].sort(),
  };
}
