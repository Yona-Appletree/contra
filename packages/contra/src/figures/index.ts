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
