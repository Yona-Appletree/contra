/**
 * The rendering contract numbers from `AGENTS.md` (plan AC2 and AC3), as
 * literal constants with tests. Any change to one of these is a reversal
 * (director rubric E-look), even by a pixel.
 *
 * They live in `@caller/core` because the kinematics here are the only place
 * that can enforce them: the renderer draws what the solver returns.
 */
export const RENDERING_CONTRACT = {
  /** Upper arm, shoulder to elbow, in three dimensions. */
  upperArmPx: 7.5,
  /** Forearm, elbow to hand, in three dimensions. */
  forearmPx: 7.5,
  /** Maximum straight-arm reach: the two bones end to end. */
  armReachPx: 15,
  /** Distance between the two shoulder points. */
  shoulderWidthPx: 11,
  /** Chest to chest in a two-hand hold (about 55 cm). */
  holdSpacingPx: 14,
  /** The two lines stand this much further apart than a single pair. */
  lineOffsetPx: 18,
  /** World scale. */
  cmPerPx: 4,
  /** Foot swing amplitude on the beat, along the direction of travel. */
  footSwingPx: 2.6,
  /** Torso sway amplitude on the beat, in degrees. */
  torsoSwayDeg: 1.5,
  /** Contra glides: the beat shows as foot and shoulder motion, never bounce. */
  verticalBouncePx: 0,
  /** Sub-pixel grid positions are drawn on. */
  positionQuantumPx: 1 / 256,
  /** Length of the cross-fade between two figures. */
  seamBeats: 0.4,
} as const;

export const UPPER_ARM_PX = RENDERING_CONTRACT.upperArmPx;
export const FOREARM_PX = RENDERING_CONTRACT.forearmPx;
export const ARM_REACH_PX = RENDERING_CONTRACT.armReachPx;
export const SHOULDER_WIDTH_PX = RENDERING_CONTRACT.shoulderWidthPx;
export const HOLD_SPACING_PX = RENDERING_CONTRACT.holdSpacingPx;
export const LINE_OFFSET_PX = RENDERING_CONTRACT.lineOffsetPx;
export const CM_PER_PX = RENDERING_CONTRACT.cmPerPx;
export const FOOT_SWING_PX = RENDERING_CONTRACT.footSwingPx;
export const TORSO_SWAY_DEG = RENDERING_CONTRACT.torsoSwayDeg;
export const SEAM_BEATS = RENDERING_CONTRACT.seamBeats;

/**
 * How far forward of the body centre the shoulder line sits. Ported from the
 * two-dancers spike (`bodyPt(P, a, 0.3, ±SHW)`); it is part of look parity but
 * not one of the AC3 invariants, so it is named separately.
 */
export const SHOULDER_FORWARD_PX = 0.3;
