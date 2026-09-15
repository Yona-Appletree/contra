import type { AnyFigureDef, FigureRegistry } from "@caller/choreo";
import { CONTRA_FIGURE_IDS } from "../../figures/registry.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import { createLibrary, type Library } from "../Library.js";
import { interpretDefinition } from "../interpret.js";
import { legacyLibrary } from "../legacy.js";
import { allemandeDefinition } from "./allemande.js";
import { balanceDefinition } from "./balance.js";
import { balanceRingDefinition } from "./balance-ring.js";
import { balanceAndSwingDefinition } from "./balance-and-swing.js";
import { californiaTwirlDefinition } from "./california-twirl.js";
import { circleDefinition } from "./circle.js";
import { doSiDoDefinition } from "./do-si-do.js";
import { grandRightAndLeftDefinition } from "./grand-right-and-left.js";
import { longLinesDefinition } from "./long-lines.js";
import { passThroughDefinition } from "./pass-through.js";
import { petronellaDefinition } from "./petronella.js";
import { pullByDefinition } from "./pull-by.js";
import { rightAndLeftThroughDefinition } from "./right-and-left-through.js";
import { robinsChainDefinition } from "./robins-chain.js";
import { rollAwayDefinition } from "./roll-away.js";
import { slideLeftDefinition } from "./slide-left.js";
import { starDefinition } from "./star.js";
import { swingDefinition } from "./swing.js";

/**
 * **The library's figures**, as data.
 *
 * Three lists, and the split is a real distinction rather than a filing one. A
 * **gatherer** settles people on to the formation's own places (M2's five, and
 * M6's travellers, which leave them somewhere else on purpose). A **carrier**
 * leaves them wherever its own shape put them — M4's eleven — which is what
 * decides the gate each passes: a gatherer is allowed to differ from the figure
 * it replaced once the dancers are off their places, and a carrier is not.
 *
 * After M4 the legacy bridge wraps `hey` and nothing else; M5 empties it.
 *
 * Two lists, because the rebuild has two registries side by side for its whole
 * length: the **library** holds what a figure *is* (a `FigureDefinition`
 * resolution reads) and the **registry** holds what a figure *draws* (a
 * `FigureDef` the timeline samples). A migrated figure has to be in both, under
 * the same id, or `poseAt` would sample the coded geometry while the planner
 * resolved against the data one — see `planCycle.ts`, which refuses that
 * mismatch by name rather than dancing it.
 */

/**
 * M2's five gatherers and M6's two travellers, in the README's order.
 *
 * A **gatherer** settles people on to the formation's places; a **traveller**
 * takes them somewhere else and leaves them there. M6's are travellers to a
 * figure, which is why none of them has `ends: "home"`.
 */
export const GATHERER_DEFINITIONS: readonly FigureDefinition[] = [
  balanceDefinition,
  balanceRingDefinition,
  swingDefinition,
  balanceAndSwingDefinition,
  allemandeDefinition,
  pullByDefinition,
  grandRightAndLeftDefinition,
];

/** The carriers M4 migrated, in the README's own order. */
export const CARRIER_DEFINITIONS: readonly FigureDefinition[] = [
  circleDefinition,
  starDefinition,
  longLinesDefinition,
  doSiDoDefinition,
  passThroughDefinition,
  petronellaDefinition,
  slideLeftDefinition,
  rollAwayDefinition,
  californiaTwirlDefinition,
  rightAndLeftThroughDefinition,
  robinsChainDefinition,
];

/** Every figure the library holds as data. */
export const DATA_DEFINITIONS: readonly FigureDefinition[] = [
  ...GATHERER_DEFINITIONS,
  ...CARRIER_DEFINITIONS,
];

/** Their ids, for the bridge to skip and for a test to check the two lists agree. */
export const GATHERER_IDS: readonly string[] = GATHERER_DEFINITIONS.map((def) => def.id);

/** Every id the library holds as data, which is what the bridge skips. */
export const DATA_IDS: readonly string[] = DATA_DEFINITIONS.map((def) => def.id);

/**
 * The definitions with **no coded twin**: figures that have only ever been data.
 *
 * M2's five and M4's eleven each replaced a coded figure of the same id, so
 * every consumer that walks the coded registry still saw them. M6's are new —
 * nothing in `figures/` answers to `pull-by` — so anything that enumerates
 * figures has to ask for these as well as for `CONTRA_FIGURE_IDS`. The Moves
 * gallery is the one that does. Read off every data definition rather than off
 * the gatherers alone, so a later milestone's genuinely-new figure is caught
 * whichever list it lands in.
 */
export const DATA_ONLY_FIGURE_IDS: readonly string[] = DATA_DEFINITIONS.filter(
  (def) => !CONTRA_FIGURE_IDS.includes(def.id as (typeof CONTRA_FIGURE_IDS)[number]),
).map((def) => def.id);

/**
 * Every definition as a figure the engine can sample, for a registry.
 *
 * `createContraRegistry(contraDataFigures())` is how the new path gets a
 * registry whose `swing` is the data swing.
 */
export const contraDataFigures = (): AnyFigureDef[] =>
  DATA_DEFINITIONS.map((def) => interpretDefinition(def) as unknown as AnyFigureDef);

/**
 * The library the contra planner resolves against: every coded figure bridged,
 * with the migrated definitions replacing their own bridges.
 *
 * `createLibrary` lets a later definition of the same id replace an earlier
 * one, so the bridge no longer wraps them — which is each milestone's own
 * definition of "migrated". After M4 it wraps `hey`.
 */
export function contraLibrary(registry: FigureRegistry): Library {
  const bridged = legacyLibrary(registry);
  const defs = bridged
    .ids()
    .filter((id) => !DATA_IDS.includes(id))
    .map((id) => bridged.get(id));
  return createLibrary([...defs, ...DATA_DEFINITIONS]);
}

export { allemandeDefinition } from "./allemande.js";
export { californiaTwirlDefinition } from "./california-twirl.js";
export { circleDefinition } from "./circle.js";
export { doSiDoDefinition } from "./do-si-do.js";
export { longLinesDefinition } from "./long-lines.js";
export { passThroughDefinition } from "./pass-through.js";
export { rightAndLeftThroughDefinition } from "./right-and-left-through.js";
export { robinsChainDefinition } from "./robins-chain.js";
export { petronellaDefinition } from "./petronella.js";
export { rollAwayDefinition } from "./roll-away.js";
export { slideLeftDefinition } from "./slide-left.js";
export { starDefinition } from "./star.js";
export {
  CARRIER_FORMATIONS,
  MINOR_SET_ROLES,
  bothWays,
  carrierGolden,
  worstOf,
} from "./carriers.js";
export type { CarrierGolden } from "./carriers.js";
export { balanceDefinition, PAIR_ROCK, twoHandRock } from "./balance.js";
export { balanceRingDefinition } from "./balance-ring.js";
export { balanceAndSwingDefinition } from "./balance-and-swing.js";
export { swingDefinition, SWING_HOLD, SWING_ORBIT } from "./swing.js";
export { pullByDefinition } from "./pull-by.js";
export { grandRightAndLeftDefinition } from "./grand-right-and-left.js";
