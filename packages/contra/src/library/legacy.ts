import type { AnyFigureDef, FigureRegistry, StationId } from "@caller/choreo";
import type { ContraFigure } from "../figures/ContraFigure.js";
import type { FigureDefinition, FigureRole } from "./FigureDefinition.js";
import { createLibrary, type Library } from "./Library.js";

/**
 * **The legacy bridge**: a coded `ContraFigure` as a {@link FigureDefinition},
 * so the new resolution path can dance the seventeen figures that exist today
 * while they are migrated one at a time.
 *
 * The bridge's whole contract is that it reproduces today's geometry
 * **exactly** (AC1, `planCycle.golden.test.ts`). A bridged figure keeps the
 * hands-four station ids as its figure-roles, the hands-four template stations
 * and frame as its instance, `from` as the cast dancers' current spots in that
 * frame, and its holds as whatever the coded figure's own `joinsAt` reports.
 * Nothing about what a figure draws changes here; that is M2, M4 and M5.
 *
 * The migration is per figure: `M4`'s first data figure is simply not in this
 * table any more, and by M11 the table is empty and this file is deleted.
 */

/**
 * The figure-roles of a bridged coded figure: the hands-four station ids.
 *
 * A deliberate exception to "figure-roles are parts in this figure" — these
 * *are* places in the formation, because that is exactly what a coded figure is
 * written against. A widened group (`"line"`) binds more stations than these,
 * which the bridge copes with by casting from the group's own stations rather
 * than from this list; the list is what the definition *declares*.
 */
export const LEGACY_ROLES: readonly FigureRole[] = ["1L", "1R", "2L", "2R"];

/** One coded figure, as a definition. */
export function legacyDefinition(fig: ContraFigure): FigureDefinition {
  return {
    id: fig.id,
    nominalBeats: fig.beats,
    roles: LEGACY_ROLES,
    // A coded figure takes the whole minor set and does its own pairing through
    // `params.pairs`; `resolveCall` therefore hands it everybody the call
    // selected, in one instance.
    actors: "all",
    anchor: "hands-four",
    params: { kind: "passthrough" },
    shape: { kind: "legacy", figure: fig.id },
    // Not declared: a coded figure reports what it is holding at any beat
    // through `joinsAt`, and the bridge asks it rather than restating it. M2's
    // first data figures are where `holds` starts carrying anything.
    holds: [],
    // "Wherever the shape put them": the coded figure's own `plan.ends`, which
    // is what `chainCalls` threads today.
    ends: "relative",
    timing: { stretch: "distance", profile: "smooth" },
  };
}

/**
 * Whether a registry entry is a coded contra figure, and therefore bridgeable.
 *
 * Duck-typed on `joins`, which is the half of {@link ContraFigure} the bridge
 * actually needs and which `@caller/choreo`'s own built-ins (`wait-out`,
 * `walk-to-station`, `take-hands`, `thanks`) do not have. Structural rather
 * than a marker field because `createContraRegistry`'s `overrides` spreads a
 * figure into a fresh object, so identity is not available to test on.
 */
export function isContraFigure(def: AnyFigureDef): def is ContraFigure {
  return typeof (def as Partial<ContraFigure>).joins === "function";
}

/** The coded figure behind a `{ kind: "legacy" }` shape, or a clear error. */
export function legacyFigureOf(registry: FigureRegistry, id: string): ContraFigure {
  const def = registry.get(id);
  if (!isContraFigure(def)) {
    throw new Error(`figure "${id}" is not a contra figure, so it cannot be bridged`);
  }
  return def;
}

/**
 * Every coded contra figure in `registry`, bridged.
 *
 * Built from the registry rather than from the `CONTRA_FIGURES` table so that a
 * registry with `overrides` applied — `pnpm figure --chain`, the app's
 * `?chain=` — bridges the overridden figure, and so that a figure a caller
 * registered themselves is reachable from the new path too.
 */
export function legacyLibrary(registry: FigureRegistry): Library {
  const defs: FigureDefinition[] = [];
  for (const id of registry.ids()) {
    const def = registry.get(id);
    if (isContraFigure(def)) defs.push(legacyDefinition(def));
  }
  return createLibrary(defs);
}

/** Whether a station id is one of the hands-four four. For readable errors. */
export const isLegacyRole = (id: StationId): boolean => LEGACY_ROLES.includes(id);
