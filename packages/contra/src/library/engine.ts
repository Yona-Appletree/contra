import type { AnyFigureDef, FigureRegistry } from "@caller/choreo";
import type { FigureDefaultsOverride } from "../figures/registry.js";
import { createContraRegistry } from "../figures/registry.js";
import { contraDataFigures, contraLibrary } from "./figures/index.js";
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
 * remember both halves. In M2 the app still runs the default planner and the
 * plain `createContraRegistry()`; `pnpm dance` and the per-figure goldens are
 * what run on this, and M3 is where the Stage gains the choice.
 */
export function contraDataEngine(
  extra: readonly AnyFigureDef[] = [],
  overrides: FigureDefaultsOverride = {},
): { registry: FigureRegistry; library: Library } {
  const registry = createContraRegistry([...contraDataFigures(), ...extra], overrides);
  return { registry, library: contraLibrary(registry) };
}

/** The registry half, for a caller that only needs to hand one to the decider. */
export const contraDataRegistry = (
  extra: readonly AnyFigureDef[] = [],
  overrides: FigureDefaultsOverride = {},
): FigureRegistry => contraDataEngine(extra, overrides).registry;
