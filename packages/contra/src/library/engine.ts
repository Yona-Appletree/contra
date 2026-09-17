import type { AnyFigureDef, FigureRegistry } from "@caller/choreo";
import type { FigureDefaultsOverride } from "../figures/registry.js";
import { createContraRegistry } from "../figures/registry.js";
import { contraLibrary } from "./figures/index.js";
import type { Library } from "./Library.js";

/**
 * **The new engine's registry and library, built as one pair.**
 *
 * The rebuild runs two registries side by side for its whole length: the
 * **library** holds what a figure *is* (a `FigureDefinition` that resolution
 * reads) and `@caller/choreo`'s **registry** holds what a figure *draws* (a
 * `FigureDef` the timeline samples). `poseAt` looks a figure up **by id in the
 * registry**, not in the emission, so a migrated figure has to be in both under
 * the same id or the planner would resolve against the data swing while the
 * timeline sampled the coded one.
 *
 * This is the one call that builds a consistent pair, so nothing has to
 * remember both halves. Since M11 it is also the only pair there is — the
 * coded registry the other half of the choice named is deleted — and what it
 * still carries is the `overrides`: a registry built with them was built from
 * overridden **definitions**, and `contraLibrary` gives the planner those same
 * ones, so the two halves are one tuning.
 */
export function contraDataEngine(
  extra: readonly AnyFigureDef[] = [],
  overrides: FigureDefaultsOverride = {},
): { registry: FigureRegistry; library: Library } {
  const registry = createContraRegistry(extra, overrides);
  return { registry, library: contraLibrary(registry) };
}

/** The registry half, for a caller that only needs to hand one to the decider. */
export const contraDataRegistry = (
  extra: readonly AnyFigureDef[] = [],
  overrides: FigureDefaultsOverride = {},
): FigureRegistry => contraDataEngine(extra, overrides).registry;
