import type { Angle, Hand, PoseSample, Vec2 } from "@caller/core";
import { FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX } from "@caller/core";
import type { PairRole } from "../pair/PairFrame.js";
import { lookAtPartner, norm360 } from "../pair/PairFrame.js";

/** What a figure says about one dancer; everything else has a sensible default. */
export interface RolePose {
  p: Vec2;
  facing: Angle;
  hands: { L: Hand; R: Hand };
  /** Where the head looks. Defaults to the partner. */
  look?: Angle;
  lean?: number;
  stepRate?: number;
  buzz?: boolean;
  flare?: number;
  amp?: number;
  feet?: { L: Vec2; R: Vec2 };
}

/** Both dancers at one instant. */
export type PairPose = Record<PairRole, PoseSample>;

/**
 * Where the feet sit when nothing is moving them. A figure that places its own
 * feet blends out of and back into these, so a figure boundary — where every
 * figure here is momentarily still, and the renderer's quiet motion therefore
 * produces exactly this — is never a jump.
 */
export const REST_FEET: { L: Vec2; R: Vec2 } = {
  L: [FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX],
  R: [FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX],
};

/**
 * Finish two half-specified dancers into a pair of {@link PoseSample}s, filling
 * in the head look from the partner's position.
 */
export function pairPose(lark: RolePose, robin: RolePose): PairPose {
  return {
    lark: finish(lark, robin.p),
    robin: finish(robin, lark.p),
  };
}

function finish(role: RolePose, partner: Vec2): PoseSample {
  const pose: PoseSample = {
    p: role.p,
    facing: norm360(role.facing),
    look: role.look === undefined ? lookAtPartner(role.p, partner) : norm360(role.look),
    lean: role.lean ?? 0,
    hands: { L: role.hands.L, R: role.hands.R },
    stepRate: role.stepRate ?? 1,
    buzz: role.buzz ?? false,
    flare: role.flare ?? 0,
    amp: role.amp ?? 1,
  };
  return role.feet === undefined ? pose : { ...pose, feet: role.feet };
}
