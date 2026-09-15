// The contra figure library: every figure the demo's dances call, on
// `@caller/choreo`'s figure contract, plus the registry a decider dances from.

export type {
  ContraFigure,
  ContraFigureSpec,
  ContraParams,
  FigurePlan,
  HandJoin,
  HoldWindow,
  LocalHand,
  LocalSample,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
export {
  CHAIN_FRAME,
  PLAN_CACHE_SIZE,
  asPose,
  bearing,
  centreOf,
  clearPlanCache,
  contraFigure,
  holdWindow,
  isHeld,
  joinPoint,
  joinedHands,
  passRight,
  planCacheSize,
  planContext,
  polar,
  spotGap,
  takeAndRelease,
  worldHand,
  worldPose,
  worldSpot,
} from "./ContraFigure.js";

export type { Pairing } from "./pairing.js";
export {
  NEIGHBORS,
  PARTNERS,
  mustPair,
  mustSpot,
  pairedWith,
  pairsOf,
  ringOrder,
} from "./pairing.js";

export type { Ring, RingWalk } from "./ring.js";
export { ringFor, ringHands, ringOf, ringShift, ringWalk } from "./ring.js";

export type { CircleParams } from "./circle.js";
export { circle } from "./circle.js";

export type { LongLinesParams } from "./long-lines.js";
export { longLines } from "./long-lines.js";

export type { PassThroughParams } from "./pass-through.js";
export { facingPairs, passThrough } from "./pass-through.js";

export type { SlideLeftParams } from "./slide-left.js";
export { slideLeft } from "./slide-left.js";

export type { StarParams } from "./star.js";
export { star } from "./star.js";

export type { BalanceParams } from "./balance.js";
export { balance, balanceRing } from "./balance.js";

export type { EndFacing, SwingParams } from "./swing.js";
export { endFacingOf, placeHalf, stationHalf, swing } from "./swing.js";

export type { AllemandeParams } from "./allemande.js";
export { allemande } from "./allemande.js";

export type { DoSiDoParams } from "./do-si-do.js";
export { doSiDo } from "./do-si-do.js";

export type { PetronellaParams } from "./petronella.js";
export { petronella } from "./petronella.js";

export type { CaliforniaTwirlParams } from "./california-twirl.js";
export { californiaTwirl, insideSide } from "./california-twirl.js";

export type { RollAwayParams } from "./roll-away.js";
export { rollAway } from "./roll-away.js";

export type { RightAndLeftThroughParams } from "./right-and-left-through.js";
export { rightAndLeftThrough } from "./right-and-left-through.js";

export type { RobinsChainParams } from "./robins-chain.js";
export { CHAIN_JOIN_BEAT, CHAIN_PASS_PX, robinsChain } from "./robins-chain.js";

export type { BackHands, CourtesyTurn, CourtesyTurnSpec, OrbitTurnSpec } from "./courtesyTurn.js";
export {
  COURTESY_HALF_TURN,
  COURTESY_PIVOT_FROM_LARK_PX,
  ORBIT_FULL_TURN,
  courtesyBackHands,
  courtesyHold,
  courtesyTurn,
  larkAndRobin,
  orbitTurn,
} from "./courtesyTurn.js";

export type { ContraFigureId, FigureDefaultsOverride } from "./registry.js";
export {
  CONTRA_FIGURES,
  CONTRA_FIGURE_IDS,
  contraFigureList,
  contraFigureOf,
  createContraRegistry,
} from "./registry.js";

export type { ContraCall, ContraDanceSpec, ContraPhrase } from "./chain.js";
export { chainCalls, contraDance, danceEnds } from "./chain.js";

export type { TakeExtremes, TakeMotion } from "./motionBounds.js";
export {
  CONTRA_MOTION_BOUNDS,
  CONTRA_TAKE_MOTION,
  DERIVE_STEP,
  GUARD_FACTOR,
  deriveBounds,
  deriveTakeMotion,
  takeExtremes,
} from "./motionBounds.js";

export {
  REPORT_BEATS,
  REPORT_ROWS,
  figureAloneRows,
  motionReportMarkdown,
} from "./reportMotion.js";

export type { CheckOverrides, FigureChecks } from "./figureChecks.js";
export {
  CHECK_FRAME,
  CHECK_STEP,
  SET_CENTRE,
  checkGroup,
  figureChecks,
  figureTrack,
  stationAt,
} from "./figureChecks.js";

export type { KnownWrong } from "./knownWrong.js";
export { KNOWN_WRONG, isKnownWrong, knownWrongFor } from "./knownWrong.js";

export type { Contacts, FigureProbe as ContraFigureProbe } from "./testing.js";
export { PROBE_FRAME, PROBE_STEP, probeFigure, probeGroup } from "./testing.js";

export type { ContraWaitOutParams } from "./wait-out.js";
export { crossingOf, waitOut } from "./wait-out.js";
