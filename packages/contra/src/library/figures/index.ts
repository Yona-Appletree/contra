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
import { balanceWaveDefinition } from "./balance-wave.js";
import { bendTheLineDefinition } from "./bend-the-line.js";
import { californiaTwirlDefinition } from "./california-twirl.js";
import { circleDefinition } from "./circle.js";
import { circulateDefinition } from "./circulate.js";
import { doSiDoDefinition } from "./do-si-do.js";
import { downTheHallDefinition, upTheHallDefinition } from "./down-the-hall.js";
import { castOffDefinition } from "./cast-off.js";
import { goDownOutsideDefinition, goUpOutsideDefinition } from "./go-down-outside.js";
import { grandRightAndLeftDefinition } from "./grand-right-and-left.js";
import { heyDefinition } from "./hey.js";
import { madRobinDefinition } from "./mad-robin.js";
import { leadDownDefinition, leadUpDefinition } from "./lead-down.js";
import { longLinesDefinition } from "./long-lines.js";
import { loopDefinition } from "./loop.js";
import { passThroughDefinition } from "./pass-through.js";
import { petronellaDefinition } from "./petronella.js";
import { pullByDefinition } from "./pull-by.js";
import { rightAndLeftThroughDefinition } from "./right-and-left-through.js";
import { robinsChainDefinition } from "./robins-chain.js";
import { rollAwayDefinition } from "./roll-away.js";
import { shoulderRoundDefinition } from "./shoulder-round.js";
import { singleFilePromenadeDefinition } from "./single-file-promenade.js";
import { slideLeftDefinition } from "./slide-left.js";
import { starDefinition } from "./star.js";
import { swingDefinition } from "./swing.js";
import { turnAloneDefinition } from "./turn-alone.js";
import { turnAsCouplesDefinition } from "./turn-as-couples.js";
import { turnContraCornersDefinition } from "./turn-contra-corners.js";
import { castBackDefinition } from "./cast-back.js";
import { promenadeDefinition } from "./promenade.js";
import { balanceWaveOfFourDefinition } from "./balance-wave-of-four.js";
import { jerseyTwirlDefinition } from "./jersey-twirl.js";
import { squareThroughDefinition } from "./square-through.js";
import { interruptedSquareThroughDefinition } from "./interrupted-square-through.js";
import { localFigureDefinitions } from "../../dances/danceFiles.js";

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
 * M5 empties the legacy bridge: the hey was the last coded figure left in it.
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

/**
 * **M7's shapes**: the figures that need the set to be in a shape, or to know
 * where a place on the lattice is.
 *
 * A third list beside the gatherers and the carriers, and the split is the same
 * real distinction: none of these replaced a coded figure, so every one of them
 * is data with no twin (`DATA_ONLY_FIGURE_IDS`), and what they share is that a
 * definition of one cannot be written without either a shape with named places
 * or a slot on the lattice. `balance-wave`, `circulate` and `loop` are M6's
 * three, handed over in M6's own report for exactly that reason.
 */
export const SHAPE_DEFINITIONS: readonly FigureDefinition[] = [
  downTheHallDefinition,
  upTheHallDefinition,
  turnAsCouplesDefinition,
  bendTheLineDefinition,
  leadDownDefinition,
  leadUpDefinition,
  turnAloneDefinition,
  goDownOutsideDefinition,
  goUpOutsideDefinition,
  castOffDefinition,
  turnContraCornersDefinition,
  balanceWaveDefinition,
  circulateDefinition,
  loopDefinition,
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

/**
 * **M5's**: the hey, and the three figures On the Prowl needed.
 *
 * A list of its own rather than more carriers, because what they share is the
 * milestone rather than the gate: the hey is held to reproducing the coded
 * weave it replaced, and the other three have no predecessor to be held to at
 * all — they are held to their dances instead.
 */
export const SCHEDULE_DEFINITIONS: readonly FigureDefinition[] = [
  heyDefinition,
  madRobinDefinition,
  shoulderRoundDefinition,
  singleFilePromenadeDefinition,
];

/**
 * **M8's**: the figures the three records of the dance-record milestone needed.
 *
 * `cast-back` and `promenade` are ordinary library figures — 472 corpus dances
 * promenade and 644 cast — and `balance-wave-of-four` is the wave *across* the
 * set, which M7 stopped rather than guess the hand rule for.
 */
export const RECORD_DEFINITIONS: readonly FigureDefinition[] = [
  castBackDefinition,
  promenadeDefinition,
  balanceWaveOfFourDefinition,
];

/**
 * **M9's**: the figures the two Banner dances needed.
 *
 * A list of its own for the same reason M8's is: what they share is the
 * milestone rather than the gate. `square-through` and
 * `interrupted-square-through` are the pull-bys the two dances do inside a
 * diamond, and `jersey-twirl` has no predecessor anywhere.
 *
 * **There is no `diamond` figure** (DD41). M9 wrote one — the cast that made
 * the shape — and the user's review struck it out: *"its not a move. its a
 * place setup."* A diamond is a `SetShapeKind` and nothing else, ordinary
 * figures dance into it, and the call that lands in one says so with a `form`
 * clause. See `set/shape.ts`'s `diamondPlaces` and Jeremy Corners' A1.
 */
export const BANNER_DEFINITIONS: readonly FigureDefinition[] = [
  squareThroughDefinition,
  interruptedSquareThroughDefinition,
  jerseyTwirlDefinition,
];

/**
 * Every figure the library holds as data, the dance files' own **local**
 * figures last (D10, M8).
 *
 * A local figure is a definition literal in a dance file, under the id
 * `<slug>/<name>` — see `dances/danceFiles.ts`. It is in this list for the same
 * reason every other definition is: so a call of one resolves, draws, has a
 * Moves tile and is checked for its parameters like any other. Read as a
 * function rather than spread once, because the dance files are JSON imports
 * and the list has to be built after they are evaluated.
 */
export const DATA_DEFINITIONS: readonly FigureDefinition[] = [
  ...GATHERER_DEFINITIONS,
  ...CARRIER_DEFINITIONS,
  ...SCHEDULE_DEFINITIONS,
  ...SHAPE_DEFINITIONS,
  ...RECORD_DEFINITIONS,
  ...BANNER_DEFINITIONS,
  ...localFigureDefinitions(),
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
export const dataOnlyDefinitions = (): readonly FigureDefinition[] =>
  DATA_DEFINITIONS.filter(
    (def) => !CONTRA_FIGURE_IDS.includes(def.id as (typeof CONTRA_FIGURE_IDS)[number]),
  );

/**
 * Their ids.
 *
 * **A function and not a constant** since M5, and the reason is a cycle:
 * `figures/registry.ts` now asks this module for the figures that exist only
 * here, so that `createContraRegistry()` really does hold every contra figure —
 * which stopped being true the moment the hey had no coded twin. Two modules
 * that import each other are fine as long as neither *evaluates* the other at
 * module scope, and a constant computed from `CONTRA_FIGURE_IDS` does exactly
 * that.
 */
export const dataOnlyFigureIds = (): readonly string[] =>
  dataOnlyDefinitions().map((def) => def.id);

/** Those definitions as figures the engine can sample: the registry's own. */
export const dataOnlyFigures = (): AnyFigureDef[] =>
  dataOnlyDefinitions().map((def) => interpretDefinition(def) as unknown as AnyFigureDef);

/**
 * **Whether only resolution against a real set can plan this figure** (M8).
 *
 * One predicate for a question three places were asking separately — the
 * hands-four template's, the Moves gallery's and the symmetry harness's — and
 * M7's own report asked for exactly that. Two kinds of figure need the set:
 *
 * - one resolution mints **per pair** or **per dancer**, which a harness handed
 *   four stations and one instance cannot cast; and
 * - one whose shape reads the **lattice** — which line of the set a dancer is
 *   standing on — which is not a fact four stations carry. Every wave is one.
 *
 * It goes away with the coded layer (M11), when everything is planned by
 * resolution and there is no other kind of harness left.
 */
export const needsTheSet = (def: FigureDefinition): boolean =>
  (def.actors !== "all" && def.actors !== "ring") || readsTheLattice(def.shape);

/**
 * **Whether this shape names a place on the set's own lattice.**
 *
 * The second half of {@link needsTheSet}, asked of the shape rather than
 * guessed from its kind. M8 wrote it as `kind === "wave"`, which was every
 * figure that read the lattice at the time; M9's retired `diamond` cast was a
 * `sequence` of `path`s whose ends were `{ point: "slot" }`, and the harnesses
 * planned it without a set and got the expression calculus's own refusal by
 * name.
 *
 * A definition is plain data — `figures/*.test.ts` asserts it survives
 * `JSON.parse(JSON.stringify(def))` — so looking for the node is honest and
 * total where a list of kinds is a memory that goes stale.
 */
function readsTheLattice(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(readsTheLattice);
  if (node === null || typeof node !== "object") return false;
  const here = node as Record<string, unknown>;
  if (here["point"] === "slot" || here["kind"] === "wave") return true;
  return Object.values(here).some(readsTheLattice);
}

/**
 * A data-only figure the **hands-four template** can plan, or `undefined`.
 *
 * `chainCalls` threads a dance by handing each figure the four stations of a
 * minor set and asking where it leaves people, which is a question only a figure
 * that takes the whole four in one instance can answer. The hey can (M5): it is
 * `actors: "all"` on the formation's own group, exactly as the coded figure it
 * replaced was, and without this the four demo dances that call one thread
 * nothing through it. A pull-by cannot — `anchor: "meet"` is a figure for two,
 * minted one instance per pair — and says so by name, which is why the test is
 * on the definition rather than on the id.
 */
export function templateFigureOf(id: string): AnyFigureDef | undefined {
  const def = dataOnlyDefinitions().find((each) => each.id === id);
  if (def === undefined || def.actors !== "all") return undefined;
  if (def.anchor !== "hands-four" && def.anchor !== "centroid") return undefined;
  // **And whose shape does not name the lattice** (M8): see {@link needsTheSet}.
  if (needsTheSet(def)) return undefined;
  return interpretDefinition(def) as unknown as AnyFigureDef;
}

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
export { heyDefinition } from "./hey.js";
export { madRobinDefinition } from "./mad-robin.js";
export { shoulderRoundDefinition } from "./shoulder-round.js";
export { singleFilePromenadeDefinition } from "./single-file-promenade.js";
export { DOWN_THE_HALL_PX, downTheHallDefinition, upTheHallDefinition } from "./down-the-hall.js";
export { turnAsCouplesDefinition } from "./turn-as-couples.js";
export { bendTheLineDefinition } from "./bend-the-line.js";
export { LEAD_PX, leadDownDefinition, leadUpDefinition } from "./lead-down.js";
export { turnAloneDefinition } from "./turn-alone.js";
export { goDownOutsideDefinition, goUpOutsideDefinition } from "./go-down-outside.js";
export { castOffDefinition } from "./cast-off.js";
export { turnContraCornersDefinition } from "./turn-contra-corners.js";
export { balanceWaveDefinition } from "./balance-wave.js";
export { circulateDefinition } from "./circulate.js";
export { loopDefinition } from "./loop.js";
export { jerseyTwirlDefinition } from "./jersey-twirl.js";
export { squareThroughDefinition, squareThroughPass } from "./square-through.js";
export { interruptedSquareThroughDefinition } from "./interrupted-square-through.js";
