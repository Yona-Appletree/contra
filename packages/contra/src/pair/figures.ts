// The pair figures: the five the gate-3 two-dancers spike settled, plus the
// fall back that closes the sequence, as parameterised definitions over
// `@caller/core`'s pose contract. M8 re-hosts these on `@caller/choreo`'s
// figure instances; until then they run in the local `PairFrame`.

export type { FigureDef, PairCall } from "./FigureDef.js";
export { SAMPLE_DT, pairCall, resolveParams, sampleVelocity } from "./FigureDef.js";

export type { PairPose, RolePose } from "./pairPose.js";
export { REST_FEET, pairPose } from "./pairPose.js";

export type { FigureProbe, ReachCheck } from "./armShortfall.js";
export { armShortfall, worstShortfall } from "./armShortfall.js";

export { FOLDED_ARM_PX, handForwardAngle } from "./forwardAngle.js";

export type { PoseGap } from "./poseGap.js";
export { poseGap } from "./poseGap.js";

export { trapezoid, trapezoidSpeed } from "./trapezoid.js";

export type { WalkInParams } from "./walk-in.js";
export { walkIn } from "./walk-in.js";

export type { BalanceParams } from "./balance.js";
export { BALANCE_BACK_RATIO, BALANCE_LEAN_CAP, balance, balanceRock } from "./balance.js";

export type { SwingParams } from "./swing.js";
export { swing, swingEndFacing } from "./swing.js";

export type { AllemandeParams } from "./allemande.js";
export { allemande } from "./allemande.js";

export type { DoSiDoParams } from "./do-si-do.js";
export { doSiDo } from "./do-si-do.js";

export type { FallBackParams } from "./fall-back.js";
export { fallBack } from "./fall-back.js";

import { allemande } from "./allemande.js";
import { balance } from "./balance.js";
import { doSiDo } from "./do-si-do.js";
import { fallBack } from "./fall-back.js";
import { swing } from "./swing.js";
import { walkIn } from "./walk-in.js";

/** Every pair figure, by id. */
export const PAIR_FIGURES = {
  "walk-in": walkIn,
  balance,
  swing,
  allemande,
  "do-si-do": doSiDo,
  "fall-back": fallBack,
} as const;

/** The id of one of {@link PAIR_FIGURES}. */
export type PairFigureId = keyof typeof PAIR_FIGURES;

/** Every id, in the order a page should list them. */
export const PAIR_FIGURE_IDS: readonly PairFigureId[] = [
  "walk-in",
  "balance",
  "swing",
  "allemande",
  "do-si-do",
  "fall-back",
];
