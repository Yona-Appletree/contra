import type { Angle } from "@caller/core";
import { angleDiff } from "@caller/core";

/** How far the head can turn off the body's facing, in degrees. */
export const HEAD_TURN_LIMIT_DEG = 55;

/**
 * Past this much off the facing, the head gives up and faces forward: a dancer
 * does not look over their own shoulder at someone behind them. Between the
 * limit and here the turn fades linearly to zero, so the head never snaps.
 */
export const HEAD_TURN_RELEASE_DEG = 115;

/**
 * The angle the head is actually drawn at, given where the figure says the
 * dancer is looking. `look` is absolute, as `PoseSample.look` is; the neck's
 * limit is the renderer's business, so a figure can say "look at your partner"
 * without knowing which way the body ended up.
 */
export function headLook(facing: Angle, look: Angle): Angle {
  const delta = angleDiff(facing, look);
  const away = Math.abs(delta);
  if (away <= HEAD_TURN_LIMIT_DEG) return facing + delta;
  if (away < HEAD_TURN_RELEASE_DEG) {
    const fade = 1 - (away - HEAD_TURN_LIMIT_DEG) / (HEAD_TURN_RELEASE_DEG - HEAD_TURN_LIMIT_DEG);
    return facing + Math.sign(delta) * HEAD_TURN_LIMIT_DEG * fade;
  }
  return facing;
}
