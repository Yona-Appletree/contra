import type { Angle, PoseSample, Vec2 } from "@caller/core";

/** A dancer standing still, hands down. The base every figure starts from. */
export const standing = (p: Vec2, facing: Angle): PoseSample => ({
  p,
  facing,
  look: facing,
  lean: 0,
  hands: { L: "down", R: "down" },
  stepRate: 0,
  buzz: false,
  flare: 0,
  amp: 0,
});

/** {@link standing}, walking: one step per beat and full quiet motion. */
export const walking = (p: Vec2, facing: Angle): PoseSample => ({
  ...standing(p, facing),
  stepRate: 1,
  amp: 1,
});
