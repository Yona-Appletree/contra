/**
 * The body's points and channels, and the screen axes they are measured in.
 *
 * Screen axes: x across, y down, z up, in px at 4 cm/px (`@caller/core`'s
 * `CM_PER_PX`). A consequence of y increasing downward: facing angle 0° is
 * +x, and the dancer's **right** is facing + 90° (turning toward +y).
 * Butter's record confirms this: the robin `1R` at y = 30 stands on the
 * right of the lark `1L` at y = 10, both facing +x.
 */

/** A body point the executor plans a trajectory for. */
export type Effector = "hip" | "footL" | "footR" | "handL" | "handR";

/** A body point the solver computes from the effectors. */
export type Joint = "shoulderL" | "shoulderR" | "elbowL" | "elbowR" | "head";

/** Any body point, planned or solved. */
export type PointName = Effector | Joint;

/** Every effector, in a fixed order. */
export const EFFECTORS: readonly Effector[] = ["hip", "footL", "footR", "handL", "handR"];

/** Every joint, in a fixed order. */
export const JOINTS: readonly Joint[] = ["shoulderL", "shoulderR", "elbowL", "elbowR", "head"];

/** Every point, effectors then joints. */
export const POINTS: readonly PointName[] = [...EFFECTORS, ...JOINTS];

/**
 * A scalar quantity carried alongside the points.
 *
 * `holdWeightL` and `holdWeightR` are how much of a hand's take has ramped in,
 * 0 (free) to 1 (fully held): the executor writes them, the body solver reads
 * them to decide how far the torso comes round to the hold.
 */
export type Channel = "facing" | "lean" | "look" | "headYaw" | "holdWeightL" | "holdWeightR";

/** Heights above the floor in px at 4 cm/px: hip 100 cm, shoulder 140 cm, head 165 cm. */
export const HEIGHTS = { hipPx: 25, shoulderPx: 35, headPx: 41 } as const;
