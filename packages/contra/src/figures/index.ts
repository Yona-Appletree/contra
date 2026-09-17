// The contra figure library: the figure contract every figure in
// `../library/` is interpreted into, the geometry they share, and the registry
// a decider dances from. The seventeen hand-coded figures that used to live
// here went in M11; `docs/figure-layer-retirement.md` is the map of what each
// of them became.

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
export { ringEnd, ringFor, ringHands, ringOf, ringShift, ringWalk } from "./ring.js";

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

export type { FigureDefaultsOverride } from "./registry.js";
export { contraFigureOf, createContraRegistry } from "./registry.js";

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
