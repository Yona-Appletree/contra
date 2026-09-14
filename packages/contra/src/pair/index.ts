// The two-dancer system M5 built for gate G1: the minimal `PairFrame` a pair
// figure runs in, the six figures over it, and the demo sequence the pair page
// plays. M8's library in `../figures/` is the same dancing on `@caller/choreo`'s
// group contract; this stays as the pair page's own model, unchanged, because
// the G1 goldens and strips are pixel comparisons against it.

// The six figure definitions keep their ids and their behaviour, but the
// package exports them under `pair`-prefixed names: M8's library exports a
// `balance` and a `swing` of its own, on `@caller/choreo`'s contract, and those
// are the ones a dance calls.
export type {
  PairPose,
  PoseGap,
  RolePose,
  FigureDef,
  FigureProbe,
  PairCall,
  PairFigureId,
  ReachCheck,
} from "./figures.js";
export type {
  AllemandeParams as PairAllemandeParams,
  BalanceParams as PairBalanceParams,
  DoSiDoParams as PairDoSiDoParams,
  FallBackParams as PairFallBackParams,
  SwingParams as PairSwingParams,
  WalkInParams as PairWalkInParams,
} from "./figures.js";
export {
  BALANCE_BACK_RATIO,
  BALANCE_LEAN_CAP,
  FOLDED_ARM_PX,
  PAIR_FIGURES,
  PAIR_FIGURE_IDS,
  REST_FEET,
  SAMPLE_DT,
  armShortfall,
  balanceRock,
  handForwardAngle,
  pairCall,
  pairPose,
  poseGap,
  resolveParams,
  sampleVelocity,
  swingEndFacing,
  trapezoid,
  trapezoidSpeed,
  worstShortfall,
} from "./figures.js";
export {
  allemande as pairAllemande,
  balance as pairBalance,
  doSiDo as pairDoSiDo,
  fallBack as pairFallBack,
  swing as pairSwing,
  walkIn as pairWalkIn,
} from "./figures.js";

export type { PairFrame, PairPlace, PairRole, TwoHandHold } from "./PairFrame.js";
export {
  CENTRE_DROP_PX,
  DEFAULT_PAIR_FRAME,
  HOLD_DROP_PX,
  HOLD_LATERAL_PX,
  INSIDE_DROP_PX,
  OPEN_PAIR_HALF_PX,
  PAIR_ROLES,
  centreHand,
  handDown,
  insideHand,
  lookAtPartner,
  norm360,
  pairLinePlace,
  pairPlace,
  partnerOf,
  placeAngle,
  twoHandHold,
} from "./PairFrame.js";

export type { PairDancerSample, PairSequence, PairSequenceSample } from "./PairSequence.js";
export { DEMO_PAIR_SEQUENCE, createPairSequence } from "./PairSequence.js";
