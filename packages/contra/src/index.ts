// @caller/contra — contra as one form on top of the form-neutral model in
// `@caller/choreo`: the role set, the formations, and (from M8) the figure
// library and the encoded dances. See README.md.

export { CONTRA_ROLES, LARK, ROBIN } from "./roles.js";

export {
  ACROSS_PX,
  DUPLE_IMPROPER,
  DUPLE_IMPROPER_LATTICE,
  DUPLE_IMPROPER_LINE_UP_CALLS,
  DUPLE_IMPROPER_RELATIONS,
  DUPLE_IMPROPER_STATIONS,
  DUPLE_IMPROPER_WAIT_STATIONS,
  PLACE_PITCH_PX,
  partitionDupleImproper,
} from "./formation/dupleImproper.js";

export {
  BECKET,
  BECKET_LATTICE,
  BECKET_LINE_UP_CALLS,
  BECKET_RELATIONS,
  BECKET_STATIONS,
  BECKET_TOP_OFFSET_PX,
  BECKET_WAIT_STATIONS,
  COUPLE_PITCH_PX,
  becketHandsFourCalls,
  partitionBecket,
} from "./formation/becket.js";

// The hub: set state and resolution (`src/set/`), and the figure library
// (`src/library/`). See the package README.
export type { DancerState, Hold, SetLattice, SetModel, SetShape, Slot } from "./set/SetModel.js";
export { dancerOnSlot, homeOf, modelFromSet, mustDancer, sameSlot } from "./set/SetModel.js";
export type { Relation, RelationTable } from "./set/relations.js";
export {
  isRelationWord,
  parseRelation,
  relate,
  relationWord,
  unsupportedRelation,
} from "./set/relations.js";
export type { SetRules } from "./set/SetRules.js";
export { CONTRA_SET_RULES, setRulesFor, setRulesOf } from "./set/SetRules.js";
export type { FigureInstance, ResolveContext } from "./set/resolve.js";
export { HOLD_PLACE_FIGURE, resolveActors, resolveCall } from "./set/resolve.js";
export type { ContraCyclePlannerOptions } from "./set/planCycle.js";
export { contraCyclePlanner, createContraCyclePlanner } from "./set/planCycle.js";

export type {
  ActorRule,
  AnchorRule,
  EndsRule,
  FigureDefinition,
  FigureRole,
  FigureShape,
  HoldSpec,
  ParamSpec,
  TimingProfile,
} from "./library/FigureDefinition.js";
export type { Library } from "./library/Library.js";
export { createLibrary } from "./library/Library.js";
export {
  LEGACY_ROLES,
  isContraFigure,
  isLegacyRole,
  legacyDefinition,
  legacyFigureOf,
  legacyLibrary,
} from "./library/legacy.js";

export { BECKET_RIGHT } from "./formation/becketRight.js";

export * from "./figures/index.js";
export * from "./pair/index.js";

export {
  DEMO_DANCES,
  DEMO_DANCE_SLUGS,
  danceBySlug,
  danceFromFile,
  type DanceFile,
  type DanceFileSource,
  CONTRA_FORMATIONS,
  formationById,
  LARKS,
  ROBINS,
  BECKET_LINES,
  CLOSURE_PX,
  COLLISION_PX,
  DUPLE_LINES,
  danceAlone,
  formationFor,
  linesFor,
  oraclesFor,
  type DanceOracles,
  type DanceRunOptions,
} from "./dances/index.js";

export * from "./text/index.js";

export { normaliseTitle, titleKey } from "./corpus/normaliseTitle.js";

/** Package identity, kept from the M1 scaffold smoke test. */
export const packageName = "@caller/contra";
