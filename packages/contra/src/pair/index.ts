// The minimal two-dancer frame a pair figure runs in, and the demo sequence
// the pair page plays. M7's choreo engine replaces both; M8 re-hosts the
// figures on it.

export type { PairFrame, PairPlace, PairRole, TwoHandHold } from "./PairFrame.js";
export {
  CENTRE_DROP_PX,
  DEFAULT_PAIR_FRAME,
  HAND_DOWN_DROP_PX,
  HAND_DOWN_FORWARD_PX,
  HAND_DOWN_LATERAL_PX,
  HAND_DOWN_SWING_PX,
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
