import type { AnyFigureDef, FigureRegistry } from "@caller/choreo";
import type { FigureDefinition } from "../FigureDefinition.js";
import { createLibrary, type Library } from "../Library.js";
import { interpretDefinition } from "../interpret.js";
import { legacyLibrary } from "../legacy.js";
import { allemandeDefinition } from "./allemande.js";
import { balanceDefinition } from "./balance.js";
import { balanceRingDefinition } from "./balance-ring.js";
import { balanceAndSwingDefinition } from "./balance-and-swing.js";
import { swingDefinition } from "./swing.js";

/**
 * **The gatherers**, as data — the five figures M2 migrated.
 *
 * They are the figures that *settle*: a balance closes a pair up, a swing and
 * an allemande turn it and put it down on the formation's own places, and a
 * balance of the ring opens back out on to them. Everything else in the library
 * is still a coded figure reached through the legacy bridge, and M4 and M5
 * empty that bridge.
 *
 * Two lists, because the rebuild has two registries side by side for its whole
 * length: the **library** holds what a figure *is* (a `FigureDefinition`
 * resolution reads) and the **registry** holds what a figure *draws* (a
 * `FigureDef` the timeline samples). A migrated figure has to be in both, under
 * the same id, or `poseAt` would sample the coded geometry while the planner
 * resolved against the data one — see `planCycle.ts`, which refuses that
 * mismatch by name rather than dancing it.
 */

/** The five, in the README's own order. */
export const GATHERER_DEFINITIONS: readonly FigureDefinition[] = [
  balanceDefinition,
  balanceRingDefinition,
  swingDefinition,
  balanceAndSwingDefinition,
  allemandeDefinition,
];

/** Their ids, for the bridge to skip and for a test to check the two lists agree. */
export const GATHERER_IDS: readonly string[] = GATHERER_DEFINITIONS.map((def) => def.id);

/**
 * The five as figures the engine can sample, for a registry.
 *
 * `createContraRegistry(contraDataFigures())` is how the new path gets a
 * registry whose `swing` is the data swing; the app's own registry, which still
 * runs the default planner in M2, is untouched.
 */
export const contraDataFigures = (): AnyFigureDef[] =>
  GATHERER_DEFINITIONS.map((def) => interpretDefinition(def) as unknown as AnyFigureDef);

/**
 * The library the contra planner resolves against: every coded figure bridged,
 * with the five migrated definitions replacing their own bridges.
 *
 * `createLibrary` lets a later definition of the same id replace an earlier
 * one, so the bridge no longer wraps these five — which is the milestone's own
 * definition of "migrated".
 */
export function contraLibrary(registry: FigureRegistry): Library {
  const bridged = legacyLibrary(registry);
  const defs = bridged
    .ids()
    .filter((id) => !GATHERER_IDS.includes(id))
    .map((id) => bridged.get(id));
  return createLibrary([...defs, ...GATHERER_DEFINITIONS]);
}

export { allemandeDefinition } from "./allemande.js";
export { balanceDefinition, PAIR_ROCK, twoHandRock } from "./balance.js";
export { balanceRingDefinition } from "./balance-ring.js";
export { balanceAndSwingDefinition } from "./balance-and-swing.js";
export { swingDefinition, SWING_HOLD, SWING_ORBIT } from "./swing.js";
