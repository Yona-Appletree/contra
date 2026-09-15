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
export {
  contraCyclePlanner,
  createContraCyclePlanner,
  legacyCyclePlanner,
} from "./set/planCycle.js";

export type {
  ActorRule,
  AnchorRule,
  BodyStage,
  BodyTarget,
  ContactHand,
  CourtesyEnds,
  CourtesyHands,
  CourtesyPairing,
  CourtesyTurnShape,
  CrossingTrack,
  EndsRule,
  FigureDefinition,
  FigureRole,
  FigureShape,
  HoldPoint,
  HoldSpec,
  HoldWindowSpec,
  IdleHands,
  IdleTrack,
  LegacyShape,
  MateHold,
  OrbitEnds,
  OrbitMotion,
  OrbitPairShape,
  PairHold,
  PairingRule,
  ParamGuard,
  ParamSpec,
  ParamValue,
  PathCurve,
  PathFacing,
  PathLook,
  PathShape,
  PathSpin,
  PathTrack,
  RingFacing,
  RingHold,
  RingTravel,
  RingWalkShape,
  RockShape,
  SequencePart,
  SequenceShape,
  SideRule,
  SoloHold,
  SoloPoint,
  SpeedWindow,
  TimingProfile,
  TurnSpec,
} from "./library/FigureDefinition.js";
export type { HandedMirror, MirrorRule, ParameterMirror, Symmetry } from "./library/symmetry.js";
export { mirror, mirrorParams, mirrors, roleSwap, roleSwapParams } from "./library/symmetry.js";
export type { Library } from "./library/Library.js";
export { createLibrary } from "./library/Library.js";
export type {
  AngleExpr,
  BoolExpr,
  ExprEnv,
  Moment,
  NumberExpr,
  PointExpr,
  PoseExpr,
  RoleExpr,
  SideExpr,
} from "./library/expr.js";
export {
  evalAngle,
  evalBool,
  evalMoment,
  evalNumber,
  evalPoint,
  evalRole,
  evalSide,
  evalSpot,
  roleShift,
} from "./library/expr.js";
export type { InterpretedParams, ResolvedAnchor, ShapeInput } from "./library/interpret.js";
export {
  anchorOf,
  figureFor,
  interpretDefinition,
  joinKey,
  paramDefaults,
  planDefinition,
} from "./library/interpret.js";
export { planCourtesyTurn, planPath, planRingWalk, planShape } from "./library/kinds/index.js";
export type {
  ActiveHold,
  ActiveMateHold,
  ActivePairHold,
  ActiveRingHold,
  ActiveSoloHold,
} from "./library/kinds/holds.js";
export {
  activeHolds,
  endsOfHold,
  idleHandAt,
  joinsHeldAt,
  mateHandAt,
  mateJoinsAt,
  resolveSide,
  soloHandAt,
  soloIsFor,
  soloJoinsAt,
} from "./library/kinds/holds.js";
export { pairUp } from "./library/kinds/pairing.js";
export type { PlacePair } from "./library/kinds/places.js";
export { nearestPlaces, placePairFor, settleOnPlaces } from "./library/kinds/places.js";
export type {
  AllowedDifference,
  CompareCase,
  CompareOptions,
  CompareResult,
  CompareTolerance,
} from "./library/compareFigures.js";
export { DD21_TOLERANCE, compareFigures } from "./library/compareFigures.js";
export { contraDataEngine, contraDataRegistry } from "./library/engine.js";
export type { CarrierGolden } from "./library/figures/index.js";
export {
  CARRIER_DEFINITIONS,
  CARRIER_FORMATIONS,
  DATA_DEFINITIONS,
  DATA_IDS,
  GATHERER_DEFINITIONS,
  GATHERER_IDS,
  DATA_ONLY_FIGURE_IDS,
  MINOR_SET_ROLES,
  PAIR_ROCK,
  SWING_HOLD,
  SWING_ORBIT,
  allemandeDefinition,
  balanceAndSwingDefinition,
  balanceDefinition,
  balanceRingDefinition,
  bothWays,
  californiaTwirlDefinition,
  carrierGolden,
  circleDefinition,
  contraDataFigures,
  contraLibrary,
  doSiDoDefinition,
  longLinesDefinition,
  passThroughDefinition,
  petronellaDefinition,
  rightAndLeftThroughDefinition,
  robinsChainDefinition,
  grandRightAndLeftDefinition,
  pullByDefinition,
  rollAwayDefinition,
  slideLeftDefinition,
  starDefinition,
  swingDefinition,
  twoHandRock,
  worstOf,
} from "./library/figures/index.js";
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
  ALL_DANCES,
  DEMO_DANCES,
  DEMO_DANCE_SLUGS,
  LAB_DANCES,
  danceBySlug,
  ACCEPTANCE_SET,
  UNSUPPORTED_FIGURES,
  UNSUPPORTED_RELATIONS,
  type AcceptanceDance,
  MOTION_ALLOWLIST,
  motionAllowance,
  type MotionAllowance,
  type MotionMetric,
  danceLabReport,
  danceResolution,
  danceOwes,
  endEffects,
  labCouples,
  type DanceLabReport,
  type EndEffectRow,
  type ResolutionRow,
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
