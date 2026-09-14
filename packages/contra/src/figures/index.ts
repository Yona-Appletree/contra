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
  asPose,
  bearing,
  centreOf,
  contraFigure,
  holdWindow,
  isHeld,
  joinPoint,
  joinedHands,
  passRight,
  planContext,
  polar,
  spotGap,
  takeAndRelease,
  worldHand,
  worldPose,
  worldSpot,
} from "./ContraFigure.js";

export type { Pairing } from "./pairing.js";
export { NEIGHBORS, PARTNERS, mustPair, mustSpot, pairedWith, pairsOf, ringOrder } from "./pairing.js";

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
export { endFacingOf, stationHalf, swing } from "./swing.js";

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
export { robinsChain } from "./robins-chain.js";
