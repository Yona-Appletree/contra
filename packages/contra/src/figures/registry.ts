import type { AnyFigureDef, FigureRegistry } from "@caller/choreo";
import { WALK_TO_STATION, createFigureRegistry } from "@caller/choreo";
import type { ContraFigure } from "./ContraFigure.js";
import type { FigureDefinition } from "../library/FigureDefinition.js";
import { waitOut } from "./wait-out.js";
import { DATA_DEFINITIONS, contraDataFigures } from "../library/figures/index.js";
import { interpretDefinition } from "../library/interpret.js";

/**
 * A figure id to a partial override of its tuning defaults.
 *
 * `withDefaults` already merges a call's own `params` over a figure's
 * `defaults`; this is the same merge, done once at registry build time instead
 * of per call, so every consumer of the registry (a gallery tile, a seam, the
 * decider) picks the override up with no further plumbing.
 *
 * M4 found that it reached the **coded** figures only, because a data figure
 * arrived past the merge. M11 deleted the coded layer, which would have made it
 * reach nothing at all, so the merge moved to where a data figure's defaults
 * really are: the definition's own `params.defaults`, merged before the
 * definition is interpreted. A figure not named in `overrides` is unchanged and
 * is not even re-interpreted.
 */
export type FigureDefaultsOverride = Readonly<Record<string, object>>;

/**
 * **A registry holding every contra figure, plus the two the engine supplies.**
 *
 * Every figure is a `FigureDefinition` read as data (`library/figures/`), and
 * has been since M11 deleted the coded layer the user ruled could go. What the
 * registry holds is each definition **interpreted** into the `ContraFigure` the
 * engine samples: `poseAt` resolves a figure by id *in the registry*, so this
 * and the planner's own library have to be built from the same definitions or
 * a dance would be planned on one figure and drawn on another.
 *
 * `wait-out` and `walk-to-station` are in the registry and in no figure table:
 * the decider needs both whether a dance calls them or not — one for the couple
 * with nobody to dance with, one for the dancers a `who` leaves out — and
 * neither is a figure a dance calls. `wait-out` is the contra wrapper in
 * `wait-out.ts`, which reads the crossing off the formation.
 *
 * `extra` is added last, so a caller may replace any of them by id.
 */
export function createContraRegistry(
  extra: readonly AnyFigureDef[] = [],
  overrides: FigureDefaultsOverride = {},
): FigureRegistry {
  const definitions =
    Object.keys(overrides).length === 0
      ? DATA_DEFINITIONS
      : DATA_DEFINITIONS.map((def) => overridden(def, overrides));
  const figures =
    definitions === DATA_DEFINITIONS
      ? contraDataFigures()
      : definitions.map((def) => interpretDefinition(def) as unknown as AnyFigureDef);
  const registry = createFigureRegistry([
    ...figures,
    waitOut as AnyFigureDef,
    WALK_TO_STATION as AnyFigureDef,
    ...extra,
  ]);
  BUILT_FROM.set(registry, definitions);
  return registry;
}

/**
 * The definitions each registry was built from, so a planner given the registry
 * resolves against **the same** figures the timeline will sample.
 *
 * `poseAt` looks a figure up by id in the registry and the planner resolves a
 * call in its library, so the two have to agree — and with an `overrides` map
 * they only agree if the library is built from the overridden definitions too.
 * The coded layer made this invisible: the override reached the coded figure in
 * the registry and the planner bridged the registry itself. See
 * {@link contraLibrary}, which reads this.
 */
const BUILT_FROM = new WeakMap<FigureRegistry, readonly FigureDefinition[]>();

/** The definitions a registry was built from; the library's own by default. */
export const definitionsBehind = (registry: FigureRegistry): readonly FigureDefinition[] =>
  BUILT_FROM.get(registry) ?? DATA_DEFINITIONS;

/** One definition with its declared defaults overridden, or the definition itself. */
function overridden(def: FigureDefinition, overrides: FigureDefaultsOverride): FigureDefinition {
  const override = overrides[def.id];
  if (override === undefined || def.params.kind !== "canonical") return def;
  return {
    ...def,
    params: { ...def.params, defaults: { ...def.params.defaults, ...override } },
  };
}

/**
 * The contra figure with this id, interpreted, or `undefined` if the engine
 * supplied it (`wait-out`, `walk-to-station`) or nothing answers to it.
 *
 * Interpreted afresh rather than read off a registry so that a caller who only
 * wants a figure's count or its text does not build one.
 */
export function contraFigureOf(id: string): ContraFigure | undefined {
  const def = DATA_DEFINITIONS.find((each) => each.id === id);
  return def === undefined ? undefined : (interpretDefinition(def) as unknown as ContraFigure);
}
