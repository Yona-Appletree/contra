import type { Angle, Vec2 } from "@caller/core";
import { HOLD_SPACING_PX, dirOf, leftOf } from "@caller/core";

/**
 * The frame a figure runs in: where the group sits on the floor, which way it
 * is turned, and how far apart two dancers stand when they join hands.
 *
 * Local coordinates are world px in the group's own axes: **+y runs along the
 * frame's `axis`** (down the hall for a contra set) and **+x is 90° to the left
 * of it** (across the set). `axis` is therefore the world angle local +y points
 * at, which is why a frame turned end-for-end is just `axis + 180`.
 */
export interface Frame {
  /** Where local (0, 0) sits, in world px. */
  centre: Vec2;
  /** The world angle local +y points at, in degrees. */
  axis: Angle;
  /** How far apart two dancers stand to join hands, in px. */
  spacing: number;
}

/** A frame at `centre` turned to `axis`, with the contract's hold spacing. */
export const frame = (centre: Vec2, axis: Angle, spacing: number = HOLD_SPACING_PX): Frame => ({
  centre,
  axis,
  spacing,
});

/** The same frame turned end for end: local +y now points the other way. */
export const reverseFrame = (f: Frame): Frame => ({ ...f, axis: f.axis + 180 });

/** A local point in the frame's axes, in world px. */
export function framePoint(f: Frame, local: Vec2): Vec2 {
  const along = dirOf(f.axis);
  const across = leftOf(f.axis);
  return [
    f.centre[0] + local[0] * across[0] + local[1] * along[0],
    f.centre[1] + local[0] * across[1] + local[1] * along[1],
  ];
}

/** A local angle in the frame's axes, as a world angle. */
export const frameAngle = (f: Frame, local: Angle): Angle => local + f.axis - 90;

/** A local vector (a direction or an offset, no translation) in world px. */
export function frameVector(f: Frame, local: Vec2): Vec2 {
  const along = dirOf(f.axis);
  const across = leftOf(f.axis);
  return [local[0] * across[0] + local[1] * along[0], local[0] * across[1] + local[1] * along[1]];
}

/**
 * The inverse of {@link framePoint}: a world point, in the frame's own local
 * axes.
 *
 * `along` and `across` are unit vectors at right angles, so the inverse of the
 * rotation is just the dot product against each — no matrix to invert. Needed
 * for the waiting-couple sweep (`createScriptDecider`'s gap fill): a couple
 * swept into a `"line"` call ends it in *that* call's group's frame, but the
 * gap that follows is filled in the plain waiting group's own (different)
 * frame, so `WaitOutParams.startPlaces` — which the figure reads as local px —
 * has to be re-expressed in the new frame before it means anything.
 */
export function localPoint(f: Frame, world: Vec2): Vec2 {
  const along = dirOf(f.axis);
  const across = leftOf(f.axis);
  const dx = world[0] - f.centre[0];
  const dy = world[1] - f.centre[1];
  return [dx * across[0] + dy * across[1], dx * along[0] + dy * along[1]];
}

/** The inverse of {@link frameAngle}: a world angle, in the frame's own axis. */
export const localAngle = (f: Frame, world: Angle): Angle => world - f.axis + 90;
